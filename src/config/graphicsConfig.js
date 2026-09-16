export const GRAPHICS_CONFIG = {
  pixelRatioCap: 2,
  quality: {
    high: { pixelRatio:2, shadowMapSize:1024, bloomEnabled:true, bloomStrength:0.35, bloomRadius:1.0, bloomThreshold:0.80, postProcessing:true, shaderQuality:2, grainIntensity:0.08 },
    medium: { pixelRatio:1.5, shadowMapSize:512, bloomEnabled:false, bloomStrength:0, bloomRadius:0, bloomThreshold:1, postProcessing:true, shaderQuality:1, grainIntensity:0.05 },
    low: { pixelRatio:1, shadowMapSize:256, bloomEnabled:false, bloomStrength:0, bloomRadius:0, bloomThreshold:1, postProcessing:true, shaderQuality:0, grainIntensity:0.05 }
  },
  toneMapping: 'ACESFilmic',
  toneMappingExposure: 1.0,
  fps: { target:60, budgetMs:16.67, minSustained:30 },
  adaptiveQuality: { enabled:true, decreaseThreshold:45, increaseThreshold:58, decreaseFrames:60, increaseFrames:180 },
  fog: { enabled:true, color:0x1a1a2e, near:1.5, far:4.0 },
  transition: { duration:800 },
  saturation: 1.0
};
