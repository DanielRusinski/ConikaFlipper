/**
 * EquipmentConfig.js
 * Authoritative registry of equipment items, slots, and modifier mappings.
 * Strictly aligned with:
 * - 07_EQUIPMENT.csv
 * - 08_MODIFIERS.csv
 * - equipment-slot-framework.csv
 */

export const EQUIPMENT_SLOTS = {
  WEAPON: 'WEAPON',
  SHIELD: 'SHIELD',
  ACCESSORY: 'ACCESSORY',
  CRYSTAL: 'CRYSTAL'
};

export const CONSUMABLE_SLOT = 'BATTLE_CONSUMABLE';

export const EQUIPMENT_SLOT_DEFINITIONS = {
  WEAPON: {
    id: 'SLOT_001',
    key: 'WEAPON',
    label: 'Broń',
    labelEn: 'Weapon',
    icon: '⚔️',
    category: 'weapons',
    maxEquipped: 1
  },
  SHIELD: {
    id: 'SLOT_002',
    key: 'SHIELD',
    label: 'Tarcza',
    labelEn: 'Shield',
    icon: '🛡️',
    category: 'shields',
    maxEquipped: 1
  },
  ACCESSORY: {
    id: 'SLOT_003',
    key: 'ACCESSORY',
    label: 'Akcesorium',
    labelEn: 'Accessory',
    icon: '💍',
    category: 'accessories',
    maxEquipped: 1
  },
  CRYSTAL: {
    id: 'SLOT_004',
    key: 'CRYSTAL',
    label: 'Kryształ',
    labelEn: 'Crystal',
    icon: '💎',
    category: 'crystals',
    maxEquipped: 1
  }
};

/**
 * 13 Permanent Equipment Items from 07_EQUIPMENT.csv & 08_MODIFIERS.csv
 */
export const EQUIPMENT_DEFINITIONS = {
  // WEAPONS
  laser_cutter: {
    id: 'laser_cutter',
    itemId: 'ITEM_009',
    name: 'Promienny Ostrzarz',
    nameEn: 'Laser Cutter',
    slot: 'WEAPON',
    category: 'weapons',
    icon: '🗡️',
    modifier: {
      id: 'MOD_052',
      statKey: 'hazard.laserCorridorDisabledCount',
      operation: 'ADD',
      value: 1,
      layer: 4,
      sourceId: 'laser_cutter'
    }
  },
  shockwave_hammer: {
    id: 'shockwave_hammer',
    itemId: 'ITEM_010',
    name: 'Młot Wstrząsowy',
    nameEn: 'Quake Hammer',
    slot: 'WEAPON',
    category: 'weapons',
    icon: '🔨',
    modifier: {
      id: 'MOD_053',
      statKey: 'bomb.blastRadiusMultiplier',
      operation: 'PERCENT_ADD',
      value: 0.25,
      layer: 4,
      sourceId: 'shockwave_hammer'
    }
  },
  dragon_horn: {
    id: 'dragon_horn',
    itemId: 'ITEM_011',
    name: 'Róg Przywołania Smoka',
    nameEn: 'Dragon Horn',
    slot: 'WEAPON',
    category: 'weapons',
    icon: '🐉',
    modifier: {
      id: 'MOD_054',
      statKey: 'ability.dragonDurationSeconds',
      operation: 'ADD',
      value: 4.0,
      layer: 4,
      sourceId: 'dragon_horn'
    }
  },

  // SHIELDS
  prism_aegis: {
    id: 'prism_aegis',
    itemId: 'ITEM_012',
    name: 'Tarcza Pryzmatyczna',
    nameEn: 'Prism Aegis',
    slot: 'SHIELD',
    category: 'shields',
    icon: '🛡️',
    modifier: {
      id: 'MOD_055',
      statKey: 'player.laserShieldCharges',
      operation: 'ADD',
      value: 1,
      layer: 4,
      sourceId: 'prism_aegis'
    }
  },
  kinetic_ward: {
    id: 'kinetic_ward',
    itemId: 'ITEM_013',
    name: 'Bariera Kinetyczna',
    nameEn: 'Kinetic Ward',
    slot: 'SHIELD',
    category: 'shields',
    icon: '💠',
    modifier: {
      id: 'MOD_056',
      statKey: 'ball.bumperDampening',
      operation: 'PERCENT_ADD',
      value: 0.50,
      layer: 4,
      sourceId: 'kinetic_ward'
    }
  },
  radiant_bulwark: {
    id: 'radiant_bulwark',
    itemId: 'ITEM_014',
    name: 'Aegis Świetlistości',
    nameEn: 'Radiant Bulwark',
    slot: 'SHIELD',
    category: 'shields',
    icon: '✨',
    modifier: {
      id: 'MOD_057',
      statKey: 'bomb.selfDamageImmune',
      operation: 'ENABLE',
      value: true,
      priority: 1,
      layer: 4,
      sourceId: 'radiant_bulwark'
    }
  },

  // ACCESSORIES
  magnet_amulet: {
    id: 'magnet_amulet',
    itemId: 'ITEM_001',
    name: 'Magnesowy Amulet',
    nameEn: 'Magnet Amulet',
    slot: 'ACCESSORY',
    category: 'accessories',
    icon: '🧲',
    modifier: {
      id: 'MOD_044',
      statKey: 'ball.pickupRadiusMultiplier',
      operation: 'PERCENT_ADD',
      value: 0.25,
      layer: 4,
      sourceId: 'magnet_amulet'
    }
  },
  chrono_ring: {
    id: 'chrono_ring',
    itemId: 'ITEM_002',
    name: 'Pierścień Czasu',
    nameEn: 'Chrono Ring',
    slot: 'ACCESSORY',
    category: 'accessories',
    icon: '⏳',
    modifier: {
      id: 'MOD_045',
      statKey: 'player.stageTimeBonusSeconds',
      operation: 'ADD',
      value: 30,
      layer: 4,
      sourceId: 'chrono_ring'
    }
  },
  lucky_charm: {
    id: 'lucky_charm',
    itemId: 'ITEM_003',
    name: 'Amulet Szczęścia',
    nameEn: 'Lucky Charm',
    slot: 'ACCESSORY',
    category: 'accessories',
    icon: '🍀',
    modifier: {
      id: 'MOD_046',
      statKey: 'pickup.findingUncoverProbability',
      operation: 'PERCENT_ADD',
      value: 0.20,
      layer: 4,
      sourceId: 'lucky_charm'
    }
  },
  heart_locket: {
    id: 'heart_locket',
    itemId: 'ITEM_004',
    name: 'Medalion Życia',
    nameEn: 'Heart Locket',
    slot: 'ACCESSORY',
    category: 'accessories',
    icon: '💖',
    modifier: {
      id: 'MOD_047',
      statKey: 'player.startingLives',
      operation: 'ADD',
      value: 1,
      layer: 4,
      sourceId: 'heart_locket'
    }
  },

  // CRYSTALS
  amber_core: {
    id: 'amber_core',
    itemId: 'ITEM_015',
    name: 'Bursztynowy Rdzeń',
    nameEn: 'Amber Core',
    slot: 'CRYSTAL',
    category: 'crystals',
    icon: '🔶',
    modifier: {
      id: 'MOD_058',
      statKey: 'score.yellowCoinFlatBonus',
      operation: 'ADD',
      value: 5,
      layer: 4,
      sourceId: 'amber_core'
    }
  },
  crimson_geode: {
    id: 'crimson_geode',
    itemId: 'ITEM_016',
    name: 'Karminowa Geoda',
    nameEn: 'Crimson Geode',
    slot: 'CRYSTAL',
    category: 'crystals',
    icon: '♦️',
    modifier: {
      id: 'MOD_059',
      statKey: 'pickup.redCoinProbability',
      operation: 'ADD',
      value: 0.15,
      layer: 4,
      sourceId: 'crimson_geode'
    }
  },
  emerald_relic: {
    id: 'emerald_relic',
    itemId: 'ITEM_017',
    name: 'Szmaragdowy Relikt',
    nameEn: 'Emerald Relic',
    slot: 'CRYSTAL',
    category: 'crystals',
    icon: '💚',
    modifier: {
      id: 'MOD_060',
      statKey: 'score.emeraldCrystalFlatBonus',
      operation: 'ADD',
      value: 300,
      layer: 4,
      sourceId: 'emerald_relic'
    }
  }
};

/**
 * 4 Battle Consumables from 07_EQUIPMENT.csv & 08_MODIFIERS.csv
 */
export const CONSUMABLE_DEFINITIONS = {
  health_potion: {
    id: 'health_potion',
    itemId: 'ITEM_005',
    name: 'Eliksir Witalności',
    nameEn: 'Vitality Elixir',
    icon: '🧪',
    maxCarryCount: 5,
    effectType: 'LIFE_RESTORE',
    value: 1
  },
  bomb_pack: {
    id: 'bomb_pack',
    itemId: 'ITEM_006',
    name: 'Pakiet Bomb (x3)',
    nameEn: 'Bomb Cluster Pack (x3)',
    icon: '💣',
    maxCarryCount: 5,
    effectType: 'BOMB_GRANT',
    value: 3
  },
  time_capsule: {
    id: 'time_capsule',
    itemId: 'ITEM_007',
    name: 'Kapsuła Czasu',
    nameEn: 'Time Capsule',
    icon: '⏱️',
    maxCarryCount: 5,
    effectType: 'STAGE_TIME_ADD',
    value: 45
  },
  speed_tonic: {
    id: 'speed_tonic',
    itemId: 'ITEM_008',
    name: 'Tonik Szybkości',
    nameEn: 'Swift Tonic',
    icon: '⚡',
    maxCarryCount: 5,
    effectType: 'TEMP_SPEED_BUFF',
    multiplier: 1.35,
    duration: 25.0
  }
};
