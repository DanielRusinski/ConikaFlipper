import { NODE_TYPES } from './DevelopmentConfig.js';
import { ballProgressionService } from '../progression/BallProgressionService.js';

export const NODE_STATES = {
  LOCKED: 'LOCKED',
  AVAILABLE: 'AVAILABLE',
  AFFORDABLE: 'AFFORDABLE',
  UNLOCKED: 'UNLOCKED',
  MAXED: 'MAXED',
  BLOCKED_BY_CHOICE: 'BLOCKED_BY_CHOICE'
};

export class DevelopmentEffectResolver {
  /**
   * Resolves effective gameplay modifiers for a specific ball given unlocked nodes progression.
   * Modifiers formula:
   * effective value = base value + additive modifiers, then multiplied by (1 + sum(applicable multipliers))
   *
   * @param {string} ballType - Ball ID (e.g. 'brass', 'wood', 'marble', 'chrome')
   * @param {Object} progressionState - { unlockedNodes: { [ballId]: { [nodeId]: rank } }, globalUnlockedNodes: { [nodeId]: rank } }
   * @param {DevelopmentRegistry} registry
   * @returns {Object} Calculated effective modifiers dictionary
   */
  static resolveModifiers(ballType, progressionState = {}, registry) {
    const ballKey = (ballType || 'brass').toLowerCase();

    // Default base modifiers
    const modifiers = {
      speedScaleMult: 1.0,
      controlResponsivenessMult: 1.0,
      wallRestitutionBonus: 0.0,
      scoreBonusMultiplier: 1.0,
      impactResistanceMult: 1.0,
      bumperDampeningMult: 1.0,
      enemyDamageMult: 1.0,
      startingLivesBonus: 0,
      stageTimeBonus: 0,
      magnetRadiusMult: 1.0
    };

    if (!registry || !progressionState) return modifiers;

    const ballNodes = (progressionState.unlockedNodes && progressionState.unlockedNodes[ballKey]) || {};
    const globalNodes = progressionState.globalUnlockedNodes || {};

    const additivePool = {
      wallRestitutionBonus: 0.0,
      startingLivesBonus: 0,
      stageTimeBonus: 0
    };

    const multiplierPool = {
      speedScale: 0.0,
      controlResponsiveness: 0.0,
      scoreBonusMultiplier: 0.0,
      impactResistance: 0.0,
      bumperDampening: 0.0,
      enemyDamageMult: 0.0,
      magnetRadiusMult: 0.0
    };

    // Helper to apply single node effect / canonical modifiers
    const applyNode = (nodeId, rank) => {
      const node = registry.getNode(nodeId);
      if (!node) return;

      const r = rank || 1;

      // Handle canonical array of modifiers
      if (Array.isArray(node.modifiers)) {
        for (const mod of node.modifiers) {
          const val = (mod.value || 0) * r;
          if (mod.statKey === 'ball.speedScale') {
            multiplierPool.speedScale += val;
          } else if (mod.statKey === 'ball.controlResponsiveness') {
            multiplierPool.controlResponsiveness += val;
          } else if (mod.statKey === 'ball.wallRestitution') {
            additivePool.wallRestitutionBonus += val;
          } else if (mod.statKey === 'score.multiplier') {
            multiplierPool.scoreBonusMultiplier += val;
          } else if (mod.statKey === 'ball.impactResistance') {
            multiplierPool.impactResistance += val;
          } else if (mod.statKey === 'ball.bumperDampening') {
            multiplierPool.bumperDampening += val;
          } else if (mod.statKey === 'ball.enemyDamageMultiplier') {
            multiplierPool.enemyDamageMult += val;
          } else if (mod.statKey === 'player.startingLives') {
            additivePool.startingLivesBonus += val;
          } else if (mod.statKey === 'player.stageTimeBonusSeconds') {
            additivePool.stageTimeBonus += val;
          } else if (mod.statKey === 'ball.pickupRadiusMultiplier') {
            multiplierPool.magnetRadiusMult += val;
          }
        }
      }

      // Backward compatibility with legacy effect object
      if (node.effect && node.effect.type && node.effect.target) {
        const effect = node.effect;
        const effectiveValue = (effect.value || 0) * r;

        if (effect.type === 'attribute_add') {
          if (additivePool[effect.target] !== undefined) {
            additivePool[effect.target] += effectiveValue;
          }
        } else if (effect.type === 'attribute_mult') {
          if (multiplierPool[effect.target] !== undefined) {
            multiplierPool[effect.target] += effectiveValue;
          }
        }
      }
    };

    // 1. Apply ball-specific unlocked nodes
    for (const [nodeId, rank] of Object.entries(ballNodes)) {
      applyNode(nodeId, rank);
    }

    // 2. Apply global unlocked nodes
    for (const [nodeId, rank] of Object.entries(globalNodes)) {
      applyNode(nodeId, rank);
    }

    // Construct final resolved modifiers
    modifiers.speedScaleMult = Math.max(0.5, 1.0 + multiplierPool.speedScale);
    modifiers.controlResponsivenessMult = Math.max(0.5, 1.0 + multiplierPool.controlResponsiveness);
    modifiers.wallRestitutionBonus = Math.max(0.0, additivePool.wallRestitutionBonus);
    modifiers.scoreBonusMultiplier = Math.max(1.0, 1.0 + multiplierPool.scoreBonusMultiplier);
    modifiers.impactResistanceMult = Math.max(0.2, 1.0 + multiplierPool.impactResistance);
    modifiers.bumperDampeningMult = Math.max(0.2, 1.0 + multiplierPool.bumperDampening);
    modifiers.enemyDamageMult = Math.max(1.0, 1.0 + multiplierPool.enemyDamageMult);
    modifiers.startingLivesBonus = Math.max(0, Math.floor(additivePool.startingLivesBonus));
    modifiers.stageTimeBonus = Math.max(0, Math.floor(additivePool.stageTimeBonus));
    modifiers.magnetRadiusMult = Math.max(1.0, 1.0 + multiplierPool.magnetRadiusMult);

    return modifiers;
  }

  /**
   * Evaluates the logical state of a specific node given current Skill Points and Ball Level progression.
   * Enforces Ball Level gates (Level 1, 3, 6, 9) and SP affordability (DEC_005, DEC_021).
   */
  static getNodeState(node, ballType, progressionState = {}, currentScore = 0) {
    if (!node) return NODE_STATES.LOCKED;

    const ballKey = (ballType || 'brass').toLowerCase();
    const isGlobal = node.type === NODE_TYPES.GLOBAL || node.type === NODE_TYPES.MASTERY_NODE;
    const unlockedMap = isGlobal
      ? (progressionState.globalUnlockedNodes || {})
      : ((progressionState.unlockedNodes && progressionState.unlockedNodes[ballKey]) || {});

    const currentRank = unlockedMap[node.id] || 0;
    const maxRank = node.maxRank || 1;

    if (currentRank >= maxRank) {
      return NODE_STATES.MAXED;
    }
    if (currentRank > 0) {
      return NODE_STATES.UNLOCKED;
    }

    // Check prerequisites
    const prereqs = Array.isArray(node.prerequisites) ? node.prerequisites : [];
    for (const prereqId of prereqs) {
      const isPrereqGlobal = prereqId.includes('global') || prereqId.includes('mastery');
      const prereqMap = isPrereqGlobal
        ? (progressionState.globalUnlockedNodes || {})
        : ((progressionState.unlockedNodes && progressionState.unlockedNodes[ballKey]) || {});

      const parentRank = prereqMap[prereqId] || 0;
      if (parentRank <= 0) {
        return NODE_STATES.LOCKED;
      }
    }

    // Check Ball Level gate (AT_CRYS_01 / DEC_021)
    const ballState = ballProgressionService.getBallState(ballKey);
    const requiredLevel = node.requiredBallLevel || 1;
    if (ballState && ballState.level < requiredLevel) {
      return NODE_STATES.LOCKED;
    }

    // Check SP affordability (AT_CRYS_03 / DEC_005)
    const spCost = node.spCost !== undefined ? node.spCost : 1;
    const availableSp = (ballState && ballState.availableSkillPoints !== undefined)
      ? ballState.availableSkillPoints
      : 0;

    if (availableSp >= spCost) {
      return NODE_STATES.AFFORDABLE;
    }

    return NODE_STATES.AVAILABLE;
  }
}
