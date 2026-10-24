/**
 * SoftArcadeMusic.js
 * Procedural 60-second seamless Web Audio loop.
 * No external audio assets or libraries required.
 */
export class SoftArcadeMusic {
  constructor({ volume = 0.55 } = {}) {
    this.bpm = 96;
    this.beat = 60 / this.bpm;
    this.bar = this.beat * 4;
    this.loopLength = this.bar * 24; // exactly 60 seconds
    this.volume = Math.max(0, Math.min(1, volume));
    this.ctx = null;
    this.master = null;
    this.ambience = null;
    this.playing = false;
    this.startTime = 0;
    this.nextCycle = 0;
    this.schedulerId = null;
    this.lookAheadSeconds = 2.5;
  }

  async start() {
    if (this.playing) return;
    if (this._starting) return;
    this._starting = true;
    try {
      const AudioContextClass = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AudioContextClass) throw new Error('Web Audio API is not supported.');
      this.ctx = new AudioContextClass();
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this._createOutputBus();
      this.playing = true;
      this.startTime = this.ctx.currentTime + 0.08;
      this.nextCycle = this.startTime;
      this._scheduler();
      if (typeof window !== 'undefined' && typeof window.setInterval === 'function') {
        this.schedulerId = window.setInterval(() => this._scheduler(), 500);
      } else if (typeof setInterval === 'function') {
        this.schedulerId = setInterval(() => this._scheduler(), 500);
      }
    } finally {
      this._starting = false;
    }
  }

  async stop({ fadeSeconds = 0.4 } = {}) {
    if (!this.playing || !this.ctx) return;
    this.playing = false;
    if (this.schedulerId) {
      if (typeof window !== 'undefined' && typeof window.clearInterval === 'function') {
        window.clearInterval(this.schedulerId);
      } else if (typeof clearInterval === 'function') {
        clearInterval(this.schedulerId);
      }
      this.schedulerId = null;
    }
    const closingContext = this.ctx;
    const closingMaster = this.master;
    this.ctx = null;
    this.master = null;
    this.ambience = null;

    if (closingMaster && closingContext && closingContext.state !== 'closed') {
      try {
        const now = closingContext.currentTime;
        closingMaster.gain.cancelScheduledValues(now);
        closingMaster.gain.setValueAtTime(Math.max(closingMaster.gain.value, 0.0001), now);
        closingMaster.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
      } catch (_) {}
    }

    if (closingContext && closingContext.state !== 'closed') {
      await new Promise(resolve => {
        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
          window.setTimeout(resolve, fadeSeconds * 1000 + 80);
        } else {
          setTimeout(resolve, fadeSeconds * 1000 + 80);
        }
      });
      try {
        if (closingContext.state !== 'closed') {
          await closingContext.close();
        }
      } catch (_) {}
    }
  }

  setVolume(value, rampSeconds = 0.08) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume * 0.48, this.ctx.currentTime, rampSeconds);
    }
  }

  getPositionSeconds() {
    if (!this.playing || !this.ctx) return 0;
    return ((this.ctx.currentTime - this.startTime) % this.loopLength + this.loopLength) % this.loopLength;
  }

  _createOutputBus() {
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume * 0.48;
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 10;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.3;
    this.master.connect(compressor).connect(this.ctx.destination);

    this.ambience = this.ctx.createGain();
    this.ambience.gain.value = 0.17;
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = 0.29;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.24;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3400;
    this.ambience.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(filter).connect(this.master);
  }

  _midi(note) { return 440 * Math.pow(2, (note - 69) / 12); }

  _voice(time, note, duration, options = {}) {
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    oscillator.type = options.type || 'sine';
    oscillator.frequency.setValueAtTime(this._midi(note), time);
    oscillator.detune.value = options.detune || 0;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.cutoff || 1800, time);
    filter.Q.value = options.q || 0.8;
    const attack = options.attack ?? 0.02;
    const level = options.gain ?? 0.08;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(attack + 0.02, duration));
    oscillator.connect(filter).connect(gain).connect(this.master);
    if (options.send) gain.connect(this.ambience);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.08);
  }

  _pad(time, notes, duration) {
    notes.forEach((note, index) => this._voice(time, note, duration, {
      type: 'triangle', gain: 0.025, attack: 0.65, cutoff: 900,
      detune: (index - 1) * 3, send: true
    }));
  }

  _bass(time, note) {
    this._voice(time, note, this.bar * 0.82, { type: 'sine', gain: 0.09, attack: 0.025, cutoff: 420 });
  }

  _pluck(time, note, gain = 0.055) {
    this._voice(time, note, this.beat * 0.62, { type: 'triangle', gain, attack: 0.008, cutoff: 2200, q: 1.1, send: true });
  }

  _sparkle(time, note) {
    this._voice(time, note, this.beat * 0.35, { type: 'sine', gain: 0.025, attack: 0.004, cutoff: 4500, send: true });
  }

  _noiseHit(time, kind = 'hat') {
    const length = kind === 'kick' ? 0.18 : 0.055;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * length), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, kind === 'kick' ? 3 : 8);
    }
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    source.buffer = buffer;
    filter.type = kind === 'kick' ? 'lowpass' : 'highpass';
    filter.frequency.value = kind === 'kick' ? 180 : 5200;
    gain.gain.setValueAtTime(kind === 'kick' ? 0.07 : 0.018, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(time);
    source.stop(time + length);
    if (kind === 'kick') this._voice(time, 38, 0.16, { type: 'sine', gain: 0.11, attack: 0.002, cutoff: 190 });
  }

  _scheduleCycle(cycleStart) {
    const chords = [[57,60,64,67],[60,64,67,71],[53,57,60,64],[52,55,59,62]];
    const roots = [45,48,41,40];
    const motif = [76,81,84,83, 76,79,81,76, 72,76,81,79, 71,76,null,null];

    for (let barIndex = 0; barIndex < 24; barIndex++) {
      const time = cycleStart + barIndex * this.bar;
      const chordIndex = barIndex % 4;
      this._pad(time, chords[chordIndex], this.bar * 0.95);
      this._bass(time, roots[chordIndex]);

      if (barIndex >= 2) {
        for (let quarter = 0; quarter < 4; quarter++) {
          this._sparkle(time + quarter * this.beat, chords[chordIndex][quarter % 4] + 12);
        }
      }

      if (barIndex >= 4 && barIndex < 20) {
        const phraseBar = barIndex % 4;
        for (let step = 0; step < 4; step++) {
          const note = motif[phraseBar * 4 + step];
          if (note) this._pluck(time + step * this.beat, note);
        }
      } else if (barIndex >= 20 && barIndex < 23) {
        this._pluck(time + this.beat, [76, 72, 71][barIndex - 20], 0.04);
      }

      if (barIndex >= 8 && barIndex < 20) {
        this._noiseHit(time, 'kick');
        this._noiseHit(time + 2 * this.beat, 'kick');
        for (let eighth = 0; eighth < 8; eighth++) this._noiseHit(time + eighth * this.beat / 2, 'hat');
      }

      if (barIndex >= 16 && barIndex < 20) {
        this._pluck(time + this.beat, motif[(barIndex % 4) * 4 + 1] + 12, 0.025);
        this._sparkle(time + 3.5 * this.beat, 88);
      }
    }
  }

  _scheduler() {
    if (!this.playing || !this.ctx) return;
    while (this.nextCycle < this.ctx.currentTime + this.lookAheadSeconds) {
      this._scheduleCycle(this.nextCycle);
      this.nextCycle += this.loopLength;
    }
  }
}
