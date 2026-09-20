const isMobile = typeof navigator !== 'undefined' && (
  /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '') ||
  (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0 && typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 768)
);

export const PERFORMANCE_CONFIG = {
  TARGET_FPS: 60,
  MIN_FPS: 50,
  QUALITY_UP_THRESHOLD: 62,
  QUALITY_DOWN_THRESHOLD: 50,
  QUALITY_UP_DELAY: 3.5,        // Seconds of sustained FPS > 62 before upgrading
  QUALITY_DOWN_DELAY: 0.6,      // Seconds of sustained FPS < 50 before downgrading
  QUALITY_CHANGE_COOLDOWN: 2.0, // Cooldown in seconds between quality level changes
  FPS_SAMPLE_SIZE: 60,          // Rolling average frame buffer
  MIN_PIXEL_RATIO: 0.75,
  MAX_PIXEL_RATIO: isMobile ? 0.85 : 2.0,
  DEBUG_PERFORMANCE: false,     // Performance debug overlay flag

  // 4 comprehensive quality levels
  levels: {
    low: {
      name: 'LOW',
      pixelRatio: isMobile ? 0.70 : 0.85,
      shadows: false,
      shadowMapSize: 256,
      shadowType: 'basic',
      shadowUpdateFrequency: 0,
      shadowLightsCount: 0,
      particlesMax: 60,
      particleLifetime: 0.35,
      particleUpdateSkip: 2,
      postProcessing: false,
      bloomEnabled: false,
      bloomStrength: 0,
      bloomRadius: 0,
      bloomThreshold: 1.0,
      grainIntensity: 0,
      lodDistanceFactor: 0.6,
      updateThrottling: true,
      maxActiveCrystalsVisible: 15,
      anisotropy: 1
    },
    medium: {
      name: 'MEDIUM',
      pixelRatio: isMobile ? 0.80 : 1.15,
      shadows: true,
      shadowMapSize: 512,
      shadowType: 'pcf',
      shadowUpdateFrequency: 2, // Every 2nd frame
      shadowLightsCount: 1,
      particlesMax: 100,
      particleLifetime: 0.45,
      particleUpdateSkip: 1,
      postProcessing: true,
      bloomEnabled: true,
      bloomStrength: isMobile ? 0.18 : 0.22,
      bloomRadius: isMobile ? 0.45 : 0.60,
      bloomThreshold: 0.84,
      grainIntensity: 0.04,
      lodDistanceFactor: 0.85,
      updateThrottling: true,
      maxActiveCrystalsVisible: 15,
      anisotropy: 2
    },
    high: {
      name: 'HIGH',
      pixelRatio: isMobile ? 0.82 : 1.5,
      shadows: true,
      shadowMapSize: 1024,
      shadowType: 'pcfsoft',
      shadowUpdateFrequency: 1, // Every frame
      shadowLightsCount: 1,
      particlesMax: 200,
      particleLifetime: 0.50,
      particleUpdateSkip: 1,
      postProcessing: true,
      bloomEnabled: true,
      bloomStrength: isMobile ? 0.20 : 0.28,
      bloomRadius: isMobile ? 0.50 : 0.75,
      bloomThreshold: 0.84,
      grainIntensity: 0.04,
      lodDistanceFactor: 1.0,
      updateThrottling: false,
      maxActiveCrystalsVisible: 15,
      anisotropy: 4
    },
    ultra: {
      name: 'ULTRA',
      pixelRatio: isMobile ? 0.85 : 2.0,
      shadows: true,
      shadowMapSize: 2048,
      shadowType: 'pcfsoft',
      shadowUpdateFrequency: 1,
      shadowLightsCount: 1,
      particlesMax: 300,
      particleLifetime: 0.60,
      particleUpdateSkip: 1,
      postProcessing: true,
      bloomEnabled: true,
      bloomStrength: 0.30,
      bloomRadius: 0.80,
      bloomThreshold: 0.82,
      grainIntensity: 0.04,
      lodDistanceFactor: 1.25,
      updateThrottling: false,
      maxActiveCrystalsVisible: 15,
      anisotropy: 8
    }
  }
};

export const GRAPHICS_CONFIG = {
  isMobile,
  pixelRatioCap: isMobile ? 0.82 : 2.0,
  quality: PERFORMANCE_CONFIG.levels,
  toneMapping: 'ACESFilmic',
  toneMappingExposure: 1.0,
  fps: { target: 60, budgetMs: 16.67, minSustained: 50 },
  adaptiveQuality: {
    enabled: true,
    decreaseThreshold: 50,
    increaseThreshold: 62,
    decreaseFrames: 15,
    increaseFrames: 150
  },
  fog: { enabled: true, color: 0x1a1a2e, near: 1.5, far: 4.0 },
  transition: { duration: 800 },
  saturation: 1.0
};

