/**
 * Central balance data tables for Work Package 11:
 * - 09_ENEMIES: Enemy movement, dimensions, behaviors, and rewards
 * - 14_SPAWN_RULES: Spawn limits, intervals, delays, and thresholds
 * - 15_DROP_TABLES: Normalized drop probability distributions (summing to 1.00)
 * - 16_GAME_LEVELS: Stage-by-stage difficulty progression across Stages 1-20
 */

// 09_ENEMIES
export const ENEMY_TABLE = {
  cylinder_enemy: {
    id: 'ENEMY_001',
    key: 'cylinder_enemy',
    displayName: 'Walec (Cylinder Bumper Enemy)',
    category: 'bumper_enemy',
    isLethalOnContact: false, // DUP_008: Non-lethal pinball bumper
    patrolSpeed: 0.032,       // Calibrated calm arcade patrol speed
    bumperKickSpeedMin: 2.8,  // Minimum solenoid bumper kickback speed
    bumperKickSpeedMax: 4.2,  // Maximum solenoid bumper kickback speed
    bumperCooldown: 0.12,     // Seconds between bumper hits
    baseScoreHit: 50,         // Points awarded per bumper bounce
    baseScoreDestroy: 150,    // Points awarded on bomb/dragon destruction
    baseXpDestroy: 75,        // XP bounty awarded on destruction
    respawnDelaySeconds: 9.0, // Seconds before replenishment enemy enters
    laserImmune: true,        // Immune to laser corridor beams
    maxSimultaneousCount: 4   // Maximum concurrent active cylinders
  },
  centipede: {
    id: 'ENEMY_002',
    key: 'centipede',
    displayName: 'Stonoga (Centipede 8-Segment Hazard)',
    category: 'hazard_enemy',
    isLethalOnContact: true,   // Kills player ball on body contact
    segmentCount: 8,           // Exactly 8 blood-red graduated segments
    stepIntervalSeconds: 0.32, // Grid step cadence (~3.125 tiles/sec)
    baseScoreSegment: 100,     // Points per destroyed body segment
    baseScoreFullDefeat: 1000, // Points bonus when all 8 segments destroyed
    baseXpSegment: 40,         // XP bounty per segment
    timerBonusFullDefeat: 60,  // Seconds added to stage clock on full kill
    initialSpawnDelay: 20.0,   // Delay before entering the board on each stage
    respawnDelaySeconds: 7.0,  // Continuous respawn delay after all segments destroyed
    unconquersTiles: true      // Corrupts/unconquers tiles it slithers over
  },
  laser_hazard_corridor: {
    id: 'ENEMY_003',
    key: 'laser_hazard_corridor',
    displayName: 'Laser Corridor Hazard Beam',
    category: 'environmental_hazard',
    isLethalOnContact: true,   // Kills ball during FIRING phase (unless shielded)
    indestructible: true,
    warningDurationSeconds: 2.0, // Pre-firing charging beam duration
    cooldownMinSeconds: 16.0,    // Min IDLE phase duration
    cooldownMaxSeconds: 24.0,    // Max IDLE phase duration
    activeDurationMinSeconds: 3.0, // Min burning laser duration
    activeDurationMaxSeconds: 15.0,// Max burning laser duration
    fadeDurationSeconds: 0.8       // Dissipation fade duration
  },
  butterflies: {
    id: 'ENEMY_BUTTERFLIES',
    key: 'butterflies',
    displayName: 'Butterflies',
    category: 'environmental_hazard',
    enabled: true,
    visual: {
      butterflyCount: 15,
      wingScale: 0.0085, // Converted to table scale (PROVISIONAL_BALANCE)
      color: '#ffb3ba',
      emissiveColor: '#ffb3ba',
      emissiveIntensity: 2.5,
      opacity: 0.90,
      circleSegments: 12,
      baseHeight: 0.035, // PROVISIONAL_BALANCE (hovering smoothly over tiles)
      verticalAmplitude: 0.012,
      horizontalAmplitudeX: 0.055,
      horizontalAmplitudeZ: 0.055,
      flightSpeed: 0.7,
      flapSpeed: 18.0,
      maximumFlapRadians: 0.9
    },
    influenceZone: {
      widthCells: 8,
      depthCells: 8,
      minY: -0.5,
      maxY: 2.5,
      debugVisible: false
    },
    effect: {
      modifierId: 'MOD_BUTTERFLY_SLOW',
      targetStat: 'ball.speedScale',
      operation: 'MULTIPLY',
      value: 0.20, // 80% slow (ball moves at 20% speed)
      stackingGroup: 'BUTTERFLY_MOVEMENT_EFFECT',
      stackingRule: 'STRONGEST_ONLY',
      applyWhileInside: true,
      exitDelaySeconds: 0
    },
    bombInteraction: 'NONE',
    dragonInteraction: 'NONE',
    laserRainInteraction: 'NONE'
  }
};

// 14_SPAWN_RULES
export const SPAWN_RULES = {
  crystals: {
    poolSize: 15,                // Total crystals per board (hidden + active + collected)
    maxSimultaneousVisible: 5,   // Max concurrent visible on the playfield
    uncoverBaseProbability: 0.28,// Uncover probability when >= 1 crystal visible
    uncoverZeroVisibleProb: 0.65,// Uncover probability when 0 crystals visible
    discoveryIntervalSeconds: 2.5// Uncover cooldown
  },
  coins: {
    spawnOnTileDiscovered: true,
    pickupImmunitySeconds: 0.18
  },
  cylinder_enemies: {
    targetCountByStage: (stage) => Math.min(4, Math.max(1, stage)),
    respawnCooldownSeconds: 9.0
  },
  centipede: {
    initialSpawnDelaySeconds: 20.0,
    respawnDelaySeconds: 7.0
  },
  laser_corridor: {
    idleDuration: () => 16.0 + Math.random() * 8.0,
    activeDuration: () => 3.0 + Math.random() * 12.0,
    warningDuration: 2.0,
    fadeDuration: 0.8
  },
  shop_portal: {
    spawnAtConqueredPercent: 40,
    reentryCooldownSeconds: 2.0
  },
  butterflies: {
    minimumStage: 1,
    maximumActive: 1,
    initialDelaySeconds: 3.0,
    activeDurationSeconds: 10.0,
    respawnDelaySeconds: 30.0,
    spawnProbability: 1.0,
    maximumPlacementAttempts: 20,
    avoidBallSpawn: true,
    avoidShopPortal: true,
    despawnOnStageClear: true,
    introDurationSeconds: 1.2,
    outroDurationSeconds: 1.2
  }
};

// 15_DROP_TABLES
// Strictly normalized probability groups (each group sums to 1.00)
export const DROP_TABLES = {
  // Tile Coin Drops (Yellow vs Red) - Sum: 0.80 + 0.20 = 1.00
  coins: [
    { type: 'yellow', probability: 0.80, value: 10, color: 0xffd93d },
    { type: 'red', probability: 0.20, value: 50, color: 0xe63946 }
  ],
  // Crystal Pool Distribution Weights - Sum: 0.65 + 0.20 + 0.15 = 1.00
  crystals: [
    { type: 'points_crystal', weight: 0.65, minCount: 10, maxCount: 13, value: 250, label: '+250💎' },
    { type: 'emerald_crystal', weight: 0.20, minCount: 1, maxCount: 2, value: 200, label: '+1❤️' },
    { type: 'modifier', weight: 0.15, minCount: 1, maxCount: 3, value: 100, label: '🃏' }
  ],
  // Modifier Card Pick Choices - 6 cards uniform distribution (each 1/6)
  modifierCards: [
    { id: 'scoreMultiplier', weight: 1/6, effectType: 'scoreMultiplier', effectValue: 2, duration: 30 },
    { id: 'findingBoost', weight: 1/6, effectType: 'findingProbability', effectValue: 0.35, duration: 20 },
    { id: 'speedBoost', weight: 1/6, effectType: 'speedMultiplier', effectValue: 1.4, duration: 15 },
    { id: 'bombCluster', weight: 1/6, effectType: 'bombCluster', effectValue: 3, duration: 0 },
    { id: 'dragonCompanion', weight: 1/6, effectType: 'dragonCompanion', effectValue: 1, duration: 6 },
    { id: 'laserRain', weight: 1/6, effectType: 'laserRain', effectValue: 22, duration: 4.5 }
  ]
};

// Helper: validate probability group sum equals 1.00 within floating tolerance
export function validateDropTableSum(entries) {
  const sum = entries.reduce((acc, e) => acc + (e.probability !== undefined ? e.probability : e.weight), 0);
  return Math.abs(sum - 1.00) < 1e-5;
}

// 16_GAME_LEVELS (Stages 1 through 20)
// Preserves solvability clamp for obstacleRatio <= 0.25
export const GAME_LEVELS = Array.from({ length: 20 }, (_, idx) => {
  const stage = idx + 1;
  const obstacleRatio = Math.min(0.25, Number((0.10 + (stage - 1) * 0.025).toFixed(4)));
  const cylinderEnemyCount = Math.min(4, Math.max(1, stage));
  const stageClearBonus = 1000 + (stage - 1) * 250;
  const startingTimerSeconds = 300;
  const stageXpBounty = 300;

  return {
    stage,
    title: `ETAP ${stage}`,
    obstacleRatio,
    cylinderEnemyCount,
    centipedeEnabled: true,
    startingTimerSeconds,
    stageClearBonus,
    stageXpBounty,
    timeBonusPerSecond: 10
  };
});

export function getGameLevelConfig(stageNumber = 1) {
  const stage = Math.max(1, Math.floor(stageNumber));
  if (stage <= GAME_LEVELS.length) {
    return GAME_LEVELS[stage - 1];
  }
  // Formula fallback for stages beyond 20
  return {
    stage,
    title: `ETAP ${stage}`,
    obstacleRatio: 0.25,
    cylinderEnemyCount: 4,
    centipedeEnabled: true,
    startingTimerSeconds: 300,
    stageClearBonus: 1000 + (stage - 1) * 250,
    stageXpBounty: 300,
    timeBonusPerSecond: 10
  };
}
