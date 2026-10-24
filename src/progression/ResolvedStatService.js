/**
 * ResolvedStatService
 * Implements the 10-stage deterministic stat resolution pipeline in SHADOW MODE (WP5).
 * Adheres strictly to:
 * - modifier-resolution-order.md
 * - canonical-stat-dictionary-proposal.csv
 * - acceptance-tests.md (AT_STAT_01 through AT_STAT_10)
 *
 * Operational rules:
 * 1. Shadow Mode: Does not mutate live runtime systems (CollisionSystem, BombSystem, etc.).
 * 2. Strict key validation: Throws UnknownStatError if an unregistered key is queried (Rule 11/12).
 * 3. 10-stage deterministic pipeline with stable modifier sorting.
 * 4. Structured resolveWithBreakdown(statKey) diagnostic contract.
 */

import { STAT_DICTIONARY } from '../config/statDictionary.js';

export class UnknownStatError extends Error {
  constructor(key) {
    super(`[ResolvedStatService] Unknown canonical stat key: "${key}". Legacy aliases and unregistered stats are prohibited.`);
    this.name = 'UnknownStatError';
  }
}

// Stage names for diagnostic tracking
export const PIPELINE_STAGES = {
  STAGE_1_BASE: '1_BASE_BALL',
  STAGE_2_BALL_LEVEL: '2_BALL_LEVEL',
  STAGE_3_CRYSTARIUM: '3_CRYSTARIUM_SKILL',
  STAGE_4_EQUIPMENT: '4_EQUIPMENT',
  STAGE_5_ACCOUNT: '5_ACCOUNT',
  STAGE_6_TEMP: '6_TEMP_MODIFIER',
  STAGE_7_USER_DEBUG: '7_USER_INPUT_DEBUG',
  STAGE_8_PRIMARY_CLAMP: '8_PRIMARY_CLAMP',
  STAGE_9_DERIVED: '9_DERIVED_CALCULATION',
  STAGE_10_FINAL_CLAMP: '10_FINAL_CLAMP_AND_COERCION'
};

export const OPERATION_ORDER = {
  ADD: 1,
  SUBTRACT: 2,
  PERCENT_ADD: 3,
  PERCENT_REDUCTION: 4,
  MULTIPLY: 5,
  MINIMUM: 6,
  MAXIMUM: 7,
  OVERRIDE: 8,
  ENABLE: 9,
  DISABLE: 10
};

// Base definitions from 03_BALLS.csv
export const BASE_BALL_DEFINITIONS = {
  brass: {
    'ball.radius': 0.0135,
    'ball.maxSpeed': 5.5,
    'ball.linearDamping': 0.1,
    'ball.speedScale': 0.150,
    'ball.wallRestitution': 0.40,
    'ball.wallFriction': 0.1,
    'ball.cornerEscapeImpulse': 0.25,
    'ball.obstacleRestitution': 0.65,
    'ball.controlResponsiveness': 1.00,
    'ball.impactResistance': 1.00,
    'ball.bumperDampening': 0.0,
    'ball.enemyDamageMultiplier': 1.00,
    'ball.pickupRadiusMultiplier': 1.00,
    'player.startingLives': 3,
    'player.stageTimeBonusSeconds': 0,
    'player.respawnCountdownSeconds': 9.0,
    'score.sessionPoints': 0,
    'score.multiplier': 1.0,
    'bomb.grantAmount': 3,
    'bomb.fallDurationSeconds': 0.32,
    'bomb.fuseDurationSeconds': 3.00,
    'bomb.blastRadiusMultiplier': 3.40,
    'bomb.selfDamageRadiusMultiplier': 0.95,
    'bomb.capacity': 2,
    'bomb.startingCount': 0,
    'bomb.selfDamageImmune': false,
    'bomb.enemyDamageMultiplier': 1.00,
    'bomb.tileCaptureRadiusMultiplier': 1.00,
    'player.maxLives': 5,
    'player.laserShieldCharges': 0,
    'player.centipedeShieldCharges': 0,
    'score.yellowCoinFlatBonus': 0,
    'score.emeraldCrystalFlatBonus': 0,
    'ability.dragonDurationSeconds': 6.0,
    'ability.laserRainDurationSeconds': 4.5,
    'hazard.laserCorridorDisabledCount': 0,
    'input.tiltSensitivity': 1.0,
    'debug.ballSpeedScaleOverride': 1.0
  },
  marble: {
    'ball.radius': 0.0135,
    'ball.maxSpeed': 5.5,
    'ball.linearDamping': 0.1,
    'ball.speedScale': 0.140,
    'ball.wallRestitution': 0.42,
    'ball.wallFriction': 0.1,
    'ball.cornerEscapeImpulse': 0.25,
    'ball.obstacleRestitution': 0.65,
    'ball.controlResponsiveness': 0.95,
    'ball.impactResistance': 1.15,
    'ball.bumperDampening': 0.0,
    'ball.enemyDamageMultiplier': 1.00,
    'ball.pickupRadiusMultiplier': 1.00,
    'player.startingLives': 3,
    'player.stageTimeBonusSeconds': 0,
    'player.respawnCountdownSeconds': 9.0,
    'score.sessionPoints': 0,
    'score.multiplier': 1.0,
    'bomb.grantAmount': 3,
    'bomb.fallDurationSeconds': 0.32,
    'bomb.fuseDurationSeconds': 3.20,
    'bomb.blastRadiusMultiplier': 3.20,
    'bomb.selfDamageRadiusMultiplier': 0.90,
    'bomb.capacity': 3,
    'bomb.startingCount': 0,
    'bomb.selfDamageImmune': false,
    'bomb.enemyDamageMultiplier': 1.00,
    'bomb.tileCaptureRadiusMultiplier': 1.00,
    'player.maxLives': 5,
    'player.laserShieldCharges': 0,
    'player.centipedeShieldCharges': 0,
    'score.yellowCoinFlatBonus': 0,
    'score.emeraldCrystalFlatBonus': 0,
    'ability.dragonDurationSeconds': 6.0,
    'ability.laserRainDurationSeconds': 4.5,
    'hazard.laserCorridorDisabledCount': 0,
    'input.tiltSensitivity': 1.0,
    'debug.ballSpeedScaleOverride': 1.0
  },
  wood: {
    'ball.radius': 0.0135,
    'ball.maxSpeed': 5.5,
    'ball.linearDamping': 0.1,
    'ball.speedScale': 0.155,
    'ball.wallRestitution': 0.38,
    'ball.wallFriction': 0.1,
    'ball.cornerEscapeImpulse': 0.25,
    'ball.obstacleRestitution': 0.65,
    'ball.controlResponsiveness': 1.12,
    'ball.impactResistance': 0.95,
    'ball.bumperDampening': 0.0,
    'ball.enemyDamageMultiplier': 1.00,
    'ball.pickupRadiusMultiplier': 1.25,
    'player.startingLives': 3,
    'player.stageTimeBonusSeconds': 0,
    'player.respawnCountdownSeconds': 9.0,
    'score.sessionPoints': 0,
    'score.multiplier': 1.0,
    'bomb.grantAmount': 3,
    'bomb.fallDurationSeconds': 0.32,
    'bomb.fuseDurationSeconds': 3.00,
    'bomb.blastRadiusMultiplier': 3.50,
    'bomb.selfDamageRadiusMultiplier': 0.95,
    'bomb.capacity': 3,
    'bomb.startingCount': 0,
    'bomb.selfDamageImmune': false,
    'bomb.enemyDamageMultiplier': 1.00,
    'bomb.tileCaptureRadiusMultiplier': 1.15,
    'player.maxLives': 5,
    'player.laserShieldCharges': 0,
    'player.centipedeShieldCharges': 0,
    'score.yellowCoinFlatBonus': 0,
    'score.emeraldCrystalFlatBonus': 0,
    'ability.dragonDurationSeconds': 6.0,
    'ability.laserRainDurationSeconds': 4.5,
    'hazard.laserCorridorDisabledCount': 0,
    'input.tiltSensitivity': 1.0,
    'debug.ballSpeedScaleOverride': 1.0
  },
  chrome: {
    'ball.radius': 0.0135,
    'ball.maxSpeed': 5.5,
    'ball.linearDamping': 0.1,
    'ball.speedScale': 0.165,
    'ball.wallRestitution': 0.44,
    'ball.wallFriction': 0.1,
    'ball.cornerEscapeImpulse': 0.25,
    'ball.obstacleRestitution': 0.65,
    'ball.controlResponsiveness': 1.08,
    'ball.impactResistance': 0.90,
    'ball.bumperDampening': 0.0,
    'ball.enemyDamageMultiplier': 1.25,
    'ball.pickupRadiusMultiplier': 1.00,
    'player.startingLives': 3,
    'player.stageTimeBonusSeconds': 0,
    'player.respawnCountdownSeconds': 9.0,
    'score.sessionPoints': 0,
    'score.multiplier': 1.0,
    'bomb.grantAmount': 3,
    'bomb.fallDurationSeconds': 0.32,
    'bomb.fuseDurationSeconds': 2.80,
    'bomb.blastRadiusMultiplier': 3.60,
    'bomb.selfDamageRadiusMultiplier': 0.95,
    'bomb.capacity': 2,
    'bomb.startingCount': 0,
    'bomb.selfDamageImmune': false,
    'bomb.enemyDamageMultiplier': 1.25,
    'bomb.tileCaptureRadiusMultiplier': 1.00,
    'player.maxLives': 5,
    'player.laserShieldCharges': 0,
    'player.centipedeShieldCharges': 0,
    'score.yellowCoinFlatBonus': 0,
    'score.emeraldCrystalFlatBonus': 0,
    'ability.dragonDurationSeconds': 6.0,
    'ability.laserRainDurationSeconds': 4.5,
    'hazard.laserCorridorDisabledCount': 0,
    'input.tiltSensitivity': 1.0,
    'debug.ballSpeedScaleOverride': 1.0
  }
};

export class ResolvedStatService {
  constructor() {
    this._selectedBallId = 'brass';
    this._modifiers = []; // Registered active modifiers across layers
    this._userTiltSensitivity = 1.0;
    this._debugBallSpeedScaleOverride = 1.0;
  }

  setSelectedBall(ballId) {
    if (ballId && BASE_BALL_DEFINITIONS[ballId.toLowerCase()]) {
      this._selectedBallId = ballId.toLowerCase();
    }
  }

  getSelectedBall() {
    return this._selectedBallId;
  }

  setUserTiltSensitivity(val) {
    if (Number.isFinite(val)) {
      this._userTiltSensitivity = Math.max(0.50, Math.min(1.50, val));
    }
  }

  getUserTiltSensitivity() {
    return this._userTiltSensitivity;
  }

  setDebugBallSpeedScaleOverride(val) {
    if (Number.isFinite(val)) {
      // In Game._updateEffectiveBallSpeedScale, debugBallSpeedScaleOverride is a multiplier factor (default 1.0)
      this._debugBallSpeedScaleOverride = Math.max(0.1, Math.min(3.0, val));
    }
  }

  getDebugBallSpeedScaleOverride() {
    return this._debugBallSpeedScaleOverride;
  }

  /**
   * Registers a modifier into the service.
   */
  addModifier(mod) {
    if (!mod || !mod.statKey) return;
    this._validateStatKey(mod.statKey);
    this._modifiers.push({
      id: mod.id || `MOD_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      statKey: mod.statKey,
      operation: mod.operation || 'ADD',
      value: mod.value !== undefined ? mod.value : 0,
      layer: mod.layer || 6, // default to Stage 6 (Temporary)
      priority: mod.priority !== undefined ? mod.priority : 0,
      sourceId: mod.sourceId || 'UNKNOWN_SOURCE',
      stackingGroup: mod.stackingGroup || null,
      stackingRule: mod.stackingRule || null
    });
  }

  clearModifiers() {
    this._modifiers = [];
  }

  reset() {
    this._selectedBallId = 'brass';
    this._modifiers = [];
    this._userTiltSensitivity = 1.0;
    this._debugBallSpeedScaleOverride = 1.0;
  }

  getModifiers() {
    return [...this._modifiers];
  }

  removeModifier(idOrSourceId) {
    this._modifiers = this._modifiers.filter(m => m.id !== idOrSourceId && m.sourceId !== idOrSourceId);
  }

  removeModifiersBySource(sourceId) {
    this._modifiers = this._modifiers.filter(m => m.sourceId !== sourceId);
  }

  /**
   * Validates if key exists in STAT_DICTIONARY.
   */
  _validateStatKey(key) {
    if (!STAT_DICTIONARY[key]) {
      throw new UnknownStatError(key);
    }
  }

  /**
   * Gets the base value for a stat given the current ball.
   */
  getBaseValue(statKey, ballId = null) {
    this._validateStatKey(statKey);
    const targetBall = (ballId || this._selectedBallId).toLowerCase();
    const ballDef = BASE_BALL_DEFINITIONS[targetBall] || BASE_BALL_DEFINITIONS.brass;

    if (ballDef[statKey] !== undefined) {
      return ballDef[statKey];
    }

    const dict = STAT_DICTIONARY[statKey];
    if (dict.dataType === 'BOOLEAN') return false;
    return dict.minClamp !== undefined ? dict.minClamp : 0;
  }

  /**
   * Primary API: Resolves stat with full breakdown diagnostic object.
   */
  resolveWithBreakdown(statKey, ballId = null) {
    this._validateStatKey(statKey);
    const statDef = STAT_DICTIONARY[statKey];
    const targetBall = (ballId || this._selectedBallId).toLowerCase();
    const baseVal = this.getBaseValue(statKey, targetBall);

    const steps = [];
    steps.push({
      layer: PIPELINE_STAGES.STAGE_1_BASE,
      sourceId: `BALL_DEF (${targetBall})`,
      operation: 'BASE',
      value: baseVal,
      runningTotal: baseVal
    });

    // Handle BOOLEAN stats
    if (statDef.dataType === 'BOOLEAN') {
      return this._resolveBoolean(statKey, baseVal, steps);
    }

    // Number/Integer Stats: Collect active modifiers
    const activeMods = this._modifiers.filter(m => m.statKey === statKey);

    // If stat is input.tiltSensitivity, apply Stage 7 user input
    if (statKey === 'input.tiltSensitivity') {
      activeMods.push({
        id: 'MOD_USER_TILT_SENSITIVITY',
        statKey,
        operation: 'OVERRIDE',
        value: this._userTiltSensitivity,
        layer: 7,
        priority: 99,
        sourceId: 'PauseScreen.userSetting'
      });
    }

    // If stat is ball.speedScale and debug override is active and non-neutral
    if (statKey === 'ball.speedScale' && this._debugBallSpeedScaleOverride !== 1.0) {
      activeMods.push({
        id: 'MOD_DEBUG_BALL_SPEED_OVERRIDE',
        statKey,
        operation: 'MULTIPLY',
        value: this._debugBallSpeedScaleOverride,
        layer: 7,
        priority: 100,
        sourceId: 'SettingsPanel.debugOverride'
      });
    }

    // Apply stacking rules (e.g. STRONGEST_ONLY for BUTTERFLY_MOVEMENT_EFFECT)
    const groupedMods = new Map();
    const finalActiveMods = [];
    for (const mod of activeMods) {
      if (mod.stackingGroup) {
        if (!groupedMods.has(mod.stackingGroup)) {
          groupedMods.set(mod.stackingGroup, []);
        }
        groupedMods.get(mod.stackingGroup).push(mod);
      } else {
        finalActiveMods.push(mod);
      }
    }

    for (const [groupName, modsInGroup] of groupedMods.entries()) {
      const stackingRule = modsInGroup[0].stackingRule || 'STRONGEST_ONLY';
      if (stackingRule === 'STRONGEST_ONLY') {
        // For MULTIPLY slowdown, strongest means smallest multiplier (e.g. 0.40 is stronger than 0.50)
        // If values are equal, pick highest priority, then first
        let strongest = modsInGroup[0];
        for (let i = 1; i < modsInGroup.length; i++) {
          const candidate = modsInGroup[i];
          if (candidate.value < strongest.value) {
            strongest = candidate;
          } else if (candidate.value === strongest.value && candidate.priority > strongest.priority) {
            strongest = candidate;
          }
        }
        finalActiveMods.push(strongest);
      } else {
        finalActiveMods.push(...modsInGroup);
      }
    }

    // Deterministic sorting per modifier-resolution-order.md:
    // 1. layer ascending
    // 2. operationOrder ascending
    // 3. priority ascending
    // 4. sourceId lexical
    // 5. id lexical
    finalActiveMods.sort((a, b) => {
      if (a.layer !== b.layer) return a.layer - b.layer;
      const opA = OPERATION_ORDER[a.operation] || 99;
      const opB = OPERATION_ORDER[b.operation] || 99;
      if (opA !== opB) return opA - opB;
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.sourceId !== b.sourceId) return a.sourceId.localeCompare(b.sourceId);
      return a.id.localeCompare(b.id);
    });

    let flatAdd = 0;
    let flatSub = 0;
    let pctAdd = 0;
    let pctRed = 0;
    let mult = 1.0;
    let activeOverride = null;
    let highestOverridePriority = -Infinity;

    for (const mod of finalActiveMods) {
      const op = mod.operation;
      const val = mod.value;

      if (op === 'ADD') {
        flatAdd += val;
      } else if (op === 'SUBTRACT') {
        flatSub += val;
      } else if (op === 'PERCENT_ADD') {
        pctAdd += val;
      } else if (op === 'PERCENT_REDUCTION') {
        pctRed += val;
      } else if (op === 'MULTIPLY') {
        mult *= val;
      } else if (op === 'OVERRIDE') {
        if (mod.priority >= highestOverridePriority) {
          activeOverride = val;
          highestOverridePriority = mod.priority;
        }
      }

      steps.push({
        layer: `STAGE_${mod.layer}`,
        sourceId: mod.sourceId,
        operation: op,
        value: val,
        runningTotal: baseVal + flatAdd - flatSub
      });
    }

    // Master combination formula
    const vFlat = baseVal + flatAdd - flatSub;
    const mPct = Math.max(0.0, 1.0 + pctAdd - pctRed);
    let preOverride = (baseVal === 0.0 && flatAdd === 0.0 && flatSub === 0.0)
      ? (pctAdd - pctRed) * mult
      : vFlat * mPct * mult;

    let postOverride = activeOverride !== null ? activeOverride : preOverride;

    // Stage 8 Primary Safety Clamps
    const minC = statDef.minClamp !== undefined ? statDef.minClamp : -Infinity;
    const maxC = statDef.maxClamp !== undefined ? statDef.maxClamp : Infinity;

    const clampedVal = Math.max(minC, Math.min(maxC, postOverride));
    const wasClamped = clampedVal !== postOverride;

    let finalVal = clampedVal;
    if (statDef.dataType === 'INTEGER') {
      finalVal = Math.round(finalVal);
    }

    return {
      statId: statDef.id,
      canonicalKey: statKey,
      unit: statDef.unit,
      baseValue: baseVal,
      steps,
      preClampValue: postOverride,
      minClamp: minC,
      maxClamp: maxC,
      wasClamped,
      finalValue: finalVal
    };
  }

  _resolveBoolean(statKey, baseVal, steps) {
    const statDef = STAT_DICTIONARY[statKey];
    const activeMods = this._modifiers.filter(m => m.statKey === statKey);

    activeMods.sort((a, b) => {
      if (a.layer !== b.layer) return a.layer - b.layer;
      const opA = OPERATION_ORDER[a.operation] || 99;
      const opB = OPERATION_ORDER[b.operation] || 99;
      if (opA !== opB) return opA - opB;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.id.localeCompare(b.id);
    });

    let currentVal = Boolean(baseVal);
    let highestDisablePriority = -Infinity;
    let highestEnablePriority = -Infinity;

    for (const mod of activeMods) {
      if (mod.operation === 'ENABLE') {
        if (mod.priority >= highestEnablePriority) {
          currentVal = true;
          highestEnablePriority = mod.priority;
        }
      } else if (mod.operation === 'DISABLE') {
        if (mod.priority >= highestDisablePriority) {
          currentVal = false;
          highestDisablePriority = mod.priority;
        }
      }
      steps.push({
        layer: `STAGE_${mod.layer}`,
        sourceId: mod.sourceId,
        operation: mod.operation,
        value: mod.value,
        runningTotal: currentVal
      });
    }

    // Safety rule: DISABLE wins ties with ENABLE
    if (highestDisablePriority >= highestEnablePriority && highestDisablePriority !== -Infinity) {
      currentVal = false;
    }

    return {
      statId: statDef.id,
      canonicalKey: statKey,
      unit: statDef.unit,
      baseValue: baseVal,
      steps,
      preClampValue: currentVal,
      minClamp: false,
      maxClamp: true,
      wasClamped: false,
      finalValue: currentVal
    };
  }

  /**
   * Helper: directly returns final resolved value.
   */
  get(statKey, ballId = null) {
    return this.resolveWithBreakdown(statKey, ballId).finalValue;
  }

  /**
   * Invalidates internal calculation caches / triggers recalculation notification
   */
  invalidateCaches() {
    // Pipeline is deterministic on-demand; notifying listeners if needed
    return true;
  }
}

export const resolvedStatService = new ResolvedStatService();
