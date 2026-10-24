import { eventBus } from '../core/EventBus.js';
import { resolvedStatService } from '../progression/ResolvedStatService.js';

export class ScoreSystem {
  constructor() {
    this.score = 0;
    this.yellowScore = 0;
    this.redScore = 0;
    this.yellowCoins = 0;
    this.redCoins = 0;
    this._tempMultiplier = 1;
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
          this.setMultiplier(data.card.effectValue || data.card.value || 2, data.card.duration || 30);
        }
      }),
      eventBus.on('enemy:destroyed', (data) => {
        this.addPoints(data.points || 150, 'enemy');
      }),
      eventBus.on('bumper:hit', (data) => {
        this.addPoints(data.points || 50, 'bumper');
      }),
      eventBus.on('tile:countdown_conquered', (data) => {
        const pts = (data && data.points) || 250;
        this.addPoints(pts, 'countdown_tile');
      }),
      eventBus.on('tile:multicolour_conquered', (data) => {
        const pts = (data && data.points) || 300;
        this.addPoints(pts, 'multicolour_tile');
      }),
      eventBus.on('tile:gradient_conquered', (data) => {
        const pts = (data && data.points) || 200;
        this.addPoints(pts, 'gradient_tile');
      }),
      eventBus.on('tile:green_conquered', (data) => {
        const pts = (data && data.points) || 175;
        this.addPoints(pts, 'green_tile');
      }),
      eventBus.on('score:add', (data) => {
        const pts = (data && Number.isFinite(data.points)) ? data.points : 0;
        if (pts > 0) {
          this.addPoints(pts, (data && data.reason) || 'score_add');
        }
      })
    );
  }

  addPoints(amount, source) {
    const effectiveMult = this.getMultiplier();
    const delta = amount * effectiveMult;
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
    this._tempMultiplier = value;
    this._multiplierExpiry = duration;
  }

  update(delta) {
    if (this._tempMultiplier > 1) {
      this._multiplierExpiry -= delta;
      if (this._multiplierExpiry <= 0) {
        this._tempMultiplier = 1;
        this._multiplierExpiry = 0;
      }
    }
  }

  getScore() {
    return this.score;
  }

  getMultiplier() {
    let resolvedBase = 1.0;
    try {
      resolvedBase = resolvedStatService.get('score.multiplier') || 1.0;
    } catch (e) {
      resolvedBase = 1.0;
    }
    return resolvedBase * (this._tempMultiplier || 1.0);
  }

  reset() {
    this.score = 0;
    this.yellowScore = 0;
    this.redScore = 0;
    this.yellowCoins = 0;
    this.redCoins = 0;
    this._tempMultiplier = 1;
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
