import { developmentRegistry } from './DevelopmentRegistry.js';
import { DevelopmentEffectResolver, NODE_STATES } from './DevelopmentEffectResolver.js';
import { DevelopmentValidator, UNLOCK_REJECTION_REASONS } from './DevelopmentValidator.js';
import { NODE_TYPES } from './DevelopmentConfig.js';
import { eventBus } from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { saveMigrationService } from '../core/SaveMigrationService.js';
import { ballProgressionService } from '../progression/BallProgressionService.js';
import { resolvedStatService } from '../progression/ResolvedStatService.js';

export class DevelopmentService {
  constructor() {
    this._storageKey = 'opt_flipper_development_progression';
    this._progression = {
      version: 2,
      maxUnlockedStage: 1, // Default starting unlocked development stage
      unlockedNodes: {}, // { [ballId]: { [nodeId]: rank } }
      globalUnlockedNodes: {}, // { [nodeId]: rank }
      selectedBallId: 'brass'
    };
    this._chargeProgress = new Map(); // nodeId -> 0.0 - 1.0

    this._registry = developmentRegistry;
    this._scoreSystem = null;
    this._inventorySystem = null;
    this._isTransactionActive = false;
    this._unsubs = [];
  }

  init(scoreSystem = null, inventorySystem = null) {
    this._scoreSystem = scoreSystem;
    this._inventorySystem = inventorySystem;

    // Initialize registry with canonical trees
    this._registry.init();

    // Load persisted progression
    this.load();

    // Apply active ball Layer 3 modifiers to ResolvedStatService
    this.syncCrystariumModifiersToStatService();

    // Listen to ball changes
    this._unsubs.push(
      eventBus.on('ball:typeChanged', ({ type }) => {
        if (type) {
          const lower = type.toLowerCase();
          this._progression.selectedBallId = lower;
          this.syncCrystariumModifiersToStatService(lower);
          this.applyModifiersToGame(lower);
        }
      })
    );
  }

  setScoreSystem(scoreSystem) {
    this._scoreSystem = scoreSystem;
  }

  setInventorySystem(inventorySystem) {
    this._inventorySystem = inventorySystem;
  }

  getSelectedBall() {
    if (this._inventorySystem && typeof this._inventorySystem.getSelectedBall === 'function') {
      return this._inventorySystem.getSelectedBall();
    }
    return this._progression.selectedBallId || 'brass';
  }

  setSelectedBall(ballId) {
    const lower = (ballId || 'brass').toLowerCase();
    this._progression.selectedBallId = lower;
    if (this._inventorySystem && typeof this._inventorySystem.setSelectedBall === 'function') {
      this._inventorySystem.setSelectedBall(lower);
    }
    this.save();
    this.syncCrystariumModifiersToStatService(lower);
    this.applyModifiersToGame(lower);
  }

  getAvailableScore() {
    if (this._scoreSystem && typeof this._scoreSystem.getScore === 'function') {
      return this._scoreSystem.getScore();
    }
    return 0;
  }

  getTree(ballId) {
    const targetBall = ballId || this.getSelectedBall();
    return this._registry.getTree(targetBall);
  }

  getNode(nodeId) {
    return this._registry.getNode(nodeId);
  }

  getNodeState(nodeId, ballId = null) {
    const targetBall = ballId || this.getSelectedBall();
    const node = this._registry.getNode(nodeId);
    if (!node) return NODE_STATES.LOCKED;

    const currentScore = this.getAvailableScore();
    return DevelopmentEffectResolver.getNodeState(node, targetBall, this._progression, currentScore);
  }

  getMaxUnlockedStage() {
    return this._progression.maxUnlockedStage || 1;
  }

  setMaxUnlockedStage(stage) {
    this._progression.maxUnlockedStage = Math.max(1, Math.min(10, Number(stage) || 1));
    this.save();
    eventBus.emit('development:stageChanged', { stage: this._progression.maxUnlockedStage });
  }

  advanceStage() {
    const cur = this.getMaxUnlockedStage();
    if (cur < 10) {
      this.setMaxUnlockedStage(cur + 1);
    }
    return this.getMaxUnlockedStage();
  }

  getChargeProgress(nodeId) {
    return this._chargeProgress.get(nodeId) || 0;
  }

  setChargeProgress(nodeId, progress) {
    this._chargeProgress.set(nodeId, Math.max(0, Math.min(1, progress)));
  }

  resetChargeProgress(nodeId = null) {
    if (nodeId) {
      this._chargeProgress.delete(nodeId);
    } else {
      this._chargeProgress.clear();
    }
  }

  getNodeRank(nodeId, ballId = null) {
    const targetBall = (ballId || this.getSelectedBall()).toLowerCase();
    const node = this._registry.getNode(nodeId);
    if (!node) return 0;

    if (node.type === NODE_TYPES.GLOBAL || node.type === NODE_TYPES.MASTERY_NODE) {
      return this._progression.globalUnlockedNodes[nodeId] || 0;
    }
    const ballMap = this._progression.unlockedNodes[targetBall];
    return (ballMap && ballMap[nodeId]) || 0;
  }

  getModifiers(ballId = null) {
    const targetBall = ballId || this.getSelectedBall();
    return DevelopmentEffectResolver.resolveModifiers(targetBall, this._progression, this._registry);
  }

  /**
   * Applies the current active ball progression modifiers to the game runtime subsystems.
   */
  applyModifiersToGame(ballId = null) {
    const targetBall = ballId || this.getSelectedBall();
    const mods = this.getModifiers(targetBall);

    eventBus.emit('development:modifiersApplied', {
      ballId: targetBall,
      modifiers: mods
    });

    return mods;
  }

  /**
   * Registers all unlocked Crystarium node modifiers for the active ball into ResolvedStatService Layer 3.
   * Adheres strictly to AT_CRYS_04, AT_CRYS_05, AT_CRYS_06, AT_CRYS_07.
   */
  syncCrystariumModifiersToStatService(targetBallId = null) {
    const activeBall = (targetBallId || this.getSelectedBall()).toLowerCase();

    // 1. Remove all existing Layer 3 modifiers from ResolvedStatService
    const currentMods = resolvedStatService.getModifiers();
    for (const m of currentMods) {
      if (m.layer === 3) {
        resolvedStatService.removeModifier(m.id);
      }
    }

    // 2. Fetch ball state from Save Schema v2 / BallProgressionService
    const ballState = ballProgressionService.getBallState(activeBall);
    const unlockedIds = Array.isArray(ballState.unlockedSkillIds) ? ballState.unlockedSkillIds : [];

    // Also include any local memory unlocked nodes for active ball
    const localMap = this._progression.unlockedNodes[activeBall] || {};
    const localGlobal = this._progression.globalUnlockedNodes || {};
    const allNodeIds = Array.from(new Set([...unlockedIds, ...Object.keys(localMap), ...Object.keys(localGlobal)]));

    for (const nodeId of allNodeIds) {
      const node = this._registry.getNode(nodeId);
      if (!node) continue;

      // AT_CRYS_06: Per-ball nodes belonging to inactive balls MUST NOT be registered
      if (node.ballId && node.ballId !== activeBall && node.type !== NODE_TYPES.GLOBAL && node.type !== NODE_TYPES.MASTERY_NODE) {
        continue;
      }

      if (Array.isArray(node.modifiers)) {
        for (const mod of node.modifiers) {
          resolvedStatService.addModifier({
            id: `${node.id}_${mod.statKey}`,
            statKey: mod.statKey,
            operation: mod.operation,
            value: mod.value,
            layer: 3,
            priority: 1,
            sourceId: node.id
          });
        }
      }
    }
  }

  /**
   * Atomically executes a node unlocking transaction using Skill Points (WP9 / DEC_004, DEC_005, DEC_021).
   * Verifies canUnlockNode (Ball Level gates, prerequisites, available SP), deducts SP,
   * updates crystariumNodeRecords in Save Schema v2, syncs to ResolvedStatService Layer 3,
   * and preserves ScoreSystem points unchanged.
   *
   * @param {string} nodeId
   * @param {string} ballId
   * @returns {{ success: boolean, reason?: string, node?: Object }}
   */
  unlockNode(nodeId, ballId = null) {
    if (this._isTransactionActive) {
      return { success: false, reason: 'Transakcja jest w toku' };
    }

    this._isTransactionActive = true;

    try {
      const targetBall = (ballId || this.getSelectedBall()).toLowerCase();
      const node = this._registry.getNode(nodeId);

      if (!node) {
        return { success: false, reason: 'Węzeł nie istnieje' };
      }

      // Check ball availability
      if (this._inventorySystem && typeof this._inventorySystem.isBallUnlocked === 'function') {
        if (!this._inventorySystem.isBallUnlocked(targetBall) && targetBall !== GAME_CONFIG.ball.defaultType) {
          return { success: false, reason: 'Bila nie została jeszcze odblokowana w grze' };
        }
      }

      // Validate eligibility via DevelopmentValidator (AT_CRYS_01, AT_CRYS_02, AT_CRYS_03)
      const validation = DevelopmentValidator.canUnlockNode(nodeId, targetBall);
      if (!validation.canUnlock) {
        let msg = 'Nie można odblokować węzła';
        if (validation.reason === UNLOCK_REJECTION_REASONS.ALREADY_UNLOCKED) {
          msg = 'Węzeł został już odblokowany';
        } else if (validation.reason === UNLOCK_REJECTION_REASONS.BALL_LEVEL_TOO_LOW) {
          msg = `Wymagany poziom kuli: Poziom ${validation.requiredLevel}`;
        } else if (validation.reason === UNLOCK_REJECTION_REASONS.PREREQUISITE_LOCKED) {
          msg = 'Wymagane jest odblokowanie węzłów poprzedzających';
        } else if (validation.reason === UNLOCK_REJECTION_REASONS.INSUFFICIENT_SKILL_POINTS) {
          msg = `Brak punktów umiejętności: wymagane ${validation.requiredSp} SP`;
        }
        return { success: false, reason: msg, code: validation.reason };
      }

      const spCost = node.spCost !== undefined ? node.spCost : 1;

      // Deduct Skill Points from BallProgressionService state (DEC_004, DEC_005)
      // ScoreSystem score remains completely untouched!
      const ballState = ballProgressionService.getBallState(targetBall);
      ballState.availableSkillPoints -= spCost;
      ballState.spentSkillPoints += spCost;
      if (!ballState.unlockedSkillIds.includes(nodeId)) {
        ballState.unlockedSkillIds.push(nodeId);
      }
      if (!ballState.crystariumNodeRecords) {
        ballState.crystariumNodeRecords = {};
      }
      ballState.crystariumNodeRecords[nodeId] = {
        unlocked: true,
        grandfathered: false,
        legacySource: null,
        spentSkillPointEquivalent: spCost
      };

      // Record in local service progression
      const isGlobal = node.type === NODE_TYPES.GLOBAL || node.type === NODE_TYPES.MASTERY_NODE;
      if (isGlobal) {
        this._progression.globalUnlockedNodes[nodeId] = 1;
      } else {
        if (!this._progression.unlockedNodes[targetBall]) {
          this._progression.unlockedNodes[targetBall] = {};
        }
        this._progression.unlockedNodes[targetBall][nodeId] = 1;
      }

      // Persist state
      this.save();
      ballProgressionService.saveCheckpoint('crystarium_node_unlocked');

      // Sync modifiers immediately to ResolvedStatService Layer 3 (AT_CRYS_04, AT_CRYS_05)
      this.syncCrystariumModifiersToStatService(targetBall);

      // Recalculate & apply modifiers to game
      const updatedModifiers = this.applyModifiersToGame(targetBall);

      eventBus.emit('development:nodeUnlocked', {
        nodeId,
        ballId: targetBall,
        node,
        spCost,
        remainingSp: ballState.availableSkillPoints,
        spentSp: ballState.spentSkillPoints,
        newRank: 1,
        modifiers: updatedModifiers
      });

      return { success: true, node };
    } catch (err) {
      console.error('[DevelopmentService] Unlock transaction failed:', err);
      return { success: false, reason: 'Błąd transakcji: ' + (err.message || err) };
    } finally {
      this._isTransactionActive = false;
    }
  }

  /**
   * Resets all unlocked Crystarium nodes for a ball and refunds all spent SP back to available SP (DEC_016 / AT_CRYS_08).
   * Preserves Ball Level and XP. Removes all Layer 3 modifiers immediately from ResolvedStatService.
   *
   * @param {string} ballId
   * @returns {{ success: boolean, refundedSp: number }}
   */
  respecBall(ballId = null) {
    const targetBall = (ballId || this.getSelectedBall()).toLowerCase();
    const ballState = ballProgressionService.getBallState(targetBall);
    if (!ballState) return { success: false, refundedSp: 0 };

    const refunded = ballState.spentSkillPoints || 0;

    // Refund SP and clear unlocked nodes
    ballState.availableSkillPoints += refunded;
    ballState.spentSkillPoints = 0;
    ballState.unlockedSkillIds = [];
    ballState.crystariumNodeRecords = {};

    // Clear local service unlocked map
    if (this._progression.unlockedNodes[targetBall]) {
      this._progression.unlockedNodes[targetBall] = {};
    }

    // Persist and synchronize
    this.save();
    ballProgressionService.saveCheckpoint('crystarium_respec');
    this.syncCrystariumModifiersToStatService(targetBall);
    this.applyModifiersToGame(targetBall);

    eventBus.emit('development:respecCompleted', {
      ballId: targetBall,
      refundedSp: refunded,
      availableSkillPoints: ballState.availableSkillPoints
    });

    return { success: true, refundedSp: refunded };
  }

  // ==========================================
  // PERSISTENCE (Save & Load)
  // ==========================================

  save() {
    try {
      localStorage.setItem(this._storageKey, JSON.stringify(this._progression));
    } catch (e) {
      console.warn('[DevelopmentService] Failed to save progression to localStorage:', e);
    }

    // Synchronize with Save Schema v2 (WP4)
    try {
      const res = saveMigrationService.loadOrMigrate();
      if (res && res.save) {
        const v2 = res.save;
        v2.profile.maxUnlockedStageGate = this._progression.maxUnlockedStage || 1;
        v2.crystarium.maxUnlockedStage = this._progression.maxUnlockedStage || 1;
        for (const [ballId, nodesMap] of Object.entries(this._progression.unlockedNodes)) {
          if (v2.balls[ballId] && typeof nodesMap === 'object') {
            const nodeIds = Object.keys(nodesMap);
            v2.balls[ballId].unlockedSkillIds = Array.from(new Set([...v2.balls[ballId].unlockedSkillIds, ...nodeIds]));
            for (const nid of nodeIds) {
              if (!v2.balls[ballId].crystariumNodeRecords[nid]) {
                const isMastery = nid.includes('_s3_') || nid.includes('mastery');
                v2.balls[ballId].crystariumNodeRecords[nid] = {
                  unlocked: true,
                  grandfathered: true,
                  legacySource: 'v1_crystarium',
                  spentSkillPointEquivalent: isMastery ? 2 : 1
                };
              }
            }
          }
        }
        saveMigrationService.commitV2(v2);
      }
    } catch (err) {
      console.warn('[DevelopmentService] Failed to synchronize v2 progression:', err);
    }
  }

  load() {
    try {
      // Run migration service to ensure v2 and backups exist
      saveMigrationService.loadOrMigrate();

      const dataStr = localStorage.getItem(this._storageKey);
      if (dataStr) {
        const parsed = JSON.parse(dataStr);
        if (parsed && typeof parsed === 'object') {
          this._progression.version = parsed.version || 2;
          this._progression.maxUnlockedStage = Math.max(1, Math.min(10, Number(parsed.maxUnlockedStage) || 1));
          this._progression.unlockedNodes = (parsed.unlockedNodes && typeof parsed.unlockedNodes === 'object')
            ? parsed.unlockedNodes
            : {};
          this._progression.globalUnlockedNodes = (parsed.globalUnlockedNodes && typeof parsed.globalUnlockedNodes === 'object')
            ? parsed.globalUnlockedNodes
            : {};
          this._progression.selectedBallId = parsed.selectedBallId || 'brass';

          // Sanitize loaded nodes against current registry
          this._sanitizeLoadedData();
        }
      }

      // Synchronize with Save Schema v2 balls.unlockedSkillIds
      const res = saveMigrationService.loadOrMigrate();
      if (res && res.save && res.save.balls) {
        for (const [ballId, ballData] of Object.entries(res.save.balls)) {
          if (Array.isArray(ballData.unlockedSkillIds)) {
            if (!this._progression.unlockedNodes[ballId]) {
              this._progression.unlockedNodes[ballId] = {};
            }
            for (const nid of ballData.unlockedSkillIds) {
              const node = this._registry.getNode(nid);
              if (node) {
                if (node.type === NODE_TYPES.GLOBAL || node.type === NODE_TYPES.MASTERY_NODE) {
                  this._progression.globalUnlockedNodes[nid] = 1;
                } else {
                  this._progression.unlockedNodes[ballId][nid] = 1;
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[DevelopmentService] Failed to load progression, starting clean:', e);
    }
  }

  _sanitizeLoadedData() {
    // Safely remove any saved node IDs that no longer exist in the config
    for (const [ballId, nodesMap] of Object.entries(this._progression.unlockedNodes)) {
      if (typeof nodesMap === 'object') {
        for (const nodeId of Object.keys(nodesMap)) {
          if (!this._registry.getNode(nodeId)) {
            delete nodesMap[nodeId];
          }
        }
      }
    }

    for (const nodeId of Object.keys(this._progression.globalUnlockedNodes)) {
      if (!this._registry.getNode(nodeId)) {
        delete this._progression.globalUnlockedNodes[nodeId];
      }
    }
  }

  dispose() {
    for (const unsub of this._unsubs) {
      if (typeof unsub === 'function') unsub();
    }
    this._unsubs = [];
  }
}

export const developmentService = new DevelopmentService();
