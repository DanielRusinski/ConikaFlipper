export const GAME_CONFIG = {
  grid: { tilesX:18, tilesY:36, tileGap:0.06 },
  table: { width:0.514, height:1.07 },
  physics: { gravity:9.81, maxSpeed:5.5, linearDamping:0.1, physicsDt:1/120, maxTilt:15*Math.PI/180, maxSubsteps:5, skinWidth:1e-4, restThreshold:0.22, wallRestitution:0.4, wallFriction:0.1 },
  ball: { radius:0.0135, defaultType:'brass', types:['brass','marble','wood','chrome'] },
  obstacles: { density:0.08, safeRadius:3, maxRetries:10 },
  lives: { starting:3 },
  timer: { startingSeconds:300 },
  slowMotion: { scale:0.04 },
  camera: { height:0.85, followStrength:0.35, lerpSpeed:4.5, zOffset:0.44 },
  spawn: { defaultGridX:9, defaultGridY:18 }
};
