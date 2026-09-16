export const GAME_CONFIG = {
  grid: { tilesX:18, tilesY:36, tileGap:0.06 },
  table: { width:0.514, height:1.07 },
  physics: { gravity:9.81, maxSpeed:5.5, linearDamping:0.1, physicsDt:1/480, maxTilt:15*Math.PI/180, maxSubsteps:5, skinWidth:1e-4, restThreshold:0.22, wallRestitution:0.4, wallFriction:0.1 },
  ball: { radius:0.0135, defaultType:'brass', types:['brass','marble','wood'] },
  obstacles: { density:0.08, safeRadius:3, maxRetries:10 },
  lives: { starting:3 },
  timer: { startingSeconds:300 },
  slowMotion: { scale:0.2 },
  camera: { height:1.2, followStrength:0.25, lerpSpeed:4.0, zOffset:0.7 },
  spawn: { defaultGridX:9, defaultGridY:18 }
};
