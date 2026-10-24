/**
 * BallProgressionService
 * Implements persistent per-ball XP and Level 1–9 progression (WP8).
 * Adheres strictly to:
 * - 04_BALL_LEVELS.csv (BallLevelTable: levels 1..9, milestones, capacity unlocks)
 * - 09_XP_CURVE.csv (Monotonic XP thresholds and event bounties)
 * - 08_MODIFIERS.csv (Layer 2 modifiers for bomb.capacity at L3 and L6)
 * - Decisions: DEC_002 (active ball receives XP), DEC_003 (8 event-based persistence checkpoints, zero per-frame writes),
 *   DEC_005 (+1 SP per level-up L2..L9, 8 SP total at L9), DEC_018 (Save Schema v2 persistence).
 */

import { eventBus } from '../core/EventBus.js';
import { saveMigrationService, CANONICAL_BALL_IDS } from '../core/SaveMigrationService.js';
import { resolvedStatService } from './ResolvedStatService.js';

export const MAX_BALL_LEVEL = 9;

// Cumulative XP thresholds from 09_XP_CURVE.csv
// Level 1: 0, Level 2: 500, Level 3: 1500, Level 4: 3300, Level 5: 6100,
// Level 6: 10300, Level 7: 16300, Level 8: 24800, Level 9: 36800
export const XP_THRESHOLDS = {
  1: 0,
  2: 500,
  3: 1500,
  4: 3300,
  5: 6100,
  6: 10300,
  7: 16300,
  8: 24800,
  9: 36800
};

// Required XP delta to advance to the next level
// e.g. from Level 1 to 2 needs 500; from Level 2 to 3 needs 1000
export const REQUIRED_XP_DELTA = {
  1: 500,
  2: 1000,
  3: 1800,
  4: 2800,
  5: 4200,
  6: 6000,
  7: 8500,
  8: 12000,
  9: 0 // At Max Level
};

// Base XP bounties from 09_XP_CURVE.csv
export const XP_EVENT_BOUNTIES = {
  'tile:discovered': 5,
  'specialTile:triggered': 35,
  'enemy:destroyed:cylinder': 75,
  'enemy:destroyed:centipede_segment': 40,
  'stage:cleared': 300
};

// Layer 2 ball level modifiers from 08_MODIFIERS.csv (MOD_062 through MOD_069)
// bomb.capacity +1 at Level 3 and +1 at Level 6
export const BALL_LEVEL_MODIFIERS = {
  brass: {
    3: { id: 'MOD_062', statKey: 'bomb.capacity', operation: 'ADD', value: 1, layer: 2, sourceId: 'brass_L3' },
    6: { id: 'MOD_063', statKey: 'bomb.capacity', operation: 'ADD', value: 1, layer: 2, sourceId: 'brass_L6' }
  },
  marble: {
    3: { id: 'MOD_064', statKey: 'bomb.capacity', operation: 'ADD', value: 1, layer: 2, sourceId: 'marble_L3' },
    6: { id: 'MOD_065', statKey: 'bomb.capacity', operation: 'ADD', value: 1, layer: 2, sourceId: 'marble_L6' }
  },
  wood: {
    3: { id: 'MOD_066', statKey: 'bomb.capacity', operation: 'ADD', value: 1, layer: 2, sourceId: 'wood_L3' },
    6: { id: 'MOD_067', statKey: 'bomb.capacity', operation: 'ADD', value: 1, layer: 2, sourceId: 'wood_L6' }
  },
  chrome: {
    3: { id: 'MOD_068', statKey: 'bomb.capacity', operation: 'ADD', value: 1, layer: 2, sourceId: 'chrome_L3' },
    6: { id: 'MOD_069', statKey: 'bomb.capacity', operation: 'ADD', value: 1, layer: 2, sourceId: 'chrome_L6' }
  }
};

export class BallProgressionService {
  constructor() {
    this._saveData = null;
    this._activeBallId = 'brass';
    this._unsubs = [];
    this._initialized = false;
  }

  /**
   * Initializes service and hooks up gameplay events and persistence checkpoints.
   */
  init(initialBallId = null) {
    this.load();
    if (initialBallId && CANONICAL_BALL_IDS.includes(initialBallId.toLowerCase())) {
      this._activeBallId = initialBallId.toLowerCase();
    } else if (this._saveData && this._saveData.profile && this._saveData.profile.selectedBallId) {
      this._activeBallId = this._saveData.profile.selectedBallId.toLowerCase();
    }

    this._applyActiveBallLevelModifiers();

    // Hook up event listeners if not already done
    if (!this._initialized) {
      this._bindEvents();
      this._initialized = true;
    }
  }

  /**
   * Loads or gets Save Schema v2 from SaveMigrationService.
   */
  load() {
    const res = saveMigrationService.loadOrMigrate();
    if (res && res.save) {
      this._saveData = res.save;
    } else {
      console.warn('[BallProgressionService] Failed to load save, initializing fallback.');
    }
    return this._saveData;
  }

  /**
   * Event-based persistence checkpoint (DEC_003).
   * Writes to localStorage only upon confirmed checkpoints, never per frame.
   */
  saveCheckpoint(reason = 'checkpoint') {
    if (!this._saveData) return false;
    const ok = saveMigrationService.commitV2(this._saveData);
    if (ok) {
      eventBus.emit('progression:saved', { reason, timestamp: Date.now() });
    }
    return ok;
  }

  /**
   * Sets the actively selected ball.
   * Only the active ball earns XP (DEC_002).
   */
  setActiveBall(ballId) {
    if (!ballId) return;
    const cleanId = ballId.toLowerCase();
    if (CANONICAL_BALL_IDS.includes(cleanId)) {
      this._activeBallId = cleanId;
      resolvedStatService.setSelectedBall(cleanId);
      if (this._saveData && this._saveData.profile) {
        this._saveData.profile.selectedBallId = cleanId;
      }
      this._applyActiveBallLevelModifiers();
      this.emitBallProgressionChanged(cleanId);
    }
  }

  getActiveBall() {
    return this._activeBallId;
  }

  /**
   * Gets progression state for a ball.
   */
  getBallState(ballId = null) {
    const id = (ballId || this._activeBallId).toLowerCase();
    if (!this._saveData || !this._saveData.balls || !this._saveData.balls[id]) {
      return {
        level: 1,
        currentXp: 0,
        lifetimeXp: 0,
        availableSkillPoints: 0,
        spentSkillPoints: 0,
        unlocked: id === 'brass'
      };
    }
    return this._saveData.balls[id];
  }

  /**
   * Gets the required XP for the next level.
   * Returns 0 if at MAX_BALL_LEVEL (Level 9).
   */
  getRequiredXpForNextLevel(ballId = null) {
    const state = this.getBallState(ballId);
    return REQUIRED_XP_DELTA[state.level] || 0;
  }

  /**
   * Awards XP to the actively played ball (DEC_002).
   * Inactive balls receive 0 XP.
   * Handles multi-level jumps, excess XP carry-over, and level 9 hard cap.
   * Triggers Checkpoint 1 (XP reward confirmation) and Checkpoint 2 (Ball level-up) per DEC_003.
   */
  awardXp(amount, reason = 'gameplay') {
    const xpToAdd = Math.max(0, Math.floor(amount));
    if (xpToAdd <= 0) return { added: 0, leveledUp: false, levelsGained: 0 };

    const ballId = this._activeBallId;
    const state = this.getBallState(ballId);

    if (state.level >= MAX_BALL_LEVEL) {
      // Hard cap at Level 9: lifetime XP still accumulates or caps, but level & SP do not exceed cap
      state.lifetimeXp += xpToAdd;
      state.currentXp += xpToAdd;
      this.saveCheckpoint('xp_reward_confirmation');
      this.emitBallProgressionChanged(ballId);
      return { added: xpToAdd, leveledUp: false, levelsGained: 0, currentLevel: state.level };
    }

    state.lifetimeXp += xpToAdd;
    state.currentXp += xpToAdd;

    let levelsGained = 0;
    const previousLevel = state.level;

    // While loop handles multi-level jumps and excess XP carry-over
    while (state.level < MAX_BALL_LEVEL) {
      const required = REQUIRED_XP_DELTA[state.level];
      if (state.currentXp >= required) {
        state.currentXp -= required;
        state.level += 1;
        state.availableSkillPoints += 1; // +1 SP per level-up L2..L9 (DEC_005)
        levelsGained += 1;

        // Apply Layer 2 modifiers immediately to ResolvedStatService (AT_LVL_08)
        this._applyActiveBallLevelModifiers();

        eventBus.emit('ball:leveledUp', {
          ballId,
          level: state.level,
          previousLevel: state.level - 1,
          availableSkillPoints: state.availableSkillPoints,
          lifetimeXp: state.lifetimeXp
        });
      } else {
        break;
      }
    }

    // Checkpoint 1 & 2: Save on confirmed XP reward and level-up (DEC_003)
    this.saveCheckpoint(levelsGained > 0 ? 'ball_level_up' : 'xp_reward_confirmation');
    this.emitBallProgressionChanged(ballId);

    return {
      added: xpToAdd,
      leveledUp: levelsGained > 0,
      levelsGained,
      currentLevel: state.level,
      availableSkillPoints: state.availableSkillPoints
    };
  }

  /**
   * Applies Layer 2 (04_BALL_LEVELS) modifiers to ResolvedStatService for the active ball.
   */
  _applyActiveBallLevelModifiers() {
    const ballId = this._activeBallId;
    const state = this.getBallState(ballId);
    const level = state.level;

    // Remove any previously registered Layer 2 modifiers
    resolvedStatService.removeModifiersBySource(`${ballId}_L3`);
    resolvedStatService.removeModifiersBySource(`${ballId}_L6`);

    // Clean any other ball level modifiers currently active
    for (const b of CANONICAL_BALL_IDS) {
      resolvedStatService.removeModifiersBySource(`${b}_L3`);
      resolvedStatService.removeModifiersBySource(`${b}_L6`);
    }

    const ballDefs = BALL_LEVEL_MODIFIERS[ballId];
    if (!ballDefs) return;

    // If Level >= 3, apply Level 3 milestone (bomb.capacity +1)
    if (level >= 3 && ballDefs[3]) {
      resolvedStatService.addModifier(ballDefs[3]);
    }

    // If Level >= 6, apply Level 6 milestone (bomb.capacity +1)
    if (level >= 6 && ballDefs[6]) {
      resolvedStatService.addModifier(ballDefs[6]);
    }
  }

  /**
   * Binds to gameplay events and DEC_003 persistence checkpoints:
   * 1. XP reward confirmation
   * 2. Ball level-up
   * 3. Stage completion
   * 4. Life loss
   * 5. Pause
   * 6. Page visibility changing to hidden
   * 7. Game Over
   * 8. Explicit return to title screen
   */
  _bindEvents() {
    // Ball switch synchronization
    this._unsubs.push(
      eventBus.on('ball:typeChanged', ({ type }) => {
        if (type) {
          this.setActiveBall(type);
        }
      })
    );

    // Gameplay XP Event 1: tile:discovered (+5 XP)
    this._unsubs.push(
      eventBus.on('tile:discovered', () => {
        this.awardXp(XP_EVENT_BOUNTIES['tile:discovered'], 'tile:discovered');
      })
    );

    // Gameplay XP Event 2: special tile triggered / conquered (+35 XP)
    this._unsubs.push(
      eventBus.on('tile:special_triggered', () => {
        this.awardXp(XP_EVENT_BOUNTIES['specialTile:triggered'], 'specialTile:triggered');
      })
    );
    this._unsubs.push(
      eventBus.on('tile:multicolour_conquered', () => {
        this.awardXp(XP_EVENT_BOUNTIES['specialTile:triggered'], 'specialTile:triggered');
      })
    );
    this._unsubs.push(
      eventBus.on('tile:gradient_conquered', () => {
        this.awardXp(XP_EVENT_BOUNTIES['specialTile:triggered'], 'specialTile:triggered');
      })
    );
    this._unsubs.push(
      eventBus.on('tile:green_conquered', () => {
        this.awardXp(XP_EVENT_BOUNTIES['specialTile:triggered'], 'specialTile:triggered');
      })
    );

    // Gameplay XP Event 3: enemy:destroyed (Cylinder: +75 XP base * enemyDamageMultiplier)
    this._unsubs.push(
      eventBus.on('enemy:destroyed', () => {
        const mult = resolvedStatService.get('ball.enemyDamageMultiplier') || 1.0;
        const xp = Math.round(XP_EVENT_BOUNTIES['enemy:destroyed:cylinder'] * mult);
        this.awardXp(xp, 'enemy:destroyed:cylinder');
      })
    );

    // Gameplay XP Event 4: centipede segment destroyed (+40 XP base * enemyDamageMultiplier)
    this._unsubs.push(
      eventBus.on('centipede:segment_destroyed', () => {
        const mult = resolvedStatService.get('ball.enemyDamageMultiplier') || 1.0;
        const xp = Math.round(XP_EVENT_BOUNTIES['enemy:destroyed:centipede_segment'] * mult);
        this.awardXp(xp, 'enemy:destroyed:centipede_segment');
      })
    );

    // Gameplay XP Event 5 & Checkpoint 3: stage:completed (+300 XP and save checkpoint)
    this._unsubs.push(
      eventBus.on('stage:completed', (data) => {
        const xpAmount = (data && (data.xpBounty || data.stageXpBounty)) || XP_EVENT_BOUNTIES['stage:cleared'];
        this.awardXp(xpAmount, 'stage:cleared');
        this.saveCheckpoint('stage_completion');
      })
    );

    // Checkpoint 4: Life loss
    this._unsubs.push(
      eventBus.on('ball:lost', () => {
        this.saveCheckpoint('life_loss');
      })
    );

    // Checkpoint 5: Pause
    this._unsubs.push(
      eventBus.on('game:paused', () => {
        this.saveCheckpoint('pause');
      })
    );

    // Checkpoint 6: Page visibility changing to hidden
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          this.saveCheckpoint('page_hidden');
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      this._unsubs.push(() => {
        if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
      });
    }

    // Checkpoint 7: Game Over
    this._unsubs.push(
      eventBus.on('game:over', () => {
        this.saveCheckpoint('game_over');
      })
    );

    // Checkpoint 8: Explicit return to title screen
    this._unsubs.push(
      eventBus.on('ui:returnToTitle', () => {
        this.saveCheckpoint('return_to_title');
      })
    );
  }

  emitBallProgressionChanged(ballId) {
    const id = (ballId || this._activeBallId).toLowerCase();
    const state = this.getBallState(id);
    const requiredXp = this.getRequiredXpForNextLevel(id);

    eventBus.emit('ball:progressionChanged', {
      ballId: id,
      level: state.level,
      currentXp: state.currentXp,
      lifetimeXp: state.lifetimeXp,
      requiredXp,
      availableSkillPoints: state.availableSkillPoints,
      spentSkillPoints: state.spentSkillPoints
    });
  }

  dispose() {
    for (const unsub of this._unsubs) {
      if (typeof unsub === 'function') unsub();
    }
    this._unsubs = [];
    this._initialized = false;
  }
}

export const ballProgressionService = new BallProgressionService();
