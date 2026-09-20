import { eventBus } from './EventBus.js';

class InputManager {
  constructor() {
    this.tiltX = 0;
    this.tiltY = 0;
    this.keys = { w:false, a:false, s:false, d:false, ArrowUp:false, ArrowDown:false, ArrowLeft:false, ArrowRight:false };
    this._canvas = null;
    this._pointerDown = false;
    this._pointerStartX = 0;
    this._pointerStartY = 0;
    this._currentPointerX = 0;
    this._currentPointerY = 0;
    this._actionCallbacks = [];

    // Pointer Events tracking: unified for mouse, touchscreen, and stylus/pen
    this._activePointerId = null;
    this.pointerType = null;      // 'mouse' | 'touch' | 'pen'
    this.pointerPressure = 0;     // 0..1 (stylus / touch pressure)
    this.pointerTiltX = 0;        // degrees -90..90 (stylus tilt)
    this.pointerTiltY = 0;        // degrees -90..90 (stylus tilt)
    this.pointerTwist = 0;        // degrees 0..359 (stylus rotation)

    // Gyroscope / Device Orientation state
    this.isGyroSupported = false;
    this.isGyroActive = false;
    this.isGyroEnabled = true;
    this.isGyroPermitted = false;
    this._hasRequestedPermission = false;

    this._rawBeta = 0;
    this._rawGamma = 0;
    this._rawAlpha = 0;

    // Ergonomic handheld resting angle in portrait (~38° pitch towards user)
    this.baseBeta = 38;
    this.baseGamma = 0;
    this._hasAutoCalibrated = false;

    // Angle configuration
    this.maxTiltAngle = 18.0; // degrees deviation from base for max tilt [-1, 1]
    this.deadzone = 1.0;     // degrees deadzone to eliminate tremor
    
    this._keydownHandler = this._onKeyDown.bind(this);
    this._keyupHandler = this._onKeyUp.bind(this);
    this._pointerdownHandler = this._onPointerDown.bind(this);
    this._pointermoveHandler = this._onPointerMove.bind(this);
    this._pointerupHandler = this._onPointerUp.bind(this);
    this._pointercancelHandler = this._onPointerCancel.bind(this);
    this._orientationHandler = this._onDeviceOrientation.bind(this);
    this._screenOrientationHandler = this._onScreenOrientationChange.bind(this);
  }

  init(canvas) {
    this._canvas = canvas;
    window.addEventListener('keydown', this._keydownHandler);
    window.addEventListener('keyup', this._keyupHandler);

    // Pointer Events API: handles mouse, touchscreen, and stylus (pen) uniformly
    canvas.addEventListener('pointerdown', this._pointerdownHandler, { passive: false });
    canvas.addEventListener('pointermove', this._pointermoveHandler, { passive: false });
    canvas.addEventListener('pointerup', this._pointerupHandler, { passive: false });
    canvas.addEventListener('pointercancel', this._pointercancelHandler, { passive: false });

    // Request iOS orientation permission on any user pointerdown gesture (mouse, touch, or pen)
    const requestOnGesture = () => {
      this.requestGyroPermission();
      this.requestFullscreenAndLock();
      window.removeEventListener('pointerdown', requestOnGesture);
    };
    window.addEventListener('pointerdown', requestOnGesture, { passive: true });

    // Directly bind orientation listeners (works out of the box on Android Chrome)
    this._bindOrientationEvents();
  }

  async requestGyroPermission() {
    if (this._hasRequestedPermission) return;
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      this._hasRequestedPermission = true;
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          this.isGyroPermitted = true;
          this._bindOrientationEvents();
        } else {
          console.log('DeviceOrientation permission denied:', response);
        }
      } catch (e) {
        console.warn('DeviceOrientation requestPermission error:', e);
      }
    }
  }

  async requestFullscreenAndLock() {
    // 1. Request Fullscreen (required by Chrome on Android to lock orientation)
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      } else if (document.documentElement.webkitRequestFullscreen && !document.webkitFullscreenElement) {
        await document.documentElement.webkitRequestFullscreen();
      }
    } catch (err) {
      // Ignored if user gesture requirement fails or not supported
    }

    // 2. Lock screen orientation to portrait-primary
    try {
      if (window.screen && window.screen.orientation && typeof window.screen.orientation.lock === 'function') {
        await window.screen.orientation.lock('portrait-primary');
      }
    } catch (err) {
      try {
        if (window.screen && window.screen.orientation && typeof window.screen.orientation.lock === 'function') {
          await window.screen.orientation.lock('portrait');
        }
      } catch (err2) {
        // Not all browsers support orientation.lock
      }
    }
  }

  _bindOrientationEvents() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('deviceorientation', this._orientationHandler);
      window.addEventListener('deviceorientation', this._orientationHandler, { passive: true });
      window.removeEventListener('deviceorientationabsolute', this._orientationHandler);
      window.addEventListener('deviceorientationabsolute', this._orientationHandler, { passive: true });

      if (window.screen && window.screen.orientation) {
        window.screen.orientation.removeEventListener('change', this._screenOrientationHandler);
        window.screen.orientation.addEventListener('change', this._screenOrientationHandler);
      } else {
        window.removeEventListener('orientationchange', this._screenOrientationHandler);
        window.addEventListener('orientationchange', this._screenOrientationHandler);
      }
    }
  }

  _onDeviceOrientation(e) {
    if (e.beta === null || e.gamma === null) return;

    const wasActive = this.isGyroActive;
    this.isGyroSupported = true;
    this.isGyroActive = true;

    this._rawBeta = e.beta;
    this._rawGamma = e.gamma;
    this._rawAlpha = e.alpha || 0;

    if (!wasActive) {
      eventBus.emit('input:gyroActive', { active: true });
    }
  }

  _onScreenOrientationChange() {
    // Do NOT reset auto-calibration or wipe baseline during gameplay.
    eventBus.emit('input:screenOrientationChanged', {
      angle: this.getScreenOrientationAngle()
    });
  }

  calibrate(customBeta, customGamma) {
    if (typeof customBeta === 'number') {
      this.baseBeta = customBeta;
    } else if (this.isGyroActive && (Math.abs(this._rawBeta) > 0.01 || Math.abs(this._rawGamma) > 0.01)) {
      this.baseBeta = this._rawBeta;
    }

    if (typeof customGamma === 'number') {
      this.baseGamma = customGamma;
    } else if (this.isGyroActive && (Math.abs(this._rawBeta) > 0.01 || Math.abs(this._rawGamma) > 0.01)) {
      this.baseGamma = this._rawGamma;
    }

    this._hasAutoCalibrated = true;
    eventBus.emit('input:calibrated', { baseBeta: this.baseBeta, baseGamma: this.baseGamma });
  }

  getScreenOrientationAngle() {
    if (typeof window !== 'undefined') {
      if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
        return (window.screen.orientation.angle + 360) % 360;
      }
      if (typeof window.orientation === 'number') {
        return (window.orientation + 360) % 360;
      }
    }
    return 0;
  }

  _normalizeAngle(deg, maxAngle = 18.0, deadzone = 1.0) {
    const abs = Math.abs(deg);
    if (abs < deadzone) return 0;
    const sign = deg > 0 ? 1 : -1;
    const normalized = (abs - deadzone) / (maxAngle - deadzone);
    return sign * Math.min(1, Math.max(0, normalized));
  }

  isEditableTarget(element) {
    if (!element) return false;
    const tag = element.tagName ? element.tagName.toUpperCase() : '';
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
  }

  _onKeyDown(e) {
    if (this.isEditableTarget(e.target)) return;
    if (this.keys.hasOwnProperty(e.key)) {
      this.keys[e.key] = true;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      this._triggerAction();
    }
  }

  _onKeyUp(e) {
    if (this.isEditableTarget(e.target)) return;
    if (this.keys.hasOwnProperty(e.key)) {
      this.keys[e.key] = false;
    }
  }

  _onPointerDown(e) {
    // If target is inside UI elements or editable inputs, don't capture for board tilt/drag
    if (this.isEditableTarget(e.target) || (e.target && e.target.closest && (e.target.closest('#hud') || e.target.closest('#screens') || e.target.closest('#battle-menu-overlay') || e.target.closest('#landscape-notice')))) {
      return;
    }

    // Only track one primary pointer at a time for board tilt/drag
    if (this._activePointerId !== null && this._activePointerId !== e.pointerId) return;

    if (e.cancelable) e.preventDefault();
    this._activePointerId = e.pointerId;
    this.pointerType = e.pointerType; // 'mouse' | 'touch' | 'pen'
    this.pointerPressure = typeof e.pressure === 'number' ? e.pressure : 0.5;
    this.pointerTiltX = e.tiltX || 0;
    this.pointerTiltY = e.tiltY || 0;
    this.pointerTwist = e.twist || 0;

    this._pointerDown = true;
    this._pointerStartX = e.clientX;
    this._pointerStartY = e.clientY;
    this._currentPointerX = e.clientX;
    this._currentPointerY = e.clientY;

    // Use Pointer Capture to guarantee continuous tracking even if mouse/finger/stylus exits the canvas
    if (this._canvas && typeof this._canvas.setPointerCapture === 'function') {
      try {
        this._canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
  }

  _onPointerMove(e) {
    if (!this._pointerDown) return;
    if (this._activePointerId !== null && this._activePointerId !== e.pointerId) return;
    if (e.cancelable) e.preventDefault();

    this.pointerPressure = typeof e.pressure === 'number' ? e.pressure : 0.5;
    this.pointerTiltX = e.tiltX || 0;
    this.pointerTiltY = e.tiltY || 0;
    this.pointerTwist = e.twist || 0;

    this._currentPointerX = e.clientX;
    this._currentPointerY = e.clientY;
  }

  _onPointerUp(e) {
    if (this._activePointerId !== null && this._activePointerId !== e.pointerId) return;
    if (e.cancelable) e.preventDefault();

    // Release pointer capture
    if (this._canvas && typeof this._canvas.releasePointerCapture === 'function') {
      try {
        if (this._canvas.hasPointerCapture && this._canvas.hasPointerCapture(e.pointerId)) {
          this._canvas.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}
    }
    
    // If it was a quick tap without much movement, trigger action
    const dx = e.clientX - this._pointerStartX;
    const dy = e.clientY - this._pointerStartY;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      this._triggerAction();
    }
    
    this._pointerDown = false;
    this._activePointerId = null;
    this.pointerPressure = 0;
  }

  _onPointerCancel(e) {
    if (this._activePointerId !== null && this._activePointerId !== e.pointerId) return;

    if (this._canvas && typeof this._canvas.releasePointerCapture === 'function') {
      try {
        if (this._canvas.hasPointerCapture && this._canvas.hasPointerCapture(e.pointerId)) {
          this._canvas.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}
    }

    this._pointerDown = false;
    this._activePointerId = null;
    this.pointerPressure = 0;
  }

  _triggerAction() {
    for (const cb of this._actionCallbacks) cb();
  }

  onAction(callback) {
    this._actionCallbacks.push(callback);
    return () => {
      this._actionCallbacks = this._actionCallbacks.filter(cb => cb !== callback);
    };
  }

  isKeyDown(key) {
    return !!this.keys[key];
  }

  update() {
    let targetTiltX = 0;
    let targetTiltY = 0;

    if (this.isGyroActive && this.isGyroEnabled) {
      // Auto-calibrate baseline on initial active frames
      if (!this._hasAutoCalibrated) {
        const screenAngle = this.getScreenOrientationAngle();
        if (screenAngle === 0) {
          if (this._rawBeta >= 15 && this._rawBeta <= 65) {
            this.baseBeta = this._rawBeta;
            this.baseGamma = this._rawGamma;
          } else {
            this.baseBeta = 38;
            this.baseGamma = 0;
          }
        } else {
          this.baseBeta = this._rawBeta;
          this.baseGamma = this._rawGamma;
        }
        this._hasAutoCalibrated = true;
      }

      // Delta relative to calibrated posture
      let deltaBeta = this._rawBeta - this.baseBeta;
      let deltaGamma = this._rawGamma - this.baseGamma;

      // Clamp deltas to prevent flip-over spikes
      deltaBeta = Math.max(-45, Math.min(45, deltaBeta));
      deltaGamma = Math.max(-45, Math.min(45, deltaGamma));

      // Direct portrait mapping matching keyboard WASD:
      // Phone tilt left (deltaGamma < 0) -> targetTiltX < 0 (table tilts left, ball rolls left, like 'A')
      // Phone tilt right (deltaGamma > 0) -> targetTiltX > 0 (table tilts right, ball rolls right, like 'D')
      // Phone tilt forward/down (deltaBeta < 0) -> targetTiltY < 0 (table tilts forward, ball rolls up/forward, like 'W')
      // Phone tilt back/up (deltaBeta > 0) -> targetTiltY > 0 (table tilts back, ball rolls down, like 'S')
      targetTiltX = this._normalizeAngle(deltaGamma, this.maxTiltAngle, this.deadzone);
      targetTiltY = this._normalizeAngle(deltaBeta, this.maxTiltAngle, this.deadzone);
    } else if (this._pointerDown) {
      // Pointer drag fallback (only when gyro is not active)
      const dx = this._currentPointerX - this._pointerStartX;
      const dy = this._currentPointerY - this._pointerStartY;
      const maxDrag = Math.min(window.innerWidth, window.innerHeight) * 0.25;
      
      targetTiltX = Math.max(-1, Math.min(1, dx / maxDrag));
      targetTiltY = Math.max(-1, Math.min(1, dy / maxDrag));
    } else {
      // Keyboard fallback (WASD / Arrows)
      if (this.keys.a || this.keys.ArrowLeft) targetTiltX -= 1;
      if (this.keys.d || this.keys.ArrowRight) targetTiltX += 1;
      if (this.keys.w || this.keys.ArrowUp) targetTiltY -= 1;
      if (this.keys.s || this.keys.ArrowDown) targetTiltY += 1;
    }

    // Smooth lerp towards target tilt
    const lerpSpeed = this.isGyroActive ? 0.35 : 0.15;
    this.tiltX += (targetTiltX - this.tiltX) * lerpSpeed;
    this.tiltY += (targetTiltY - this.tiltY) * lerpSpeed;
    
    if (Math.abs(this.tiltX) < 0.001) this.tiltX = 0;
    if (Math.abs(this.tiltY) < 0.001) this.tiltY = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._keydownHandler);
    window.removeEventListener('keyup', this._keyupHandler);
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._pointerdownHandler);
      this._canvas.removeEventListener('pointermove', this._pointermoveHandler);
      this._canvas.removeEventListener('pointerup', this._pointerupHandler);
      this._canvas.removeEventListener('pointercancel', this._pointercancelHandler);
    }
    window.removeEventListener('deviceorientation', this._orientationHandler);
    window.removeEventListener('deviceorientationabsolute', this._orientationHandler);
    if (window.screen && window.screen.orientation) {
      window.screen.orientation.removeEventListener('change', this._screenOrientationHandler);
    }
    window.removeEventListener('orientationchange', this._screenOrientationHandler);
    this._actionCallbacks = [];
  }
}

export const inputManager = new InputManager();
