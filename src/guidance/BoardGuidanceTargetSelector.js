import { BOARD_GUIDANCE_CONFIG } from './BoardGuidanceConfig.js';

/**
 * BoardGuidanceTargetSelector
 * Analyzes active board state and selects one valid uncaptured tile to guide the player toward.
 * Enforces all candidate eligibility rules.
 */
export class BoardGuidanceTargetSelector {
  /**
   * Filters and selects a candidate tile.
   * @param {TileManager} tileManager Authoritative TileManager instance
   * @param {Object} [shopTileData=null] Current active Shop Tile if present
   * @param {Function} [rng=Math.random] Deterministic or standard RNG
   * @returns {Object|null} Candidate info { gridX, gridY, index, worldX, worldZ } or null
   */
  static selectTarget(tileManager, shopTileData = null, rng = Math.random) {
    if (!tileManager || typeof tileManager.getTileIndex !== 'function') {
      return null;
    }

    const tilesX = tileManager.tilesX;
    const tilesY = tileManager.tilesY;
    const candidates = [];

    // Skip extreme boundaries / outer frame to keep target clearly playable
    for (let gy = 0; gy < tilesY; gy++) {
      for (let gx = 0; gx < tilesX; gx++) {
        const index = tileManager.getTileIndex(gx, gy);

        // 1. Must exist & not already captured/visited
        if (tileManager.visitedTiles.has(index)) {
          continue;
        }

        // 2. Must not be an obstacle or decorative tile
        if (tileManager.isObstacle(gx, gy)) {
          continue;
        }

        // 3. Must not be an active Shop Tile
        if (shopTileData && (gx === shopTileData.gridX && gy === shopTileData.gridY)) {
          continue;
        }
        if (typeof tileManager.isShopTile === 'function' && tileManager.isShopTile(gx, gy)) {
          continue;
        }

        // 4. Must not be the default starting spawn cell if reserved
        if (gx === 9 && gy === 18 && tileManager.visitedTiles.size === 0) {
          continue;
        }

        const worldPos = tileManager.getTileWorldPos(gx, gy);
        candidates.push({
          gridX: gx,
          gridY: gy,
          index,
          worldX: worldPos.x,
          worldZ: worldPos.z
        });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Select one candidate at random
    const chosenIndex = Math.floor(rng() * candidates.length);
    return candidates[chosenIndex];
  }

  /**
   * Validates if a previously selected target tile remains valid and uncaptured.
   * @param {TileManager} tileManager
   * @param {Object} targetData
   * @param {Object} [shopTileData=null]
   * @returns {boolean}
   */
  static isTargetStillValid(tileManager, targetData, shopTileData = null) {
    if (!tileManager || !targetData) return false;
    const { gridX, gridY, index } = targetData;

    if (tileManager.visitedTiles.has(index)) return false;
    if (tileManager.isObstacle(gridX, gridY)) return false;
    if (shopTileData && (gridX === shopTileData.gridX && gridY === shopTileData.gridY)) return false;
    if (typeof tileManager.isShopTile === 'function' && tileManager.isShopTile(gridX, gridY)) return false;

    return true;
  }
}
