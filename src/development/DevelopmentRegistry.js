import { DEVELOPMENT_TREES } from './DevelopmentConfig.js';
import { DevelopmentValidator } from './DevelopmentValidator.js';

export class DevelopmentRegistry {
  constructor() {
    this._trees = new Map();
    this._nodesById = new Map();
    this._registeredBallIds = new Set();
  }

  init(initialTrees = DEVELOPMENT_TREES) {
    const validation = DevelopmentValidator.validateAll(initialTrees);
    if (!validation.valid) {
      console.error('[DevelopmentRegistry] Tree validation failed:', validation.errors);
      throw new Error(`DevelopmentConfig validation failed:\n${validation.errors.join('\n')}`);
    }

    for (const [ballId, tree] of Object.entries(initialTrees)) {
      this.registerTree(ballId, tree);
    }
  }

  registerTree(ballId, tree) {
    if (!ballId || !tree) return;
    const lowerBallId = ballId.toLowerCase();
    this._trees.set(lowerBallId, tree);
    this._registeredBallIds.add(lowerBallId);

    if (Array.isArray(tree.nodes)) {
      for (const node of tree.nodes) {
        this._nodesById.set(node.id, {
          ...node,
          treeId: tree.id,
          ballId: lowerBallId
        });
      }
    }
  }

  getTree(ballId) {
    if (!ballId) return null;
    return this._trees.get(ballId.toLowerCase()) || null;
  }

  getNode(nodeId) {
    return this._nodesById.get(nodeId) || null;
  }

  getAllTrees() {
    return Array.from(this._trees.values());
  }

  getRegisteredBallIds() {
    return Array.from(this._registeredBallIds);
  }

  hasTreeForBall(ballId) {
    if (!ballId) return false;
    return this._trees.has(ballId.toLowerCase());
  }
}

export const developmentRegistry = new DevelopmentRegistry();
