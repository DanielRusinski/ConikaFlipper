import { eventBus } from '../core/EventBus.js';

export class BallLifeSystem {
    constructor() {
        this.lives = 0;
        this._startingLives = 0;
        this._gameOverEmitted = false;
    }

    init(startingLives) {
        this._startingLives = startingLives;
        this.lives = startingLives;
        this._gameOverEmitted = false;
    }

    loseLife() {
        this.lives--;
        eventBus.emit('life:changed', { lives: this.lives, delta: -1 });
        
        if (this.lives <= 0 && !this._gameOverEmitted) {
            this._gameOverEmitted = true;
            eventBus.emit('game:over', { reason: 'outOfLives' });
        }
        return this.lives;
    }

    addLife(count) {
        this.lives += count;
        eventBus.emit('life:changed', { lives: this.lives, delta: count });
    }

    getLives() {
        return this.lives;
    }

    reset() {
        this.lives = this._startingLives;
        this._gameOverEmitted = false;
        eventBus.emit('life:changed', { lives: this.lives, delta: 0 });
    }

    dispose() {
        this.lives = 0;
        this._gameOverEmitted = false;
    }
}
