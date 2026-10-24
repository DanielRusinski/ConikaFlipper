/**
 * Configuration for the Shop System.
 * Defines supported categories, pricing constants, and shop behavior.
 */

export const SHOP_CATEGORIES = [
  {
    id: 'accessories',
    label: 'Akcesoria',
    labelEn: 'Accessories',
    icon: '💍',
    description: 'Amulety, pierścienie i talizmany wspomagające pasywne zdolności bili.'
  },
  {
    id: 'items',
    label: 'Przedmioty',
    labelEn: 'Items',
    icon: '🧪',
    description: 'Przedmioty użytkowe, mikstury i aktywne wyposażenie bitewne.'
  },
  {
    id: 'weapons',
    label: 'Broń',
    labelEn: 'Weapons',
    icon: '⚔️',
    description: 'Oręż ofensywny do eliminacji przeszkód, wrogów i stonóg.'
  },
  {
    id: 'shields',
    label: 'Tarcze',
    labelEn: 'Shields',
    icon: '🛡️',
    description: 'Bariery kinetyczne i osłony absorbujące wiązki laserowe oraz zderzenia.'
  },
  {
    id: 'crystals',
    label: 'Kryształy',
    labelEn: 'Crystals',
    icon: '💎',
    description: 'Mistyczne rdzenie i katalizatory zwielokrotniające nagrody i zasoby.'
  },
  {
    id: 'orbs',
    label: 'Kule',
    labelEn: 'Orbs',
    icon: '🔮',
    description: 'Unikalne bile z różnymi właściwościami fizycznymi, wagą i stylem toczenia.'
  }
];

export const SHOP_UI_STATES = {
  CLOSED: 'closed',
  OPENING: 'opening',
  OPEN: 'open',
  TRANSACTION_IN_PROGRESS: 'transaction_in_progress',
  CLOSING: 'closing'
};

export const SHOP_ENTRY_CONTEXTS = {
  PRE_LEVEL: 'PRE_LEVEL',
  IN_LEVEL_SHOP_TILE: 'IN_LEVEL_SHOP_TILE'
};

export const SHOP_CONFIG = {
  tileSpawnThreshold: 0.40, // Spawn shop tile after > 40% capturable tiles conquered
  tileInteractionCooldown: 2.0, // Seconds before shop tile can trigger again
  startingYellowCoins: 150,
  startingRedCoins: 10,
  toastDuration: 2200 // ms
};
