export const LIGHTING_CONFIG = {
  defaultPreset: 'vivid',
  presets: {
    vivid: {
      hemisphere: { skyColor: 0xffffff, groundColor: 0x444444, intensity: 0.45 },
      directional: { color: 0xffffff, intensity: 1.8, position: { x: 0.9, y: 2.2, z: 0.9 } },
      fill: { color: 0x88ccff, intensity: 0.2, position: { x: -1.5, y: 1.8, z: -1.5 } },
      fog: { color: 0x1a1a2e },
      background: 0x1a1a2e,
      environment: { intensity: 1.0 }
    },
    sunset: {
      hemisphere: { skyColor: 0xff8c00, groundColor: 0x4b0082, intensity: 0.7 },
      directional: { color: 0xff6347, intensity: 1.6, position: { x: -1.5, y: 3.0, z: 2.0 } },
      fill: { color: 0xffa07a, intensity: 0.4, position: { x: 2.0, y: 1.5, z: -2.0 } },
      fog: { color: 0x2b0015 },
      background: 0x2b0015,
      environment: { intensity: 1.2 }
    },
    neonDusk: {
      hemisphere: { skyColor: 0x00ffff, groundColor: 0xff00ff, intensity: 0.5 },
      directional: { color: 0x00ffff, intensity: 1.3, position: { x: 0.5, y: 3.5, z: 1.0 } },
      fill: { color: 0xff00ff, intensity: 0.6, position: { x: 2.0, y: 2.0, z: -2.0 } },
      fog: { color: 0x0d0d1a },
      background: 0x0d0d1a,
      environment: { intensity: 1.5 }
    },
    moonlight: {
      hemisphere: { skyColor: 0x88bbff, groundColor: 0x112233, intensity: 0.3 },
      directional: { color: 0xaaccff, intensity: 1.0, position: { x: 1.2, y: 3.0, z: 1.2 } },
      fill: { color: 0x335588, intensity: 0.3, position: { x: -1.5, y: 2.0, z: -1.5 } },
      fog: { color: 0x050a14 },
      background: 0x050a14,
      environment: { intensity: 0.6 }
    },
    arcade: {
      hemisphere: { skyColor: 0xff0000, groundColor: 0x0000ff, intensity: 0.8 },
      directional: { color: 0x00ff00, intensity: 1.4, position: { x: 1.5, y: 3.5, z: 1.5 } },
      fill: { color: 0xff00ff, intensity: 0.5, position: { x: -2.0, y: 2.0, z: -2.0 } },
      fog: { color: 0x000000 },
      background: 0x000000,
      environment: { intensity: 2.0 }
    }
  }
};
