/**
 * Development System - Tree and Node configuration for ball progression (WP9).
 * Canonical data-driven model supporting all 4 ball types (brass, marble, wood, chrome).
 * Strictly adheres to 05_BALL_SKILLS.csv (SKILL_001..SKILL_028) and 08_MODIFIERS.csv (MOD_001..MOD_024).
 * Nodes feature 3D spatial coordinates [x, y, z], requiredBallLevel gates (1, 3, 6, 9),
 * spCost (1 for Tier 1, Tier 2 Passives and Apex; 2 for Tier 3 Mastery per PROVISIONAL_BALANCE),
 * and exact canonical modifiers resolved into ResolvedStatService Stage 3 (STAGE_3_CRYSTARIUM).
 */

export const NODE_TYPES = {
  STAT: 'STAT',
  ABILITY: 'ABILITY',
  PASSIVE: 'PASSIVE',
  GLOBAL: 'GLOBAL',
  APEX_ABILITY: 'APEX_ABILITY',
  MASTERY_NODE: 'MASTERY_NODE'
};

export const DEVELOPMENT_TREES = {
  brass: {
    id: 'tree_brass',
    ballId: 'brass',
    displayName: 'Mosiężna Bila (Brass Balanced)',
    themeColor: '#d4a84b',
    description: 'Zrównoważony archetyp skupiony na stabilności, kontroli toru lotu i uniwersalnym tempie gry.',
    version: 2,
    nodes: [
      // --- TIER 1 (Req Lv 1, Cost 1 SP) ---
      {
        id: 'brass_s1_core',
        skillId: 'SKILL_001',
        stage: 1,
        tier: 1,
        branch: 'core',
        displayName: 'Brass Core Calibration',
        description: 'Zwiększa prędkość toczenia bili o +6% (ball.speedScale +6%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 1,
        spCost: 1,
        scoreCost: 200,
        prerequisites: [],
        pos: [0, 0, 0],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_001', statKey: 'ball.speedScale', operation: 'PERCENT_ADD', value: 0.06, layer: 3, sourceId: 'brass_s1_core' }
        ]
      },
      {
        id: 'brass_s1_grip',
        skillId: 'SKILL_002',
        stage: 1,
        tier: 1,
        branch: 'control',
        displayName: 'Gyroscopic Grip',
        description: 'Zwiększa responsywność i czułość przechyłu stołu o +8% (ball.controlResponsiveness +8%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 1,
        spCost: 1,
        scoreCost: 300,
        prerequisites: ['brass_s1_core'],
        pos: [-2.5, 3.0, -3.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_002', statKey: 'ball.controlResponsiveness', operation: 'PERCENT_ADD', value: 0.08, layer: 3, sourceId: 'brass_s1_grip' }
        ]
      },
      {
        id: 'brass_s1_bounce',
        skillId: 'SKILL_003',
        stage: 1,
        tier: 1,
        branch: 'rebound',
        displayName: 'Alloy Rebound',
        description: 'Zwiększa sprężystość odbić od ścian stołu o +0.04 (ball.wallRestitution +0.04).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 1,
        spCost: 1,
        scoreCost: 400,
        prerequisites: ['brass_s1_core'],
        pos: [2.5, 3.0, -3.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_003', statKey: 'ball.wallRestitution', operation: 'ADD', value: 0.04, layer: 3, sourceId: 'brass_s1_bounce' }
        ]
      },

      // --- TIER 2 PASSIVES (Req Lv 3, Cost 1 SP) ---
      {
        id: 'brass_s2_momentum',
        skillId: 'SKILL_004',
        stage: 2,
        tier: 2,
        branch: 'momentum',
        displayName: 'Heavy Momentum',
        description: 'Zwiększa sprężystość odbić o +0.05 oraz redukuje siłę uderzeń i odrzut o +10% (ball.impactResistance +10%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 3,
        spCost: 1,
        scoreCost: 650,
        prerequisites: ['brass_s1_grip', 'brass_s1_bounce'],
        pos: [-2.8, 6.5, -7.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_004_A', statKey: 'ball.wallRestitution', operation: 'ADD', value: 0.05, layer: 3, sourceId: 'brass_s2_momentum' },
          { id: 'MOD_004_B', statKey: 'ball.impactResistance', operation: 'PERCENT_ADD', value: 0.10, layer: 3, sourceId: 'brass_s2_momentum' }
        ]
      },
      {
        id: 'brass_s2_score',
        skillId: 'SKILL_005',
        stage: 2,
        tier: 2,
        branch: 'resonance',
        displayName: 'Gilded Resonance',
        description: 'Podnosi ogólny mnożnik punktów gry o +5% (score.multiplier +5%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 3,
        spCost: 1,
        scoreCost: 800,
        prerequisites: ['brass_s1_bounce'],
        pos: [2.8, 6.5, -7.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_005', statKey: 'score.multiplier', operation: 'PERCENT_ADD', value: 0.05, layer: 3, sourceId: 'brass_s2_score' }
        ]
      },

      // --- TIER 2 APEX ABILITY (Req Lv 6, Cost 1 SP) ---
      {
        id: 'brass_s2_apex',
        skillId: 'SKILL_006',
        stage: 2,
        tier: 2,
        branch: 'apex',
        displayName: 'Kinetic Overdrive',
        description: 'Odblokowuje Apex Ability mosiężnej bili: Kinetic Overdrive (tymczasowy zryw prędkości i podwójny promień zaliczania).',
        type: NODE_TYPES.APEX_ABILITY,
        requiredBallLevel: 6,
        spCost: 1,
        scoreCost: 1400,
        prerequisites: ['brass_s2_momentum'],
        pos: [0, 9.5, -11.0],
        maxRank: 1,
        abilityUnlockId: 'brass_ability_overdrive',
        modifiers: []
      },

      // --- TIER 3 MASTERY NODE (Req Lv 9, Cost 2 SP) ---
      {
        id: 'brass_s3_mastery',
        skillId: 'SKILL_007',
        stage: 3,
        tier: 3,
        branch: 'mastery',
        displayName: 'Sovereign Brass Mastery',
        description: 'Mistrzostwo mosiądzu: +8% prędkości, +8% mnożnika punktów oraz +1 dodatkowe startowe życie (player.startingLives +1).',
        type: NODE_TYPES.MASTERY_NODE,
        requiredBallLevel: 9,
        spCost: 2,
        scoreCost: 2400,
        prerequisites: ['brass_s2_apex', 'brass_s2_score'],
        pos: [0, 13.5, -15.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_006_A', statKey: 'ball.speedScale', operation: 'PERCENT_ADD', value: 0.08, layer: 3, sourceId: 'brass_s3_mastery' },
          { id: 'MOD_006_B', statKey: 'score.multiplier', operation: 'PERCENT_ADD', value: 0.08, layer: 3, sourceId: 'brass_s3_mastery' },
          { id: 'MOD_006_C', statKey: 'player.startingLives', operation: 'ADD', value: 1, layer: 3, sourceId: 'brass_s3_mastery' }
        ]
      }
    ],
    connections: [
      { from: 'brass_s1_core', to: 'brass_s1_grip' },
      { from: 'brass_s1_core', to: 'brass_s1_bounce' },
      { from: 'brass_s1_grip', to: 'brass_s2_momentum' },
      { from: 'brass_s1_bounce', to: 'brass_s2_momentum' },
      { from: 'brass_s1_bounce', to: 'brass_s2_score' },
      { from: 'brass_s2_momentum', to: 'brass_s2_apex' },
      { from: 'brass_s2_apex', to: 'brass_s3_mastery' },
      { from: 'brass_s2_score', to: 'brass_s3_mastery' }
    ]
  },

  marble: {
    id: 'tree_marble',
    ballId: 'marble',
    displayName: 'Marmurowa Bila (Marble Heavy)',
    themeColor: '#ede8e1',
    description: 'Ciężka, masywna kula o wysokiej inercji i potężnym impakcie na zderzaki oraz przeciwników.',
    version: 2,
    nodes: [
      // --- TIER 1 (Req Lv 1, Cost 1 SP) ---
      {
        id: 'marble_s1_polish',
        skillId: 'SKILL_008',
        stage: 1,
        tier: 1,
        branch: 'core',
        displayName: 'Crystalline Polish',
        description: 'Zwiększa sprężystość odbić marmuru o +0.06 (ball.wallRestitution +0.06).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 1,
        spCost: 1,
        scoreCost: 220,
        prerequisites: [],
        pos: [0, 0, 0],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_007', statKey: 'ball.wallRestitution', operation: 'ADD', value: 0.06, layer: 3, sourceId: 'marble_s1_polish' }
        ]
      },
      {
        id: 'marble_s1_poise',
        skillId: 'SKILL_009',
        stage: 1,
        tier: 1,
        branch: 'control',
        displayName: 'Balanced Poise',
        description: 'Zwiększa czułość toczenia ciężkiej bili o +10% (ball.controlResponsiveness +10%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 1,
        spCost: 1,
        scoreCost: 320,
        prerequisites: ['marble_s1_polish'],
        pos: [-2.5, 3.0, -3.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_008', statKey: 'ball.controlResponsiveness', operation: 'PERCENT_ADD', value: 0.10, layer: 3, sourceId: 'marble_s1_poise' }
        ]
      },
      {
        id: 'marble_s1_shell',
        skillId: 'SKILL_010',
        stage: 1,
        tier: 1,
        branch: 'defense',
        displayName: 'Dense Vein Shell',
        description: 'Zwiększa odporność na wstrząsy i zderzenia o +12% (ball.impactResistance +12%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 1,
        spCost: 1,
        scoreCost: 420,
        prerequisites: ['marble_s1_polish'],
        pos: [2.5, 3.0, -3.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_009', statKey: 'ball.impactResistance', operation: 'PERCENT_ADD', value: 0.12, layer: 3, sourceId: 'marble_s1_shell' }
        ]
      },

      // --- TIER 2 PASSIVES (Req Lv 3, Cost 1 SP) ---
      {
        id: 'marble_s2_ward',
        skillId: 'SKILL_011',
        stage: 2,
        tier: 2,
        branch: 'defense',
        displayName: 'Bumper Ward',
        description: 'Tłumi odrzut od zderzaków o +15% (ball.bumperDampening +15%) oraz dodaje +8% odporności na impakt.',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 3,
        spCost: 1,
        scoreCost: 700,
        prerequisites: ['marble_s1_poise', 'marble_s1_shell'],
        pos: [-2.8, 6.5, -7.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_010_A', statKey: 'ball.bumperDampening', operation: 'PERCENT_ADD', value: 0.15, layer: 3, sourceId: 'marble_s2_ward' },
          { id: 'MOD_010_B', statKey: 'ball.impactResistance', operation: 'PERCENT_ADD', value: 0.08, layer: 3, sourceId: 'marble_s2_ward' }
        ]
      },
      {
        id: 'marble_s2_grace',
        skillId: 'SKILL_012',
        stage: 2,
        tier: 2,
        branch: 'score',
        displayName: 'Luminous Grace',
        description: 'Podnosi mnożnik punktów o +8% (score.multiplier +8%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 3,
        spCost: 1,
        scoreCost: 850,
        prerequisites: ['marble_s1_shell'],
        pos: [2.8, 6.5, -7.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_011', statKey: 'score.multiplier', operation: 'PERCENT_ADD', value: 0.08, layer: 3, sourceId: 'marble_s2_grace' }
        ]
      },

      // --- TIER 2 APEX ABILITY (Req Lv 6, Cost 1 SP) ---
      {
        id: 'marble_s2_apex',
        skillId: 'SKILL_013',
        stage: 2,
        tier: 2,
        branch: 'apex',
        displayName: 'Resonant Aegis',
        description: 'Odblokowuje Apex Ability marmuru: Resonant Aegis (pochłania jedno bezpośrednie trafienie laserem na etap).',
        type: NODE_TYPES.APEX_ABILITY,
        requiredBallLevel: 6,
        spCost: 1,
        scoreCost: 1450,
        prerequisites: ['marble_s2_ward'],
        pos: [0, 9.5, -11.0],
        maxRank: 1,
        abilityUnlockId: 'marble_ability_aegis',
        modifiers: [
          { id: 'MOD_ABIL_006', statKey: 'player.laserShieldCharges', operation: 'ADD', value: 1, layer: 3, sourceId: 'marble_s2_apex' }
        ]
      },

      // --- TIER 3 MASTERY NODE (Req Lv 9, Cost 2 SP) ---
      {
        id: 'marble_s3_mastery',
        skillId: 'SKILL_014',
        stage: 3,
        tier: 3,
        branch: 'mastery',
        displayName: 'Eternal Marble Mastery',
        description: 'Mistrzostwo marmuru: +1 startowe życie, +15% odporności na zderzenia oraz +0.05 sprężystości odbić.',
        type: NODE_TYPES.MASTERY_NODE,
        requiredBallLevel: 9,
        spCost: 2,
        scoreCost: 2500,
        prerequisites: ['marble_s2_apex', 'marble_s2_grace'],
        pos: [0, 13.5, -15.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_012_A', statKey: 'player.startingLives', operation: 'ADD', value: 1, layer: 3, sourceId: 'marble_s3_mastery' },
          { id: 'MOD_012_B', statKey: 'ball.impactResistance', operation: 'PERCENT_ADD', value: 0.15, layer: 3, sourceId: 'marble_s3_mastery' },
          { id: 'MOD_012_C', statKey: 'ball.wallRestitution', operation: 'ADD', value: 0.05, layer: 3, sourceId: 'marble_s3_mastery' }
        ]
      }
    ],
    connections: [
      { from: 'marble_s1_polish', to: 'marble_s1_poise' },
      { from: 'marble_s1_polish', to: 'marble_s1_shell' },
      { from: 'marble_s1_poise', to: 'marble_s2_ward' },
      { from: 'marble_s1_shell', to: 'marble_s2_ward' },
      { from: 'marble_s1_shell', to: 'marble_s2_grace' },
      { from: 'marble_s2_ward', to: 'marble_s2_apex' },
      { from: 'marble_s2_apex', to: 'marble_s3_mastery' },
      { from: 'marble_s2_grace', to: 'marble_s3_mastery' }
    ]
  },

  wood: {
    id: 'tree_wood',
    ballId: 'wood',
    displayName: 'Drewniana Bila (Hardwood Agile)',
    themeColor: '#8a5229',
    description: 'Lekka, zwinna kula charakteryzująca się natychmiastowym przyspieszeniem i szybkim reagowaniem na pochył stołu.',
    version: 2,
    nodes: [
      // --- TIER 1 (Req Lv 1, Cost 1 SP) ---
      {
        id: 'wood_s1_grain',
        skillId: 'SKILL_015',
        stage: 1,
        tier: 1,
        branch: 'core',
        displayName: 'Supple Grain',
        description: 'Zwiększa czułość toczenia o +12% oraz prędkość bili o +5% (ball.speedScale +5%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 1,
        spCost: 1,
        scoreCost: 180,
        prerequisites: [],
        pos: [0, 0, 0],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_013_A', statKey: 'ball.controlResponsiveness', operation: 'PERCENT_ADD', value: 0.12, layer: 3, sourceId: 'wood_s1_grain' },
          { id: 'MOD_013_B', statKey: 'ball.speedScale', operation: 'PERCENT_ADD', value: 0.05, layer: 3, sourceId: 'wood_s1_grain' }
        ]
      },
      {
        id: 'wood_s1_roots',
        skillId: 'SKILL_016',
        stage: 1,
        tier: 1,
        branch: 'magnet',
        displayName: 'Magnetic Roots',
        description: 'Zwiększa promień przyciągania monet i kryształów o +15% (ball.pickupRadiusMultiplier +15%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 1,
        spCost: 1,
        scoreCost: 280,
        prerequisites: ['wood_s1_grain'],
        pos: [-2.5, 3.0, -3.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_014', statKey: 'ball.pickupRadiusMultiplier', operation: 'PERCENT_ADD', value: 0.15, layer: 3, sourceId: 'wood_s1_roots' }
        ]
      },
      {
        id: 'wood_s1_sap',
        skillId: 'SKILL_017',
        stage: 1,
        tier: 1,
        branch: 'score',
        displayName: 'Amber Sap Flow',
        description: 'Zwiększa mnożnik punktów zdobywanych na planszy o +6% (score.multiplier +6%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 1,
        spCost: 1,
        scoreCost: 380,
        prerequisites: ['wood_s1_grain'],
        pos: [2.5, 3.0, -3.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_015', statKey: 'score.multiplier', operation: 'PERCENT_ADD', value: 0.06, layer: 3, sourceId: 'wood_s1_sap' }
        ]
      },

      // --- TIER 2 PASSIVES (Req Lv 3, Cost 1 SP) ---
      {
        id: 'wood_s2_bounty',
        skillId: 'SKILL_018',
        stage: 2,
        tier: 2,
        branch: 'bounty',
        displayName: 'Forest Bounty',
        description: 'Dodaje +10% do mnożnika punktów oraz +20% do promienia przyciągania znajdziek.',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 3,
        spCost: 1,
        scoreCost: 620,
        prerequisites: ['wood_s1_roots', 'wood_s1_sap'],
        pos: [-2.8, 6.5, -7.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_016_A', statKey: 'score.multiplier', operation: 'PERCENT_ADD', value: 0.10, layer: 3, sourceId: 'wood_s2_bounty' },
          { id: 'MOD_016_B', statKey: 'ball.pickupRadiusMultiplier', operation: 'PERCENT_ADD', value: 0.20, layer: 3, sourceId: 'wood_s2_bounty' }
        ]
      },
      {
        id: 'wood_s2_canopy',
        skillId: 'SKILL_019',
        stage: 2,
        tier: 2,
        branch: 'time',
        displayName: 'Ancient Canopy',
        description: 'Dodaje +15 sekund bazowego czasu na każdym etapie gry (player.stageTimeBonusSeconds +15s).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 3,
        spCost: 1,
        scoreCost: 780,
        prerequisites: ['wood_s1_sap'],
        pos: [2.8, 6.5, -7.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_017', statKey: 'player.stageTimeBonusSeconds', operation: 'ADD', value: 15, layer: 3, sourceId: 'wood_s2_canopy' }
        ]
      },

      // --- TIER 2 APEX ABILITY (Req Lv 6, Cost 1 SP) ---
      {
        id: 'wood_s2_apex',
        skillId: 'SKILL_020',
        stage: 2,
        tier: 2,
        branch: 'apex',
        displayName: 'Verdant Harvest',
        description: 'Odblokowuje Apex Ability drewnianej bili: Verdant Harvest (natychmiastowe przyciągnięcie wszystkich odkrytych nagród).',
        type: NODE_TYPES.APEX_ABILITY,
        requiredBallLevel: 6,
        spCost: 1,
        scoreCost: 1350,
        prerequisites: ['wood_s2_bounty'],
        pos: [0, 9.5, -11.0],
        maxRank: 1,
        abilityUnlockId: 'wood_ability_harvest',
        modifiers: []
      },

      // --- TIER 3 MASTERY NODE (Req Lv 9, Cost 2 SP) ---
      {
        id: 'wood_s3_mastery',
        skillId: 'SKILL_021',
        stage: 3,
        tier: 3,
        branch: 'mastery',
        displayName: 'Worldtree Wood Mastery',
        description: 'Mistrzostwo pradawnego drewna: +12% punktów, +25 sekund czasu na każdym etapie oraz +15% promienia przyciągania.',
        type: NODE_TYPES.MASTERY_NODE,
        requiredBallLevel: 9,
        spCost: 2,
        scoreCost: 2300,
        prerequisites: ['wood_s2_apex', 'wood_s2_canopy'],
        pos: [0, 13.5, -15.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_018_A', statKey: 'score.multiplier', operation: 'PERCENT_ADD', value: 0.12, layer: 3, sourceId: 'wood_s3_mastery' },
          { id: 'MOD_018_B', statKey: 'player.stageTimeBonusSeconds', operation: 'ADD', value: 25, layer: 3, sourceId: 'wood_s3_mastery' },
          { id: 'MOD_018_C', statKey: 'ball.pickupRadiusMultiplier', operation: 'PERCENT_ADD', value: 0.15, layer: 3, sourceId: 'wood_s3_mastery' }
        ]
      }
    ],
    connections: [
      { from: 'wood_s1_grain', to: 'wood_s1_roots' },
      { from: 'wood_s1_grain', to: 'wood_s1_sap' },
      { from: 'wood_s1_roots', to: 'wood_s2_bounty' },
      { from: 'wood_s1_sap', to: 'wood_s2_bounty' },
      { from: 'wood_s1_sap', to: 'wood_s2_canopy' },
      { from: 'wood_s2_bounty', to: 'wood_s2_apex' },
      { from: 'wood_s2_apex', to: 'wood_s3_mastery' },
      { from: 'wood_s2_canopy', to: 'wood_s3_mastery' }
    ]
  },

  chrome: {
    id: 'tree_chrome',
    ballId: 'chrome',
    displayName: 'Stalowa Bila Chrome (Cyber High-Tech)',
    themeColor: '#e2e8f0',
    description: 'Zaawansowana, futurystyczna bila z neonową matrycą kwantową. Najwyższy potencjał punktowy i odporność.',
    version: 2,
    nodes: [
      // --- TIER 1 (Req Lv 1, Cost 1 SP) ---
      {
        id: 'chrome_s1_drive',
        skillId: 'SKILL_022',
        stage: 1,
        tier: 1,
        branch: 'core',
        displayName: 'Hyperchrome Drive',
        description: 'Zwiększa prędkość toczenia cyber-bili o +8% (ball.speedScale +8%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 1,
        spCost: 1,
        scoreCost: 250,
        prerequisites: [],
        pos: [0, 0, 0],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_019', statKey: 'ball.speedScale', operation: 'PERCENT_ADD', value: 0.08, layer: 3, sourceId: 'chrome_s1_drive' }
        ]
      },
      {
        id: 'chrome_s1_edge',
        skillId: 'SKILL_023',
        stage: 1,
        tier: 1,
        branch: 'rebound',
        displayName: 'Mirror Edge',
        description: 'Zwiększa sprężystość odbić od ścian stołu o +0.07 (ball.wallRestitution +0.07).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 1,
        spCost: 1,
        scoreCost: 350,
        prerequisites: ['chrome_s1_drive'],
        pos: [-2.5, 3.0, -3.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_020', statKey: 'ball.wallRestitution', operation: 'ADD', value: 0.07, layer: 3, sourceId: 'chrome_s1_edge' }
        ]
      },
      {
        id: 'chrome_s1_spark',
        skillId: 'SKILL_024',
        stage: 1,
        tier: 1,
        branch: 'score',
        displayName: 'Arc Spark',
        description: 'Podnosi mnożnik punktów gry o +10% (score.multiplier +10%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 1,
        spCost: 1,
        scoreCost: 450,
        prerequisites: ['chrome_s1_drive'],
        pos: [2.5, 3.0, -3.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_021', statKey: 'score.multiplier', operation: 'PERCENT_ADD', value: 0.10, layer: 3, sourceId: 'chrome_s1_spark' }
        ]
      },

      // --- TIER 2 PASSIVES (Req Lv 3, Cost 1 SP) ---
      {
        id: 'chrome_s2_strike',
        skillId: 'SKILL_025',
        stage: 2,
        tier: 2,
        branch: 'strike',
        displayName: 'Kinetic Strike',
        description: 'Zwiększa nagrody i obrażenia wrogów o +15% (ball.enemyDamageMultiplier +15%) oraz prędkość o +6%.',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 3,
        spCost: 1,
        scoreCost: 750,
        prerequisites: ['chrome_s1_edge', 'chrome_s1_spark'],
        pos: [-2.8, 6.5, -7.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_022_A', statKey: 'ball.enemyDamageMultiplier', operation: 'PERCENT_ADD', value: 0.15, layer: 3, sourceId: 'chrome_s2_strike' },
          { id: 'MOD_022_B', statKey: 'ball.speedScale', operation: 'PERCENT_ADD', value: 0.06, layer: 3, sourceId: 'chrome_s2_strike' }
        ]
      },
      {
        id: 'chrome_s2_vector',
        skillId: 'SKILL_026',
        stage: 2,
        tier: 2,
        branch: 'control',
        displayName: 'Precision Vector',
        description: 'Zwiększa czułość i responsywność toczenia o +12% (ball.controlResponsiveness +12%).',
        type: NODE_TYPES.PASSIVE,
        requiredBallLevel: 3,
        spCost: 1,
        scoreCost: 900,
        prerequisites: ['chrome_s1_spark'],
        pos: [2.8, 6.5, -7.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_023', statKey: 'ball.controlResponsiveness', operation: 'PERCENT_ADD', value: 0.12, layer: 3, sourceId: 'chrome_s2_vector' }
        ]
      },

      // --- TIER 2 APEX ABILITY (Req Lv 6, Cost 1 SP) ---
      {
        id: 'chrome_s2_apex',
        skillId: 'SKILL_027',
        stage: 2,
        tier: 2,
        branch: 'apex',
        displayName: 'Phase Shift',
        description: 'Odblokowuje Apex Ability bili Chrome: Phase Shift (chwilowa niewrażliwość na lasery i przeszkody).',
        type: NODE_TYPES.APEX_ABILITY,
        requiredBallLevel: 6,
        spCost: 1,
        scoreCost: 1600,
        prerequisites: ['chrome_s2_strike'],
        pos: [0, 9.5, -11.0],
        maxRank: 1,
        abilityUnlockId: 'chrome_ability_phase',
        modifiers: []
      },

      // --- TIER 3 MASTERY NODE (Req Lv 9, Cost 2 SP) ---
      {
        id: 'chrome_s3_mastery',
        skillId: 'SKILL_028',
        stage: 3,
        tier: 3,
        branch: 'mastery',
        displayName: 'Apex Chrome Mastery',
        description: 'Ostateczne mistrzostwo Chrome: +10% prędkości, +10% mnożnika punktów oraz +10% obrażeń wrogów.',
        type: NODE_TYPES.MASTERY_NODE,
        requiredBallLevel: 9,
        spCost: 2,
        scoreCost: 3000,
        prerequisites: ['chrome_s2_apex', 'chrome_s2_vector'],
        pos: [0, 13.5, -15.5],
        maxRank: 1,
        modifiers: [
          { id: 'MOD_024_A', statKey: 'ball.speedScale', operation: 'PERCENT_ADD', value: 0.10, layer: 3, sourceId: 'chrome_s3_mastery' },
          { id: 'MOD_024_B', statKey: 'score.multiplier', operation: 'PERCENT_ADD', value: 0.10, layer: 3, sourceId: 'chrome_s3_mastery' },
          { id: 'MOD_024_C', statKey: 'ball.enemyDamageMultiplier', operation: 'PERCENT_ADD', value: 0.10, layer: 3, sourceId: 'chrome_s3_mastery' }
        ]
      }
    ],
    connections: [
      { from: 'chrome_s1_drive', to: 'chrome_s1_edge' },
      { from: 'chrome_s1_drive', to: 'chrome_s1_spark' },
      { from: 'chrome_s1_edge', to: 'chrome_s2_strike' },
      { from: 'chrome_s1_spark', to: 'chrome_s2_strike' },
      { from: 'chrome_s1_spark', to: 'chrome_s2_vector' },
      { from: 'chrome_s2_strike', to: 'chrome_s2_apex' },
      { from: 'chrome_s2_apex', to: 'chrome_s3_mastery' },
      { from: 'chrome_s2_vector', to: 'chrome_s3_mastery' }
    ]
  }
};
