const isMobile = typeof navigator !== 'undefined' && (
  /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '') ||
  (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0 && typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 768)
);

export const GRAPHICS_CONFIG = {
  isMobile,
  pixelRatioCap: isMobile ? 1.15 : 2.0,
  quality: {
    high: {
      pixelRatio: isMobile ? 1.15 : 2.0,
      shadowMapSize: isMobile ? 512 : 1024,
      bloomEnabled: !isMobile,
      bloomStrength: 0.35,
      bloomRadius: 1.0,
      bloomThreshold: 0.80,
      postProcessing: !isMobile,
      shaderQuality: isMobile ? 1 : 2,
      grainIntensity: isMobile ? 0 : 0.08,
      shadows: true
    },
    medium: {
      pixelRatio: 1.0,
      shadowMapSize: 512,
      bloomEnabled: false,
      bloomStrength: 0,
      bloomRadius: 0,
      bloomThreshold: 1,
      postProcessing: false,
      shaderQuality: 1,
      grainIntensity: 0,
      shadows: true
    },
    low: {
      pixelRatio: 1.0,
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
  fps: { target: 60, budgetMs: 16.67, minSustained: 30 },
  adaptiveQuality: {
    enabled: true,
    decreaseThreshold: 45,
    increaseThreshold: 58,
    decreaseFrames: 25,
    increaseFrames: 150
  },
  fog: { enabled: true, color: 0x1a1a2e, near: 1.5, far: 4.0 },
  transition: { duration: 800 },
  saturation: 1.0
};

