// inspired by react-native

'use strict';

import React from 'react';
import assign from 'object-assign';
import ReactDOM from 'react-dom';

function keyMirror(obj) {
  Object.keys(obj).forEach(k => obj[k] = k);
  return obj;
}

function copy(from, list) {
  const to = {};
  list.forEach((k) => {
    to[k] = from[k];
  });
  return to;
}

function extractSingleTouch(nativeEvent) {
  const touches = nativeEvent.touches;
  const changedTouches = nativeEvent.changedTouches;
  const hasTouches = touches && touches.length > 0;
  const hasChangedTouches = changedTouches && changedTouches.length > 0;

  return !hasTouches && hasChangedTouches ?
    changedTouches[0] :
    hasTouches ? touches[0] : nativeEvent;
}

/**
 * Touchable states.
 */
const States = keyMirror({
  NOT_RESPONDER: null,                   // Not the responder
  RESPONDER_INACTIVE_PRESS_IN: null,     // Responder, inactive, in the `PressRect`
  RESPONDER_INACTIVE_PRESS_OUT: null,    // Responder, inactive, out of `PressRect`
  RESPONDER_ACTIVE_PRESS_IN: null,       // Responder, active, in the `PressRect`
  RESPONDER_ACTIVE_PRESS_OUT: null,      // Responder, active, out of `PressRect`
  RESPONDER_ACTIVE_LONG_PRESS_IN: null,  // Responder, active, in the `PressRect`, after long press threshold
  RESPONDER_ACTIVE_LONG_PRESS_OUT: null, // Responder, active, out of `PressRect`, after long press threshold
  ERROR: null,
});

/**
 * Quick lookup map for states that are considered to be "active"
 */
const IsActive = {
  RESPONDER_ACTIVE_PRESS_OUT: true,
  RESPONDER_ACTIVE_PRESS_IN: true,
};

/**
 * Quick lookup for states that are considered to be "pressing" and are
 * therefore eligible to result in a "selection" if the press stops.
 */
const IsPressingIn = {
  RESPONDER_INACTIVE_PRESS_IN: true,
  RESPONDER_ACTIVE_PRESS_IN: true,
  RESPONDER_ACTIVE_LONG_PRESS_IN: true,
};

const IsLongPressingIn = {
  RESPONDER_ACTIVE_LONG_PRESS_IN: true,
};

/**
 * Inputs to the state machine.
 */
const Signals = keyMirror({
  DELAY: null,
  RESPONDER_GRANT: null,
  RESPONDER_RELEASE: null,
  RESPONDER_TERMINATED: null,
  ENTER_PRESS_RECT: null,
  LEAVE_PRESS_RECT: null,
  LONG_PRESS_DETECTED: null,
});

/**
 * Mapping from States x Signals => States
 */
const Transitions = {
  NOT_RESPONDER: {
    DELAY: States.ERROR,
    RESPONDER_GRANT: States.RESPONDER_INACTIVE_PRESS_IN,
    RESPONDER_RELEASE: States.ERROR,
    RESPONDER_TERMINATED: States.ERROR,
    ENTER_PRESS_RECT: States.ERROR,
    LEAVE_PRESS_RECT: States.ERROR,
    LONG_PRESS_DETECTED: States.ERROR,
  },
  RESPONDER_INACTIVE_PRESS_IN: {
    DELAY: States.RESPONDER_ACTIVE_PRESS_IN,
    RESPONDER_GRANT: States.ERROR,
    RESPONDER_RELEASE: States.NOT_RESPONDER,
    RESPONDER_TERMINATED: States.NOT_RESPONDER,
    ENTER_PRESS_RECT: States.RESPONDER_INACTIVE_PRESS_IN,
    LEAVE_PRESS_RECT: States.RESPONDER_INACTIVE_PRESS_OUT,
    LONG_PRESS_DETECTED: States.ERROR,
  },
  RESPONDER_INACTIVE_PRESS_OUT: {
    DELAY: States.RESPONDER_ACTIVE_PRESS_OUT,
    RESPONDER_GRANT: States.ERROR,
    RESPONDER_RELEASE: States.NOT_RESPONDER,
    RESPONDER_TERMINATED: States.NOT_RESPONDER,
    ENTER_PRESS_RECT: States.RESPONDER_INACTIVE_PRESS_IN,
    LEAVE_PRESS_RECT: States.RESPONDER_INACTIVE_PRESS_OUT,
    LONG_PRESS_DETECTED: States.ERROR,
  },
  RESPONDER_ACTIVE_PRESS_IN: {
    DELAY: States.ERROR,
    RESPONDER_GRANT: States.ERROR,
    RESPONDER_RELEASE: States.NOT_RESPONDER,
    RESPONDER_TERMINATED: States.NOT_RESPONDER,
    ENTER_PRESS_RECT: States.RESPONDER_ACTIVE_PRESS_IN,
    LEAVE_PRESS_RECT: States.RESPONDER_ACTIVE_PRESS_OUT,
    LONG_PRESS_DETECTED: States.RESPONDER_ACTIVE_LONG_PRESS_IN,
  },
  RESPONDER_ACTIVE_PRESS_OUT: {
    DELAY: States.ERROR,
    RESPONDER_GRANT: States.ERROR,
    RESPONDER_RELEASE: States.NOT_RESPONDER,
    RESPONDER_TERMINATED: States.NOT_RESPONDER,
    ENTER_PRESS_RECT: States.RESPONDER_ACTIVE_PRESS_IN,
    LEAVE_PRESS_RECT: States.RESPONDER_ACTIVE_PRESS_OUT,
    LONG_PRESS_DETECTED: States.ERROR,
  },
  RESPONDER_ACTIVE_LONG_PRESS_IN: {
    DELAY: States.ERROR,
    RESPONDER_GRANT: States.ERROR,
    RESPONDER_RELEASE: States.NOT_RESPONDER,
    RESPONDER_TERMINATED: States.NOT_RESPONDER,
    ENTER_PRESS_RECT: States.RESPONDER_ACTIVE_LONG_PRESS_IN,
    LEAVE_PRESS_RECT: States.RESPONDER_ACTIVE_LONG_PRESS_OUT,
    LONG_PRESS_DETECTED: States.RESPONDER_ACTIVE_LONG_PRESS_IN,
  },
  RESPONDER_ACTIVE_LONG_PRESS_OUT: {
    DELAY: States.ERROR,
    RESPONDER_GRANT: States.ERROR,
    RESPONDER_RELEASE: States.NOT_RESPONDER,
    RESPONDER_TERMINATED: States.NOT_RESPONDER,
    ENTER_PRESS_RECT: States.RESPONDER_ACTIVE_LONG_PRESS_IN,
    LEAVE_PRESS_RECT: States.RESPONDER_ACTIVE_LONG_PRESS_OUT,
    LONG_PRESS_DETECTED: States.ERROR,
  },
  error: {
    DELAY: States.NOT_RESPONDER,
    RESPONDER_GRANT: States.RESPONDER_INACTIVE_PRESS_IN,
    RESPONDER_RELEASE: States.NOT_RESPONDER,
    RESPONDER_TERMINATED: States.NOT_RESPONDER,
    ENTER_PRESS_RECT: States.NOT_RESPONDER,
    LEAVE_PRESS_RECT: States.NOT_RESPONDER,
    LONG_PRESS_DETECTED: States.NOT_RESPONDER,
  },
};

// ==== Typical Constants for integrating into UI components ====
// const HIT_EXPAND_PX = 20;
// const HIT_VERT_OFFSET_PX = 10;
const HIGHLIGHT_DELAY_MS = 130;

const PRESS_EXPAND_PX = 20;

const LONG_PRESS_THRESHOLD = 500;

const LONG_PRESS_DELAY_MS = LONG_PRESS_THRESHOLD - HIGHLIGHT_DELAY_MS;

const LONG_PRESS_ALLOWED_MOVEMENT = 10;
// Default amount "active" region protrudes beyond box

export interface ITouchable {
  disabled?: boolean;
  delayPressIn?: number;
  delayLongPress?: number;
  delayPressOut?: number;
  pressRetentionOffset?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  hitSlop?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  activeStyle?: any;
  activeClassName?: string;
  onPress?: (e?: any) => void;
  onLongPress?: (e?: any) => void;
  longPressCancelsPress?: boolean;
}

let lastClickTime = 0;

const pressDelay = 200;

function isAllowPress() {
  // avoid click penetration
  return Date.now() - lastClickTime >= pressDelay;
}

const Touchable = React.createClass<ITouchable, any>({
  getDefaultProps() {
    return {
      disabled: false,
      delayPressIn: HIGHLIGHT_DELAY_MS,
      delayLongPress: LONG_PRESS_DELAY_MS,
      delayPressOut: 100,
      pressRetentionOffset: {
        left: PRESS_EXPAND_PX,
        right: PRESS_EXPAND_PX,
        top: PRESS_EXPAND_PX,
        bottom: PRESS_EXPAND_PX,
      },
      hitSlop: undefined,
      longPressCancelsPress: true,
    };
  },

  getInitialState() {
    return {
      active: false,
    };
  },

  componentWillMount() {
    this.touchable = { touchState: undefined };
  },

  componentDidMount() {
    this.root = ReactDOM.findDOMNode(this);
  },

  componentWillReceiveProps(nextProps) {
    // disabled auto clear active state
    if (nextProps.disabled && this.state.active) {
      this.setState({
        active: false,
      });
    }
  },

  componentDidUpdate() {
    this.root = ReactDOM.findDOMNode(this);
  },

  componentWillUnmount() {
    if (this.releaseLockTimer) {
      clearTimeout(this.releaseLockTimer);
    }
    if (this.touchableDelayTimeout) {
      clearTimeout(this.touchableDelayTimeout);
    }
    if (this.longPressDelayTimeout) {
      clearTimeout(this.longPressDelayTimeout);
    }
    if (this.pressOutDelayTimeout) {
      clearTimeout(this.pressOutDelayTimeout);
    }
  },

  callChildEvent(event, e) {
    const childHandle = this.props.children.props[event];
    if (childHandle) {
      childHandle(e);
    }
  },

  onTouchStart(e) {
    this.callChildEvent('onTouchStart', e);
    this.lockMouse = true;
    if (this.releaseLockTimer) {
      clearTimeout(this.releaseLockTimer);
    }
    this.touchableHandleResponderGrant(e.nativeEvent);
  },

  onTouchMove(e) {
    this.callChildEvent('onTouchMove', e);
    this.touchableHandleResponderMove(e.nativeEvent);
  },

  onTouchEnd(e) {
    this.callChildEvent('onTouchEnd', e);
    this.releaseLockTimer = setTimeout(() => {
      this.lockMouse = false;
    }, 300);
    this.touchableHandleResponderRelease(e.nativeEvent);
  },

  onTouchCancel(e) {
    this.callChildEvent('onTouchCancel', e);
    this.releaseLockTimer = setTimeout(() => {
      this.lockMouse = false;
    }, 300);
    this.touchableHandleResponderTerminate(e.nativeEvent);
  },

  onMouseDown(e) {
    this.callChildEvent('onMouseDown', e);
    if (this.lockMouse) {
      return;
    }
    this.touchableHandleResponderGrant(e.nativeEvent);
    document.addEventListener('mousemove', this.touchableHandleResponderMove, false);
    document.addEventListener('mouseup', this.onMouseUp, false);
  },

  onMouseUp(e) {
    document.removeEventListener('mousemove', this.touchableHandleResponderMove, false);
    document.removeEventListener('mouseup', this.onMouseUp, false);
    this.touchableHandleResponderRelease(e);
  },

  _remeasureMetricsOnInit(e) {
    const { root } = this;
    const touch = extractSingleTouch(e);
    const boundingRect = root.getBoundingClientRect();
    this.touchable = {
      touchState: this.touchable.touchState,
      startMouse: {
        pageX: touch.pageX,
        pageY: touch.pageY,
      },
      positionOnGrant: {
        left: boundingRect.left + window.pageXOffset,
        top: boundingRect.top + window.pageYOffset,
        width: boundingRect.width,
        height: boundingRect.height,
        clientLeft: boundingRect.left,
        clientTop: boundingRect.top,
      },
    };
  },

  touchableHandleResponderGrant(e) {
    this.touchable.touchState = States.NOT_RESPONDER;

    if (this.pressOutDelayTimeout) {
      clearTimeout(this.pressOutDelayTimeout);
      this.pressOutDelayTimeout = null;
    }

    if (this.props.fixClickPenetration && !isAllowPress()) {
      return;
    }

    this._remeasureMetricsOnInit(e);

    this._receiveSignal(Signals.RESPONDER_GRANT, e);
    const delayMS = this.props.delayPressIn;
    if (delayMS) {
      this.touchableDelayTimeout = setTimeout(
        () => {
          this._handleDelay(e);
        },
        delayMS,
      );
    } else {
      this._handleDelay(e);
    }

    const longDelayMS = this.props.delayLongPress;
    this.longPressDelayTimeout = setTimeout(
      () => {
        this._handleLongDelay(e);
      },
      longDelayMS + delayMS,
    );
  },

  checkScroll(e) {
    const positionOnGrant = this.touchable.positionOnGrant;
    // container or window scroll
    const boundingRect = this.root.getBoundingClientRect();
    if (boundingRect.left !== positionOnGrant.clientLeft || boundingRect.top !== positionOnGrant.clientTop) {
      this._receiveSignal(Signals.RESPONDER_TERMINATED, e);
      return false;
    }
  },

  touchableHandleResponderRelease(e) {
    if (!this.touchable.startMouse) {
      return;
    }
    const touch = extractSingleTouch(e);
    if (Math.abs(touch.pageX - this.touchable.startMouse.pageX) > 30 ||
      Math.abs(touch.pageY - this.touchable.startMouse.pageY) > 30
    ) {
      this._receiveSignal(Signals.RESPONDER_TERMINATED, e);
      return;
    }
    if (this.checkScroll(e) === false) {
      return;
    }
    this._receiveSignal(Signals.RESPONDER_RELEASE, e);
  },

  touchableHandleResponderTerminate(e) {
    if (!this.touchable.startMouse) {
      return;
    }
    this._receiveSignal(Signals.RESPONDER_TERMINATED, e);
  },

  checkTouchWithinActive(e) {
    const { positionOnGrant } = this.touchable;
    const { pressRetentionOffset, hitSlop } = this.props;

    let pressExpandLeft = pressRetentionOffset.left;
    let pressExpandTop = pressRetentionOffset.top;
    let pressExpandRight = pressRetentionOffset.right;
    let pressExpandBottom = pressRetentionOffset.bottom;

    if (hitSlop) {
      pressExpandLeft += hitSlop.left;
      pressExpandTop += hitSlop.top;
      pressExpandRight += hitSlop.right;
      pressExpandBottom += hitSlop.bottom;
    }

    const touch = extractSingleTouch(e);
    const pageX = touch && touch.pageX;
    const pageY = touch && touch.pageY;
    return (
      pageX > positionOnGrant.left - pressExpandLeft &&
      pageY > positionOnGrant.top - pressExpandTop &&
      pageX <
      positionOnGrant.left +
      positionOnGrant.width +
      pressExpandRight &&
      pageY <
      positionOnGrant.top +
      positionOnGrant.height +
      pressExpandBottom
    );
  },

  touchableHandleResponderMove(e) {
    if (!this.touchable.startMouse) {
      return;
    }
    // Measurement may not have returned yet.
    if (!this.touchable.dimensionsOnActivate ||
      this.touchable.touchState === States.NOT_RESPONDER) {
      return;
    }

    // Not enough time elapsed yet, wait for highlight -
    // this is just a perf optimization.
    if (this.touchable.touchState === States.RESPONDER_INACTIVE_PRESS_IN) {
      return;
    }

    const touch = extractSingleTouch(e);

    const pageX = touch && touch.pageX;
    const pageY = touch && touch.pageY;

    if (this.pressInLocation) {
      const movedDistance = this._getDistanceBetweenPoints(pageX, pageY,
        this.pressInLocation.pageX, this.pressInLocation.pageY);
      if (movedDistance > LONG_PRESS_ALLOWED_MOVEMENT) {
        this._cancelLongPressDelayTimeout();
      }
    }
    if (this.checkTouchWithinActive(e)) {
      this._receiveSignal(Signals.ENTER_PRESS_RECT, e);
      const curState = this.touchable.touchState;
      if (curState === States.RESPONDER_INACTIVE_PRESS_IN) {
        this._cancelLongPressDelayTimeout();
      }
    } else {
      this._cancelLongPressDelayTimeout();
      this._receiveSignal(Signals.LEAVE_PRESS_RECT, e);
    }
  },

  callProp(name, e) {
    if (this.props[name] && !this.props.disabled) {
      this.props[name](e);
    }
  },

  touchableHandleActivePressIn(e) {
    this.setActive(true);
    this.callProp('onPressIn', e);
  },

  touchableHandleActivePressOut(e) {
    this.setActive(false);
    this.callProp('onPressOut', e);
  },

  touchableHandlePress(e) {
    this.callProp('onPress', e);
    lastClickTime = Date.now();
  },

  touchableHandleLongPress(e) {
    this.callProp('onLongPress', e);
  },

  setActive(active) {
    if (this.props.activeClassName || this.props.activeStyle) {
      this.setState({
        active,
      });
    }
  },

  _remeasureMetricsOnActivation() {
    this.touchable.dimensionsOnActivate = this.touchable.positionOnGrant;
  },

  _handleDelay(e) {
    this.touchableDelayTimeout = null;
    this._receiveSignal(Signals.DELAY, e);
  },

  _handleLongDelay(e) {
    this.longPressDelayTimeout = null;
    const curState = this.touchable.touchState;
    if (curState !== States.RESPONDER_ACTIVE_PRESS_IN &&
      curState !== States.RESPONDER_ACTIVE_LONG_PRESS_IN) {
      console.error('Attempted to transition from state `' + curState + '` to `' +
        States.RESPONDER_ACTIVE_LONG_PRESS_IN + '`, which is not supported. This is ' +
        'most likely due to `Touchable.longPressDelayTimeout` not being cancelled.');
    } else {
      this._receiveSignal(Signals.LONG_PRESS_DETECTED, e);
    }
  },

  _receiveSignal(signal, e) {
    const curState = this.touchable.touchState;
    const nextState = Transitions[curState] && Transitions[curState][signal];
    if (!nextState) {
      return;
    }
    if (nextState === States.ERROR) {
      return;
    }
    if (curState !== nextState) {
      this._performSideEffectsForTransition(curState, nextState, signal, e);
      this.touchable.touchState = nextState;
    }
  },

  _cancelLongPressDelayTimeout() {
    if (this.longPressDelayTimeout) {
      clearTimeout(this.longPressDelayTimeout);
      this.longPressDelayTimeout = null;
    }
  },

  _isHighlight(state) {
    return state === States.RESPONDER_ACTIVE_PRESS_IN ||
      state === States.RESPONDER_ACTIVE_LONG_PRESS_IN;
  },

  _savePressInLocation(e) {
    const touch = extractSingleTouch(e);
    const pageX = touch && touch.pageX;
    const pageY = touch && touch.pageY;
    this.pressInLocation = { pageX, pageY };
  },

  _getDistanceBetweenPoints(aX, aY, bX, bY) {
    const deltaX = aX - bX;
    const deltaY = aY - bY;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  },

  _performSideEffectsForTransition(curState, nextState, signal, e) {
    const curIsHighlight = this._isHighlight(curState);
    const newIsHighlight = this._isHighlight(nextState);

    const isFinalSignal =
      signal === Signals.RESPONDER_TERMINATED ||
      signal === Signals.RESPONDER_RELEASE;

    if (isFinalSignal) {
      this._cancelLongPressDelayTimeout();
    }

    if (!IsActive[curState] && IsActive[nextState]) {
      this._remeasureMetricsOnActivation();
    }

    if (IsPressingIn[curState] && signal === Signals.LONG_PRESS_DETECTED) {
      this.touchableHandleLongPress(e);
    }

    if (newIsHighlight && !curIsHighlight) {
      this._startHighlight(e);
    } else if (!newIsHighlight && curIsHighlight) {
      this._endHighlight(e);
    }

    if (IsPressingIn[curState] && signal === Signals.RESPONDER_RELEASE) {
      const hasLongPressHandler = !!this.props.onLongPress;
      const pressIsLongButStillCallOnPress =
        IsLongPressingIn[curState] && (    // We *are* long pressing..
          !hasLongPressHandler ||          // But either has no long handler
          !this.props.longPressCancelsPress // or we're told to ignore it.
        );

      const shouldInvokePress = !IsLongPressingIn[curState] || pressIsLongButStillCallOnPress;
      if (shouldInvokePress) {
        if (!newIsHighlight && !curIsHighlight) {
          // we never highlighted because of delay, but we should highlight now
          this._startHighlight(e);
          this._endHighlight(e);
        }
        this.touchableHandlePress(e);
      }
    }

    if (this.touchableDelayTimeout) {
      clearTimeout(this.touchableDelayTimeout);
      this.touchableDelayTimeout = null;
    }
  },

  _startHighlight(e) {
    this._savePressInLocation(e);
    this.touchableHandleActivePressIn(e);
  },

  _endHighlight(e) {
    if (this.props.delayPressOut) {
      this.pressOutDelayTimeout = setTimeout(() => {
        this.touchableHandleActivePressOut(e);
      }, this.props.delayPressOut);
    } else {
      this.touchableHandleActivePressOut(e);
    }
  },

  render() {
    const { children, disabled, activeStyle, activeClassName } = this.props;
    const events = disabled ? undefined :
      copy(this, [
        'onTouchStart',
        'onTouchMove',
        'onTouchEnd',
        'onTouchCancel',
        'onMouseDown',
      ]);
    const child = React.Children.only(children);
    if (!disabled && this.state.active) {
      let { style, className } = child.props;
      if (activeStyle) {
        style = assign({}, style, activeStyle);
      }
      if (activeClassName) {
        if (className) {
          className += ` ${activeClassName}`;
        } else {
          className = activeClassName;
        }
      }
      return React.cloneElement(child, assign({
        className,
        style,
      }, events));
    }
    return React.cloneElement(child, events);
  },
});

export default Touchable;
