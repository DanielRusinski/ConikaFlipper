/**
 * Configuration and metadata for game stages.
 * Designed to be modular for future rules expansion (e.g. collecting specific gems, time trials, etc.).
 */

export const STAGE_CONFIG = {
  defaultObjective: 'Odkryj wszystkie wolne kafelki na stole',
  defaultHint: 'Omijaj klocki przeszkód i czerwone promienie lasera!',
  baseStageBonus: 1000,
  timeBonusPerSecond: 10
};

export function getStageConfig(stageNumber = 1) {
  const stage = Math.max(1, Math.floor(stageNumber));
  
  // Customizable rules per stage
  const stageData = {
    number: stage,
    title: `ETAP ${stage}`,
    objective: 'Odkryj wszystkie wolne kafelki na stole',
    targetType: 'discover_all',
    hint: stage === 1 
      ? 'Dotknij kafelka, aby wybrać punkt startowy bili. Omijaj lasery!'
      : `Etap ${stage}: Zwiększona czujność! Nowy układ planszy i pułapek laserowych.`,
    bonusPoints: STAGE_CONFIG.baseStageBonus + (stage - 1) * 250
  };

  return stageData;
}
