/**
 * Configuration and metadata for game stages.
 * Designed to be modular for future rules expansion (e.g. collecting specific gems, time trials, etc.).
 */

import { getGameLevelConfig } from './balanceTables.js';

export const STAGE_CONFIG = {
  defaultObjective: 'Odkryj wszystkie wolne kafelki na stole',
  defaultHint: 'Omijaj klocki przeszkód i czerwone promienie lasera!',
  baseStageBonus: 1000,
  timeBonusPerSecond: 10
};

export function getStageConfig(stageNumber = 1) {
  const stage = Math.max(1, Math.floor(stageNumber));
  const levelData = getGameLevelConfig(stage);

  // Stage configuration driven by 16_GAME_LEVELS
  const stageData = {
    number: stage,
    title: levelData.title,
    objective: STAGE_CONFIG.defaultObjective,
    targetType: 'discover_all',
    hint: stage === 1 
      ? 'Dotknij kafelka, aby wybrać punkt startowy bili. Omijaj lasery!'
      : `Etap ${stage}: Zwiększona czujność! Nowy układ planszy i pułapek laserowych.`,
    bonusPoints: levelData.stageClearBonus,
    obstacleRatio: levelData.obstacleRatio,
    cylinderEnemyCount: levelData.cylinderEnemyCount,
    stageXpBounty: levelData.stageXpBounty
  };

  return stageData;
}
