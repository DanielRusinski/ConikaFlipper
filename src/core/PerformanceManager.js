class PerformanceManager {
  constructor() {
    this.fps = 0;
    this.avgFps = 0;
    this.minFps = 999;
    this.frameTime = 0;
    this.avgFrameTime = 0;
    this._frameTimes = new Float32Array(60);
    this._index = 0;
    this._sum = 0;
    this._startTime = 0;
  }

  begin() {
    this._startTime = performance.now();
  }

  end() {
    const endTime = performance.now();
    this.frameTime = endTime - this._startTime;
    
    // Update rolling average
    this._sum -= this._frameTimes[this._index];
    this._frameTimes[this._index] = this.frameTime;
    this._sum += this.frameTime;
    this._index = (this._index + 1) % 60;
    
    this.avgFrameTime = this._sum / 60;
    
    if (this.avgFrameTime > 0) {
      this.avgFps = 1000 / this.avgFrameTime;
      this.fps = 1000 / this.frameTime;
      if (this.fps < this.minFps && this.fps > 0) {
        this.minFps = this.fps;
      }
    }
  }

  dispose() {
    this._frameTimes.fill(0);
    this.fps = 0;
    this.avgFps = 0;
    this.minFps = 999;
    this._sum = 0;
    this._index = 0;
  }
}

export const performanceManager = new PerformanceManager();
