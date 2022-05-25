/**
 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule FluxStore
 * @flow
 */

'use strict'

import type Dispatcher from 'Dispatcher'

const { EventEmitter } = require('fbemitter')

const invariant = require('invariant')

/**
 * store 基本功能，不要直接用  ，类似抽象类的功能
 * 用FluxReduceStore .
 */
class FluxStore {
  // private
  _dispatchToken: string

  // protected, available to subclasses
  __changed: boolean
  __changeEvent: string
  __className: any
  __dispatcher: Dispatcher<any>
  __emitter: EventEmitter

  constructor(dispatcher: Dispatcher<any>): void {
    this.__className = this.constructor.name // 记录构造函数的名字,即：从哪个构造函数new 出来的实例

    this.__changed = false
    this.__changeEvent = 'change'
    this.__dispatcher = dispatcher
    this.__emitter = new EventEmitter()
    this._dispatchToken = dispatcher.register(payload => {
      this.__invokeOnDispatch(payload)
    })
  }

  // 添加一个订阅
  addListener(callback: (eventType?: string) => void): { remove: () => void } {
    return this.__emitter.addListener(this.__changeEvent, callback)
  }

  // 获取dispatcher
  getDispatcher(): Dispatcher<any> {
    return this.__dispatcher
  }

  /**
   * 这会公开一个唯一的字符串来标识每个商店的注册回调。
   * 这与调度程序的 waitFor 方法一起使用，以声明性地依赖其他商店首先更新自己
   */
  getDispatchToken(): string {
    return this._dispatchToken
  }

  /**
   * 返回store在最近的dispatch期间是否发生了变化。
   */
  hasChanged(): boolean {
    invariant(this.__dispatcher.isDispatching(), '%s.hasChanged(): Must be invoked while dispatching.', this.__className)
    return this.__changed
  }

  __emitChange(): void {
    // 子类调用
    // dispatch中才能调用
    invariant(this.__dispatcher.isDispatching(), '%s.__emitChange(): Must be invoked while dispatching.', this.__className)
    this.__changed = true
  }

  /**
   * 该方法封装了调用 __onDispatch 的所有逻辑。
   * 它应该用于诸如捕获更改并在子类处理有效负载后发出它们之类的事情
   */
  __invokeOnDispatch(payload: Object): void {
    this.__changed = false
    this.__onDispatch(payload)
    if (this.__changed) {
      this.__emitter.emit(this.__changeEvent)
    }
  }

  /**
   * 在实例化期间将向调度程序注册的回调。
   * 子类必须重写此方法。 这个回调是 store 接收新数据的唯一方式
   */
  __onDispatch(payload: Object): void {
    invariant(false, '%s has not overridden FluxStore.__onDispatch(), which is required', this.__className)
  }
}

module.exports = FluxStore
