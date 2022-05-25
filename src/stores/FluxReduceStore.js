/**
 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule FluxReduceStore
 * @flow
 */

'use strict'

import type Dispatcher from 'Dispatcher'

const FluxStore = require('FluxStore')

const abstractMethod = require('abstractMethod')
const invariant = require('invariant')

/**
 * 这是 Flux 应用程序的基类。 所有的store 应该继承这个类
 *
 *   class CounterStore extends FluxReduceStore<number> {
 *     getInitialState(): number {
 *       return 1;
 *     }
 *
 *     reduce(state: number, action: Object): number {
 *       switch(action.type) {
 *         case: 'add':
 *           return state + action.value;
 *         case: 'double':
 *           return state * 2;
 *         default:
 *           return state;
 *       }
 *     }
 *   }
 */
class FluxReduceStore<TState> extends FluxStore {
  _state: TState

  constructor(dispatcher: Dispatcher<Object>) {
    super(dispatcher)
    this._state = this.getInitialState()
  }

  /**
   * 获取store 的 state。 如果你的state不是不可变的，你应该覆盖它而不是直接暴露 _state
   */
  getState(): TState {
    return this._state
  }

  /**
   * 获取初始state。 这在new store时被调用一次
   */
  getInitialState(): TState {
    return abstractMethod('FluxReduceStore', 'getInitialState')
  }

  /**
   * 用于将来自dispatcher的action减少为单个状态对象
   * dispatcher dispatch时，实际调用到这里，即reduce就是处理state的方法
   */
  reduce(state: TState, action: Object): TState {
    return abstractMethod('FluxReduceStore', 'reduce')
  }

  /**
   * 检查两个版本的state是否相同。 如果您的state是不可变的，则不需要覆盖它
   */
  areEqual(one: TState, two: TState): boolean {
    return one === two
  }

  // 调用分发,
  // 重写于父类，new store 时被dispatch registry
  // 即 dispatcher dispatch时触发
  __invokeOnDispatch(action: Object): void {
    this.__changed = false

    // action传入reduce，必要时更新
    const startingState = this._state
    const endingState = this.reduce(startingState, action)

    // This means your ending state should never be undefined.
    invariant(
      endingState !== undefined,
      '%s returned undefined from reduce(...), did you forget to return ' + 'state in the default case? (use null if this was intentional)',
      this.constructor.name
    )

    if (!this.areEqual(startingState, endingState)) {
      // 更新state
      this._state = endingState

      // __emitChange：父类的方法，__changed改为true
      this.__emitChange()
    }

    if (this.__changed) {
      // 通知所有订阅
      this.__emitter.emit(this.__changeEvent)
    }
  }
}

module.exports = FluxReduceStore
