export const REWARD_CONFIG = {
  findings: { probability: 0.35, lifetime: 10, crystalGeometry: 'tetrahedron', crystalRadius: 0.012, crystalColor: 0x00ffcc, floatHeight: 0.04, floatAmplitude: 0.008, rotationSpeed: 1.5, scaleOnSpawn: 0.01 },
  modifiers: {
    probability: 0.05, lifetime: 15, crystalGeometry: 'octahedron', crystalRadius: 0.015, crystalColor: 0xff6b9d,
    cards: [
      { id: 'scoreMultiplier', title: 'Score ×2', description: 'Double points for 30s', rarity: 'uncommon', effectType: 'scoreMultiplier', effectValue: 2, duration: 30, icon: '⭐' },
      { id: 'findingBoost', title: 'Lucky Find', description: 'Increased discovery rate for 20s', rarity: 'rare', effectType: 'findingProbability', effectValue: 0.35, duration: 20, icon: '🔮' },
      { id: 'speedBoost', title: 'Swift Roll', description: 'Faster movement for 15s', rarity: 'common', effectType: 'speedMultiplier', effectValue: 1.4, duration: 15, icon: '💨' },
      { id: 'bombCluster', title: '3× Bomby', description: 'Upuszczaj bomby na kafelki! Zasięg 3 pól', rarity: 'rare', effectType: 'bombCluster', effectValue: 3, duration: 0, icon: '💣' },
      { id: 'dragonCompanion', title: 'Latający Smok', description: 'Mistyczny wąż odkrywa kafelki przez 6s', rarity: 'legendary', effectType: 'dragonCompanion', effectValue: 1, duration: 6, icon: '🐉' }
    ]
  },
  coins: {
    yellow: { value: 10, color: 0xffd93d, probability: 0.8 },
    red: { value: 50, color: 0xe63946, probability: 0.2 }
  },
  score: { basePerTile: 10 }
};
