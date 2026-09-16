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
    
    this._keydownHandler = this._onKeyDown.bind(this);
    this._keyupHandler = this._onKeyUp.bind(this);
    this._pointerdownHandler = this._onPointerDown.bind(this);
    this._pointermoveHandler = this._onPointerMove.bind(this);
    this._pointerupHandler = this._onPointerUp.bind(this);
  }

  init(canvas) {
    this._canvas = canvas;
    window.addEventListener('keydown', this._keydownHandler);
    window.addEventListener('keyup', this._keyupHandler);
    canvas.addEventListener('pointerdown', this._pointerdownHandler, { passive: false });
    canvas.addEventListener('pointermove', this._pointermoveHandler, { passive: false });
    canvas.addEventListener('pointerup', this._pointerupHandler, { passive: false });
    canvas.addEventListener('pointercancel', this._pointerupHandler, { passive: false });
  }

  isEditableTarget(element) {
    if (!element) return false;
    const tag = element.tagName.toUpperCase();
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
    e.preventDefault();
    this._pointerDown = true;
    this._pointerStartX = e.clientX;
    this._pointerStartY = e.clientY;
    this._currentPointerX = e.clientX;
    this._currentPointerY = e.clientY;
  }

  _onPointerMove(e) {
    if (!this._pointerDown) return;
    e.preventDefault();
    this._currentPointerX = e.clientX;
    this._currentPointerY = e.clientY;
  }

  _onPointerUp(e) {
    if (!this._pointerDown) return;
    e.preventDefault();
    
    // If it was a quick tap without much movement, trigger action
    const dx = e.clientX - this._pointerStartX;
    const dy = e.clientY - this._pointerStartY;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      this._triggerAction();
    }
    
    this._pointerDown = false;
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

    if (this._pointerDown) {
      const dx = this._currentPointerX - this._pointerStartX;
      const dy = this._currentPointerY - this._pointerStartY;
      const maxDrag = Math.min(window.innerWidth, window.innerHeight) * 0.25;
      
      targetTiltX = Math.max(-1, Math.min(1, dx / maxDrag));
      targetTiltY = Math.max(-1, Math.min(1, dy / maxDrag));
    } else {
      if (this.keys.a || this.keys.ArrowLeft) targetTiltX -= 1;
      if (this.keys.d || this.keys.ArrowRight) targetTiltX += 1;
      if (this.keys.w || this.keys.ArrowUp) targetTiltY -= 1;
      if (this.keys.s || this.keys.ArrowDown) targetTiltY += 1;
    }

    // Lerp towards target tilt
    const lerpSpeed = 0.15;
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
      this._canvas.removeEventListener('pointercancel', this._pointerupHandler);
    }
    this._actionCallbacks = [];
  }
}

export const inputManager = new InputManager();
