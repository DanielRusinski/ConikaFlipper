/**
 * Sound synthesis helper using Web Audio API for Development System UI.
 * Synthesizes crisp crystal UI audio effects and rising energy charge sounds without external assets.
 */

export class DevelopmentAudio {
  constructor() {
    this._ctx = null;
    this._chargeOsc = null;
    this._chargeGain = null;
  }

  _init() {
    if (!this._ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this._ctx = new AudioCtx();
      }
    }
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
  }

  playSelect() {
    try {
      this._init();
      if (!this._ctx) return;
      const now = this._ctx.currentTime;
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, now);
      osc.frequency.exponentialRampToValueAtTime(550, now + 0.08);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this._ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (_) {}
  }

  startCharging() {
    try {
      this._init();
      if (!this._ctx || this._chargeOsc) return;

      const now = this._ctx.currentTime;
      this._chargeOsc = this._ctx.createOscillator();
      this._chargeGain = this._ctx.createGain();

      this._chargeOsc.type = 'sawtooth';
      this._chargeOsc.frequency.setValueAtTime(220, now);
      this._chargeOsc.frequency.exponentialRampToValueAtTime(920, now + 1.2);

      this._chargeGain.gain.setValueAtTime(0.01, now);
      this._chargeGain.gain.linearRampToValueAtTime(0.12, now + 0.2);

      this._chargeOsc.connect(this._chargeGain);
      this._chargeGain.connect(this._ctx.destination);

      this._chargeOsc.start(now);
    } catch (_) {}
  }

  stopCharging() {
    try {
      if (this._chargeOsc && this._ctx) {
        const now = this._ctx.currentTime;
        this._chargeGain.gain.linearRampToValueAtTime(0.001, now + 0.05);
        this._chargeOsc.stop(now + 0.05);
        this._chargeOsc = null;
        this._chargeGain = null;
      }
    } catch (_) {
      this._chargeOsc = null;
      this._chargeGain = null;
    }
  }

  playUnlock() {
    try {
      this.stopCharging();
      this._init();
      if (!this._ctx) return;
      const now = this._ctx.currentTime;
      const chord = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C Major arpeggio + top harmonic

      chord.forEach((freq, idx) => {
        const osc = this._ctx.createOscillator();
        const gain = this._ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0.15, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.5);

        osc.connect(gain);
        gain.connect(this._ctx.destination);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.5);
      });

      // Sub-bass thump
      const subOsc = this._ctx.createOscillator();
      const subGain = this._ctx.createGain();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(140, now);
      subOsc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

      subGain.gain.setValueAtTime(0.25, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      subOsc.connect(subGain);
      subGain.connect(this._ctx.destination);

      subOsc.start(now);
      subOsc.stop(now + 0.35);
    } catch (_) {}
  }

  playStageUnlock() {
    try {
      this._init();
      if (!this._ctx) return;
      const now = this._ctx.currentTime;
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.7);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this._ctx.destination);

      osc.start(now);
      osc.stop(now + 0.7);
    } catch (_) {}
  }

  playError() {
    try {
      this.stopCharging();
      this._init();
      if (!this._ctx) return;
      const now = this._ctx.currentTime;
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.setValueAtTime(100, now + 0.1);

      gain.gain.setValueAtTime(0.10, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this._ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (_) {}
  }
}

export const developmentAudio = new DevelopmentAudio();
