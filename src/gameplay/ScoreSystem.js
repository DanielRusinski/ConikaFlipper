import { eventBus } from '../core/EventBus.js';

export class ScoreSystem {
  constructor() {
    this.score = 0;
    this.yellowScore = 0;
    this.redScore = 0;
    this.yellowCoins = 0;
    this.redCoins = 0;
    this._multiplier = 1;
    this._multiplierExpiry = 0;
    this._unsubs = [];
  }

  init() {
    this.reset();
    
    this._unsubs.push(
      eventBus.on('finding:collected', (data) => this.addPoints(data.value || 50, 'finding')),
      eventBus.on('coin:collected', (data) => {
        const val = data.value || 10;
        if (data.type === 'red') {
          this.redCoins++;
          this.redScore += val;
        } else {
          this.yellowCoins++;
          this.yellowScore += val;
        }
        this.addPoints(val, 'coin');
      }),
      eventBus.on('modifier:selected', (data) => {
        if (data.card && data.card.effectType === 'scoreMultiplier') {
          this.setMultiplier(data.card.value || 2, data.card.duration || 10);
        }
      }),
      eventBus.on('enemy:destroyed', (data) => {
        this.addPoints(data.points || 150, 'enemy');
      }),
      eventBus.on('bumper:hit', (data) => {
        this.addPoints(data.points || 50, 'bumper');
      })
    );
  }

  addPoints(amount, source) {
    const delta = amount * this._multiplier;
    this.score += delta;
    eventBus.emit('score:changed', { 
      score: this.score, 
      delta, 
      source,
      yellowScore: this.yellowScore,
      redScore: this.redScore,
      yellowCoins: this.yellowCoins,
      redCoins: this.redCoins
    });
  }

  setMultiplier(value, duration) {
    this._multiplier = value;
    this._multiplierExpiry = duration;
  }

  update(delta) {
    if (this._multiplier > 1) {
      this._multiplierExpiry -= delta;
      if (this._multiplierExpiry <= 0) {
        this._multiplier = 1;
        this._multiplierExpiry = 0;
      }
    }
  }

  getScore() {
    return this.score;
  }

  getMultiplier() {
    return this._multiplier;
  }

  reset() {
    this.score = 0;
    this.yellowScore = 0;
    this.redScore = 0;
    this.yellowCoins = 0;
    this.redCoins = 0;
    this._multiplier = 1;
    this._multiplierExpiry = 0;
    eventBus.emit('score:changed', { 
      score: this.score, 
      delta: 0, 
      source: 'reset',
      yellowScore: 0,
      redScore: 0,
      yellowCoins: 0,
      redCoins: 0
    });
  }

  dispose() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
  }
}
