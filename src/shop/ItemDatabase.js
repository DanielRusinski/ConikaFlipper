/**
 * Central Item and Product Database.
 * Serves as the authoritative registry for all items, gear, and products in the game.
 */

export const ITEM_DATABASE = [
  // ==========================================
  // 1. ACCESSORIES (Akcesoria)
  // ==========================================
  {
    id: 'magnet_amulet',
    name: 'Magnesowy Amulet',
    nameEn: 'Magnet Amulet',
    category: 'accessories',
    description: 'Przyciąga kryształy i monety znajdujące się w pobliżu toczącej się bili.',
    icon: '🧲',
    priceYellow: 120,
    priceRed: 0,
    sellYellow: 60,
    sellRed: 0,
    stackable: false,
    maxStack: 1,
    rarity: 'uncommon',
    unlocked: true,
    sellable: true
  },
  {
    id: 'chrono_ring',
    name: 'Pierścień Czasu',
    nameEn: 'Chrono Ring',
    category: 'accessories',
    description: 'Dodaje +30 sekund do bazowego czasu na każdym etapie.',
    icon: '⏳',
    priceYellow: 180,
    priceRed: 5,
    sellYellow: 90,
    sellRed: 2,
    stackable: false,
    maxStack: 1,
    rarity: 'rare',
    unlocked: true,
    sellable: true
  },
  {
    id: 'lucky_charm',
    name: 'Amulet Szczęścia',
    nameEn: 'Lucky Charm',
    category: 'accessories',
    description: 'Zwiększa szansę na pojawienie się rzadkich kryształów modyfikatorów na planszy.',
    icon: '🍀',
    priceYellow: 250,
    priceRed: 15,
    sellYellow: 125,
    sellRed: 7,
    stackable: false,
    maxStack: 1,
    rarity: 'epic',
    unlocked: true,
    sellable: true
  },
  {
    id: 'heart_locket',
    name: 'Medalion Życia',
    nameEn: 'Heart Locket',
    category: 'accessories',
    description: 'Zwiększa maksymalną liczbę żyć bili o +1.',
    icon: '💖',
    priceYellow: 350,
    priceRed: 25,
    sellYellow: 175,
    sellRed: 12,
    stackable: false,
    maxStack: 1,
    rarity: 'legendary',
    unlocked: true,
    sellable: true
  },

  // ==========================================
  // 2. ITEMS (Przedmioty użytkowe & Consumables)
  // ==========================================
  {
    id: 'bomb_pack',
    name: 'Pakiet Bomb (x3)',
    nameEn: 'Bomb Cluster Pack (x3)',
    category: 'items',
    description: 'Zestaw 3 ładunków wybuchowych do natychmiastowego odkrywania pól w promieniu 3 kafelków.',
    icon: '💣',
    priceYellow: 50,
    priceRed: 0,
    sellYellow: 25,
    sellRed: 0,
    stackable: true,
    maxStack: 5,
    rarity: 'common',
    unlocked: true,
    sellable: true
  },
  {
    id: 'health_potion',
    name: 'Eliksir Witalności',
    nameEn: 'Vitality Elixir',
    category: 'items',
    description: 'Przywraca 1 utracone życie bili podczas rozgrywki.',
    icon: '🧪',
    priceYellow: 80,
    priceRed: 2,
    sellYellow: 40,
    sellRed: 1,
    stackable: true,
    maxStack: 5,
    rarity: 'common',
    unlocked: true,
    sellable: true
  },
  {
    id: 'time_capsule',
    name: 'Kapsuła Czasu',
    nameEn: 'Time Capsule',
    category: 'items',
    description: 'Dodaje natychmiast +45 sekund do licznika bieżącego etapu.',
    icon: '⏱️',
    priceYellow: 60,
    priceRed: 0,
    sellYellow: 30,
    sellRed: 0,
    stackable: true,
    maxStack: 5,
    rarity: 'common',
    unlocked: true,
    sellable: true
  },
  {
    id: 'speed_tonic',
    name: 'Tonik Szybkości',
    nameEn: 'Swift Tonic',
    category: 'items',
    description: 'Zwiększa prędkość toczenia o 40% na 20 sekund.',
    icon: '⚡',
    priceYellow: 40,
    priceRed: 0,
    sellYellow: 20,
    sellRed: 0,
    stackable: true,
    maxStack: 5,
    rarity: 'common',
    unlocked: true,
    sellable: true
  },

  // ==========================================
  // 3. WEAPONS (Broń)
  // ==========================================
  {
    id: 'laser_cutter',
    name: 'Promienny Ostrzarz',
    nameEn: 'Laser Cutter',
    category: 'weapons',
    description: 'Emituje falę plazmową neutralizującą wrogów i przeszkody na swojej drodze.',
    icon: '🗡️',
    priceYellow: 220,
    priceRed: 10,
    sellYellow: 110,
    sellRed: 5,
    stackable: false,
    maxStack: 1,
    rarity: 'rare',
    unlocked: true,
    sellable: true
  },
  {
    id: 'shockwave_hammer',
    name: 'Młot Wstrząsowy',
    nameEn: 'Quake Hammer',
    category: 'weapons',
    description: 'Uderzenie o ścianę lub zderzak wywołuje wstrząs obracający okoliczne kafelki.',
    icon: '🔨',
    priceYellow: 300,
    priceRed: 20,
    sellYellow: 150,
    sellRed: 10,
    stackable: false,
    maxStack: 1,
    rarity: 'epic',
    unlocked: true,
    sellable: true
  },
  {
    id: 'dragon_horn',
    name: 'Róg Przywołania Smoka',
    nameEn: 'Dragon Horn',
    category: 'weapons',
    description: 'Przywołuje mistycznego smoka przelatującego nad planszą i odkrywającego kafelki.',
    icon: '🐉',
    priceYellow: 450,
    priceRed: 35,
    sellYellow: 225,
    sellRed: 18,
    stackable: false,
    maxStack: 1,
    rarity: 'legendary',
    unlocked: true,
    sellable: true
  },

  // ==========================================
  // 4. SHIELDS (Tarcze)
  // ==========================================
  {
    id: 'prism_aegis',
    name: 'Tarcza Pryzmatyczna',
    nameEn: 'Prism Aegis',
    category: 'shields',
    description: 'Odbija i neutralizuje jedno bezpośrednie trafienie wiązką lasera.',
    icon: '🛡️',
    priceYellow: 150,
    priceRed: 5,
    sellYellow: 75,
    sellRed: 2,
    stackable: false,
    maxStack: 1,
    rarity: 'uncommon',
    unlocked: true,
    sellable: true
  },
  {
    id: 'kinetic_ward',
    name: 'Bariera Kinetyczna',
    nameEn: 'Kinetic Ward',
    category: 'shields',
    description: 'Zmniejsza siłę odrzutu zderzaków o 50% i daje precyzyjną kontrolę nad torem lotu.',
    icon: '💠',
    priceYellow: 100,
    priceRed: 0,
    sellYellow: 50,
    sellRed: 0,
    stackable: false,
    maxStack: 1,
    rarity: 'common',
    unlocked: true,
    sellable: true
  },
  {
    id: 'radiant_bulwark',
    name: 'Aegis Świetlistości',
    nameEn: 'Radiant Bulwark',
    category: 'shields',
    description: 'Kompletna osłona energetyczna chroniąca przed kolizjami z wrogami.',
    icon: '✨',
    priceYellow: 380,
    priceRed: 30,
    sellYellow: 190,
    sellRed: 15,
    stackable: false,
    maxStack: 1,
    rarity: 'legendary',
    unlocked: true,
    sellable: true
  },

  // ==========================================
  // 5. CRYSTALS (Kryształy)
  // ==========================================
  {
    id: 'amber_core',
    name: 'Bursztynowy Rdzeń',
    nameEn: 'Amber Core',
    category: 'crystals',
    description: 'Katalizator zwiększający wartość zbieranych żółtych monet o +50%.',
    icon: '🔶',
    priceYellow: 160,
    priceRed: 0,
    sellYellow: 80,
    sellRed: 0,
    stackable: false,
    maxStack: 1,
    rarity: 'rare',
    unlocked: true,
    sellable: true
  },
  {
    id: 'crimson_geode',
    name: 'Karminowa Geoda',
    nameEn: 'Crimson Geode',
    category: 'crystals',
    description: 'Dwukrotnie zwiększa szansę na zdobycie rzadkich czerwonych monet z kafelków.',
    icon: '♦️',
    priceYellow: 280,
    priceRed: 18,
    sellYellow: 140,
    sellRed: 9,
    stackable: false,
    maxStack: 1,
    rarity: 'epic',
    unlocked: true,
    sellable: true
  },
  {
    id: 'emerald_relic',
    name: 'Szmaragdowy Relikt',
    nameEn: 'Emerald Relic',
    category: 'crystals',
    description: 'Co 25 odkrytych kafelków generuje leczniczy kryształ szmaragdowy.',
    icon: '💚',
    priceYellow: 400,
    priceRed: 40,
    sellYellow: 200,
    sellRed: 20,
    stackable: false,
    maxStack: 1,
    rarity: 'legendary',
    unlocked: true,
    sellable: true
  },

  // ==========================================
  // 6. ORBS (Kule / Bile)
  // ==========================================
  {
    id: 'brass_orb',
    name: 'Mosiężna Bila',
    nameEn: 'Brass Sphere',
    category: 'orbs',
    ballType: 'brass',
    description: 'Klasyczna, zrównoważona bila mosiężna o optymalnej wadze i uniwersalnym sterowaniu.',
    icon: '🟡',
    priceYellow: 0,
    priceRed: 0,
    sellYellow: 0,
    sellRed: 0,
    stackable: false,
    maxStack: 1,
    rarity: 'common',
    unlocked: true,
    isDefault: true,
    sellable: false // Default ball cannot be sold
  },
  {
    id: 'wood_orb',
    name: 'Drewniana Bila',
    nameEn: 'Hardwood Sphere',
    category: 'orbs',
    ballType: 'wood',
    description: 'Lekka bila z drewna egzotycznego o błyskawicznym przyspieszeniu i dużej zwinności.',
    icon: '🪵',
    priceYellow: 120,
    priceRed: 0,
    sellYellow: 60,
    sellRed: 0,
    stackable: false,
    maxStack: 1,
    rarity: 'uncommon',
    unlocked: true,
    sellable: true
  },
  {
    id: 'marble_orb',
    name: 'Marmurowa Bila',
    nameEn: 'Polished Marble',
    category: 'orbs',
    ballType: 'marble',
    description: 'Ciężka ceramiczna kula o gładkim poślizgu, odporna na gwałtowne odrzuty zderzaków.',
    icon: '⚪',
    priceYellow: 180,
    priceRed: 5,
    sellYellow: 90,
    sellRed: 2,
    stackable: false,
    maxStack: 1,
    rarity: 'rare',
    unlocked: true,
    sellable: true
  },
  {
    id: 'chrome_orb',
    name: 'Lustrzana Bila Chrome',
    nameEn: 'Cyber Chrome Steel',
    category: 'orbs',
    ballType: 'chrome',
    description: 'Zaawansowana kula stalowa z neonowym pasem energetycznym i najwyższą stabilnością.',
    icon: '🟣',
    priceYellow: 500,
    priceRed: 50,
    sellYellow: 250,
    sellRed: 25,
    stackable: false,
    maxStack: 1,
    rarity: 'legendary',
    unlocked: true,
    sellable: true
  }
];

class ItemDatabaseManager {
  constructor() {
    this._items = new Map();
    for (const item of ITEM_DATABASE) {
      this._items.set(item.id, item);
    }
  }

  get(id) {
    return this._items.get(id) || null;
  }

  has(id) {
    return this._items.has(id);
  }

  getByCategory(categoryId) {
    const results = [];
    for (const item of this._items.values()) {
      if (item.category === categoryId) {
        results.push(item);
      }
    }
    return results;
  }

  getByBallType(ballType) {
    for (const item of this._items.values()) {
      if (item.ballType === ballType) {
        return item;
      }
    }
    return null;
  }

  getAll() {
    return Array.from(this._items.values());
  }

  registerItem(item) {
    if (!item || !item.id) {
      console.warn('[ItemDatabase] Cannot register item without id');
      return;
    }
    this._items.set(item.id, item);
  }
}

export const itemDatabase = new ItemDatabaseManager();
