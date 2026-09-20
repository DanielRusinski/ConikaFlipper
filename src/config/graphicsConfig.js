const isMobile = typeof navigator !== 'undefined' && (
  /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '') ||
  (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0 && typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 768)
);

export const GRAPHICS_CONFIG = {
  isMobile,
  pixelRatioCap: isMobile ? 0.82 : 2.0,
  quality: {
    high: {
      pixelRatio: isMobile ? 0.82 : 2.0,
      shadowMapSize: isMobile ? 512 : 1024,
      bloomEnabled: true,
      bloomStrength: isMobile ? 0.20 : 0.28,
      bloomRadius: isMobile ? 0.50 : 0.75,
      bloomThreshold: 0.84,
      postProcessing: true,
      shaderQuality: isMobile ? 1 : 2,
      grainIntensity: 0.04,
      shadows: true
    },
    medium: {
      pixelRatio: isMobile ? 0.80 : 1.2,
      shadowMapSize: 512,
      bloomEnabled: true,
      bloomStrength: isMobile ? 0.18 : 0.24,
      bloomRadius: isMobile ? 0.45 : 0.65,
      bloomThreshold: 0.84,
      postProcessing: true,
      shaderQuality: 1,
      grainIntensity: 0.04,
      shadows: true
    },
    low: {
      pixelRatio: isMobile ? 0.70 : 1.0,
      shadowMapSize: 256,
      bloomEnabled: false,
      bloomStrength: 0,
      bloomRadius: 0,
      bloomThreshold: 1,
      postProcessing: false,
      shaderQuality: 0,
      grainIntensity: 0,
      shadows: false
    }
  },
  toneMapping: 'ACESFilmic',
  toneMappingExposure: 1.0,
  fps: { target: 60, budgetMs: 16.67, minSustained: 50 },
  adaptiveQuality: {
    enabled: true,
    decreaseThreshold: 50,
    increaseThreshold: 58,
    decreaseFrames: 15,
    increaseFrames: 150
  },
  fog: { enabled: true, color: 0x1a1a2e, near: 1.5, far: 4.0 },
  transition: { duration: 800 },
  saturation: 1.0
};

