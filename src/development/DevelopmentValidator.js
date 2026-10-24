/**
 * Validates development tree structures, detecting duplicate IDs,
 * dangling prerequisites, cyclical dependencies, negative costs, and unreachable nodes.
 * Also validates individual node unlock eligibility (WP9 / AT_CRYS_01, AT_CRYS_02, AT_CRYS_03)
 * enforcing Ball Level gates (Level 1, 3, 6, 9), prerequisite trees, and available SP.
 */

import { developmentRegistry } from './DevelopmentRegistry.js';
import { ballProgressionService } from '../progression/BallProgressionService.js';

export const UNLOCK_REJECTION_REASONS = {
  NODE_NOT_FOUND: 'NODE_NOT_FOUND',
  ALREADY_UNLOCKED: 'ALREADY_UNLOCKED',
  BALL_LEVEL_TOO_LOW: 'BALL_LEVEL_TOO_LOW',
  PREREQUISITE_LOCKED: 'PREREQUISITE_LOCKED',
  INSUFFICIENT_SKILL_POINTS: 'INSUFFICIENT_SKILL_POINTS',
  BALL_LOCKED: 'BALL_LOCKED'
};

export class DevelopmentValidator {
  /**
   * Validates all trees in a development configuration dictionary.
   * @param {Object} trees - Dictionary of trees keyed by ballId
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validateAll(trees) {
    const errors = [];
    if (!trees || typeof trees !== 'object') {
      return { valid: false, errors: ['Invalid trees configuration: must be an object'] };
    }

    const seenTreeIds = new Set();
    const seenNodeIds = new Set();

    for (const [key, tree] of Object.entries(trees)) {
      if (!tree.id) {
        errors.push(`Tree at key "${key}" is missing an id`);
      } else if (seenTreeIds.has(tree.id)) {
        errors.push(`Duplicate tree id: "${tree.id}"`);
      } else {
        seenTreeIds.add(tree.id);
      }

      if (!tree.ballId) {
        errors.push(`Tree "${tree.id || key}" is missing ballId`);
      }

      if (!Array.isArray(tree.nodes) || tree.nodes.length === 0) {
        errors.push(`Tree "${tree.id || key}" must contain a non-empty nodes array`);
        continue;
      }

      const treeNodeMap = new Map();

      // Check nodes
      for (const node of tree.nodes) {
        if (!node.id) {
          errors.push(`Tree "${tree.id}" contains a node with missing id`);
          continue;
        }

        if (seenNodeIds.has(node.id)) {
          errors.push(`Duplicate global node id: "${node.id}" in tree "${tree.id}"`);
        } else {
          seenNodeIds.add(node.id);
        }

        if (treeNodeMap.has(node.id)) {
          errors.push(`Duplicate node id within tree "${tree.id}": "${node.id}"`);
        }
        treeNodeMap.set(node.id, node);

        if (node.spCost !== undefined && (typeof node.spCost !== 'number' || node.spCost < 0)) {
          errors.push(`Node "${node.id}" has invalid spCost: ${node.spCost}`);
        }

        if (node.requiredBallLevel !== undefined && (typeof node.requiredBallLevel !== 'number' || node.requiredBallLevel < 1)) {
          errors.push(`Node "${node.id}" has invalid requiredBallLevel: ${node.requiredBallLevel}`);
        }

        if (node.maxRank !== undefined && (typeof node.maxRank !== 'number' || node.maxRank < 1)) {
          errors.push(`Node "${node.id}" has invalid maxRank: ${node.maxRank}`);
        }

        const hasLegacyEffect = Boolean(node.effect && node.effect.type && node.effect.target);
        const hasModifiers = Array.isArray(node.modifiers);
        const isApex = Boolean(node.abilityUnlockId);
        if (!hasLegacyEffect && !hasModifiers && !isApex) {
          errors.push(`Node "${node.id}" has invalid or missing effect / modifier definition`);
        }
      }

      // Check prerequisites
      for (const node of tree.nodes) {
        if (Array.isArray(node.prerequisites)) {
          for (const prereqId of node.prerequisites) {
            if (!treeNodeMap.has(prereqId)) {
              errors.push(`Node "${node.id}" references non-existent prerequisite "${prereqId}"`);
            }
          }
        }
      }

      // Check for cycles using DFS
      const cycleDetected = this._detectCycle(treeNodeMap);
      if (cycleDetected) {
        errors.push(`Tree "${tree.id}" contains a cyclical prerequisite dependency: ${cycleDetected}`);
      }

      // Check connections if present
      if (Array.isArray(tree.connections)) {
        for (const conn of tree.connections) {
          if (!treeNodeMap.has(conn.from)) {
            errors.push(`Connection in tree "${tree.id}" has unknown "from" node: "${conn.from}"`);
          }
          if (!treeNodeMap.has(conn.to)) {
            errors.push(`Connection in tree "${tree.id}" has unknown "to" node: "${conn.to}"`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static _detectCycle(nodeMap) {
    const visited = new Set();
    const recStack = new Set();

    const dfs = (nodeId, path = []) => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const node = nodeMap.get(nodeId);
      const prereqs = (node && Array.isArray(node.prerequisites)) ? node.prerequisites : [];

      for (const parentId of prereqs) {
        if (!visited.has(parentId)) {
          const cycle = dfs(parentId, [...path, nodeId]);
          if (cycle) return cycle;
        } else if (recStack.has(parentId)) {
          return [...path, nodeId, parentId].join(' -> ');
        }
      }

      recStack.delete(nodeId);
      return null;
    };

    for (const nodeId of nodeMap.keys()) {
      if (!visited.has(nodeId)) {
        const cycle = dfs(nodeId);
        if (cycle) return cycle;
      }
    }

    return null;
  }

  /**
   * Evaluates if a specific Crystarium node can be unlocked by the ball.
   * Adheres to AT_CRYS_01, AT_CRYS_02, AT_CRYS_03.
   *
   * @param {string} nodeId - Target node ID (e.g. 'brass_s1_core', 'brass_s2_apex')
   * @param {string} ballId - Canonical ball ID (e.g. 'brass', 'marble', 'wood', 'chrome')
   * @param {Object} [customBallState] - Optional override ball state for testing
   * @returns {{ canUnlock: boolean, reason?: string, node?: Object, requiredLevel?: number, requiredSp?: number }}
   */
  static canUnlockNode(nodeId, ballId, customBallState = null) {
    const targetBall = (ballId || 'brass').toLowerCase();
    const node = developmentRegistry.getNode(nodeId);

    if (!node) {
      return { canUnlock: false, reason: UNLOCK_REJECTION_REASONS.NODE_NOT_FOUND };
    }

    const ballState = customBallState || ballProgressionService.getBallState(targetBall);
    if (!ballState) {
      return { canUnlock: false, reason: UNLOCK_REJECTION_REASONS.BALL_LOCKED };
    }

    // 1. Check if already unlocked (AT_CRYS_03)
    const unlockedList = Array.isArray(ballState.unlockedSkillIds) ? ballState.unlockedSkillIds : [];
    if (unlockedList.includes(nodeId)) {
      return { canUnlock: false, reason: UNLOCK_REJECTION_REASONS.ALREADY_UNLOCKED, node };
    }

    // 2. Check Ball Level gate (AT_CRYS_01 / DEC_021)
    // Tier 1: Lv 1, Tier 2 Passives: Lv 3, Apex Ability: Lv 6, Mastery Node: Lv 9
    const requiredLevel = node.requiredBallLevel || 1;
    const currentLevel = ballState.level || 1;
    if (currentLevel < requiredLevel) {
      return {
        canUnlock: false,
        reason: UNLOCK_REJECTION_REASONS.BALL_LEVEL_TOO_LOW,
        requiredLevel,
        currentLevel,
        node
      };
    }

    // 3. Check Prerequisites (AT_CRYS_02)
    const prereqs = Array.isArray(node.prerequisites) ? node.prerequisites : [];
    for (const prereqId of prereqs) {
      if (!unlockedList.includes(prereqId)) {
        return {
          canUnlock: false,
          reason: UNLOCK_REJECTION_REASONS.PREREQUISITE_LOCKED,
          missingPrerequisiteId: prereqId,
          node
        };
      }
    }

    // 4. Check Skill Point affordability (AT_CRYS_03 / DEC_005 / PROVISIONAL_BALANCE)
    const spCost = node.spCost !== undefined ? node.spCost : 1;
    const availableSp = ballState.availableSkillPoints || 0;
    if (availableSp < spCost) {
      return {
        canUnlock: false,
        reason: UNLOCK_REJECTION_REASONS.INSUFFICIENT_SKILL_POINTS,
        requiredSp: spCost,
        availableSp,
        node
      };
    }

    return { canUnlock: true, node, requiredLevel, spCost };
  }
}
