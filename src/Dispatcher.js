/**
 * Copyright (c) 2014-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule Dispatcher
 * @flow
 * @preventMunge
 */

'use strict'

var invariant = require('invariant')

export type DispatchToken = string

var _prefix = 'ID_'

/**
 * Dispatcher 用于将有效负载广播到已注册的回调。 这在两个方面不同于一般的 pub-sub 系统
 *
 *   1) 回调不订阅特定事件。 每个payload都被dispatch给每个注册的回调.
 *   2) 回调可以全部或部分延迟，直到其他回调被执行.
 *
 * For example, consider this hypothetical flight destination form, which
 * selects a default city when a country is selected:
 *
 *   var flightDispatcher = new Dispatcher();
 *
 *   // Keeps track of which country is selected
 *   var CountryStore = {country: null};
 *
 *   // Keeps track of which city is selected
 *   var CityStore = {city: null};
 *
 *   // Keeps track of the base flight price of the selected city
 *   var FlightPriceStore = {price: null}
 *
 * When a user changes the selected city, we dispatch the payload:
 *
 *   flightDispatcher.dispatch({
 *     actionType: 'city-update',
 *     selectedCity: 'paris'
 *   });
 *
 * This payload is digested by `CityStore`:
 *
 *   flightDispatcher.register(function(payload) {
 *     if (payload.actionType === 'city-update') {
 *       CityStore.city = payload.selectedCity;
 *     }
 *   });
 *
 * When the user selects a country, we dispatch the payload:
 *
 *   flightDispatcher.dispatch({
 *     actionType: 'country-update',
 *     selectedCountry: 'australia'
 *   });
 *
 * This payload is digested by both stores:
 *
 *   CountryStore.dispatchToken = flightDispatcher.register(function(payload) {
 *     if (payload.actionType === 'country-update') {
 *       CountryStore.country = payload.selectedCountry;
 *     }
 *   });
 *
 * When the callback to update `CountryStore` is registered, we save a reference
 * to the returned token. Using this token with `waitFor()`, we can guarantee
 * that `CountryStore` is updated before the callback that updates `CityStore`
 * needs to query its data.
 *
 *   CityStore.dispatchToken = flightDispatcher.register(function(payload) {
 *     if (payload.actionType === 'country-update') {
 *       // `CountryStore.country` may not be updated.
 *       flightDispatcher.waitFor([CountryStore.dispatchToken]);
 *       // `CountryStore.country` is now guaranteed to be updated.
 *
 *       // Select the default city for the new country
 *       CityStore.city = getDefaultCityForCountry(CountryStore.country);
 *     }
 *   });
 *
 * The usage of `waitFor()` can be chained, for example:
 *
 *   FlightPriceStore.dispatchToken =
 *     flightDispatcher.register(function(payload) {
 *       switch (payload.actionType) {
 *         case 'country-update':
 *         case 'city-update':
 *           flightDispatcher.waitFor([CityStore.dispatchToken]);
 *           FlightPriceStore.price =
 *             getFlightPriceStore(CountryStore.country, CityStore.city);
 *           break;
 *     }
 *   });
 *
 * The `country-update` payload will be guaranteed to invoke the stores'
 * registered callbacks in order: `CountryStore`, `CityStore`, then
 * `FlightPriceStore`.
 */
class Dispatcher<TPayload> {
  _callbacks: { [key: DispatchToken]: (payload: TPayload) => void }
  _isDispatching: boolean
  _isHandled: { [key: DispatchToken]: boolean }
  _isPending: { [key: DispatchToken]: boolean }
  _lastID: number
  _pendingPayload: TPayload // dispatching 时，待办的payload

  constructor() {
    this._callbacks = {} // 存储回调
    this._isDispatching = false // 是否正在分发
    this._isHandled = {} // 标记回调是否已执行
    this._isPending = {} // 标记回调是否在执行
    this._lastID = 1 // callback id
  }

  /**
   * 注册一个回调，以便在每个dispatch payload中调用。 退货
   * 返回一个id,可以在waitFor()中使用
   */
  register(callback: (payload: TPayload) => void): DispatchToken {
    var id = _prefix + this._lastID++
    this._callbacks[id] = callback
    return id
  }

  /**
   * 根据id 移除callback
   */
  unregister(id: DispatchToken): void {
    invariant(this._callbacks[id], 'Dispatcher.unregister(...): `%s` does not map to a registered callback.', id)
    delete this._callbacks[id]
  }

  /**
   * 在继续执行当前回调之前等待指定的回调被调用。
   * 此方法仅应由回调使用，以响应分发的payload
   */
  waitFor(ids: Array<DispatchToken>): void {
    // 已将开始 dispatch 才能使用waitFor
    // 即，只能用在dispatch中
    invariant(this._isDispatching, 'Dispatcher.waitFor(...): Must be invoked while dispatching.')
    for (var ii = 0; ii < ids.length; ii++) {
      var id = ids[ii]
      if (this._isPending[id]) {
        // 该回调正在执行，跳过
        invariant(this._isHandled[id], 'Dispatcher.waitFor(...): Circular dependency detected while ' + 'waiting for `%s`.', id)
        continue
      }
      invariant(this._callbacks[id], 'Dispatcher.waitFor(...): `%s` does not map to a registered callback.', id)
      // 执行waitFor传进来的回调
      this._invokeCallback(id)
    }
  }

  /**
   * dispatch 一个 payload 给所有已注册的回调
   */
  dispatch(payload: TPayload): void {
    invariant(!this._isDispatching, 'Dispatch.dispatch(...): Cannot dispatch in the middle of a dispatch.')
    // 开始 dispatch
    this._startDispatching(payload)
    try {
      for (var id in this._callbacks) {
        if (this._isPending[id]) {
          // 如果这个 callback 已经在执行了，跳过
          continue
        }
        this._invokeCallback(id)
      }
    } finally {
      // 停止 dispatch
      this._stopDispatching()
    }
  }

  /**
   * 当前的 Dispatcher 是否正在分发
   */
  isDispatching(): boolean {
    return this._isDispatching
  }

  /**
   * 执行回调.
   *
   * @internal
   */
  _invokeCallback(id: DispatchToken): void {
    this._isPending[id] = true // 标记这个 callback 正在执行
    this._callbacks[id](this._pendingPayload) // 执行callback
    this._isHandled[id] = true // 标记这个 callback 已处理
  }

  /**
   * 开始 dispatch
   *
   * @internal
   */
  _startDispatching(payload: TPayload): void {
    for (var id in this._callbacks) {
      this._isPending[id] = false // 标记这个 callback 未在执行
      this._isHandled[id] = false // 标记这个 callback 未处理
    }
    this._pendingPayload = payload // 记录当前 payload
    this._isDispatching = true // 正在dispatch
  }

  /**
   * 停止 dispatch
   *
   * @internal
   */
  _stopDispatching(): void {
    delete this._pendingPayload // 删除当前payload
    this._isDispatching = false // 改为未执行的状态
  }
}

module.exports = Dispatcher
