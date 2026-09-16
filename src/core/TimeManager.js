class TimeManager {
  constructor() {
    this.delta = 0;
    this.gameplayDelta = 0;
    this.elapsed = 0;
    this.fps = 60;
    this._timeScale = 1;
    this._lastTimestamp = 0;
    this._frameCount = 0;
    this._fpsAccumulator = 0;
  }

  get timeScale() { return this._timeScale; }
  set timeScale(value) { this._timeScale = Math.max(0, value); }

  update(rafTimestamp) {
    if (this._lastTimestamp === 0) {
      this._lastTimestamp = rafTimestamp;
      this.delta = 0;
    } else {
      const dt = (rafTimestamp - this._lastTimestamp) / 1000;
      this.delta = Math.min(dt, 0.1); // Clamp to 0.1s max
      this._lastTimestamp = rafTimestamp;
    }

    this.elapsed += this.delta;
    this.gameplayDelta = this.delta * this._timeScale;

    this._frameCount++;
    this._fpsAccumulator += this.delta;
    if (this._fpsAccumulator >= 0.5) {
      this.fps = Math.round(this._frameCount / this._fpsAccumulator);
      this._frameCount = 0;
      this._fpsAccumulator = 0;
    }
  }

  reset() {
    this.delta = 0;
    this.gameplayDelta = 0;
    this.elapsed = 0;
    this._lastTimestamp = 0;
    this._frameCount = 0;
    this._fpsAccumulator = 0;
  }

  dispose() {
    this.reset();
  }
}

export const timeManager = new TimeManager();
