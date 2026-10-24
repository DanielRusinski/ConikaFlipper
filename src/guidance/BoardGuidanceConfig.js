/**
 * Configuration for the Board Guidance and Board Assistance Systems.
 * Centralizes all timings, animations, and non-intrusive visual feedback parameters.
 */

export const BOARD_GUIDANCE_CONFIG = {
  // Inactivity trigger: 10 seconds without capturing a new valid tile
  guidanceDelayMs: 10000,

  // Feature flags
  enabled: true,
  reducedEffects: false, // Respects reduced motion/graphics if enabled

  // Guidance Marker visuals & animations
  marker: {
    heightOffset: 0.038,       // Height above table surface
    height: 0.50,              // Height of the procedural beam (matches image setup: 0.50)
    coreRadius: 0.001,         // Radius of the intense core beam (matches image: 0.001)
    glowRadius: 0.013,         // Radius of outer soft glow (matches image: 0.013)
    topScale: 0.05,            // Taper factor towards the top of the beam (matches image: 0.05)
    particleCount: 30,         // Number of energetic rising particles (matches image: 30)
    swirlParticleCount: 40,    // Number of swirl particles orbiting around the beam
    particleRadius: 0.050,     // Scatter radius for particles around beam (matches image: 0.050)
    swirlRadius: 0.016,        // Orbit radius around the beam
    particleSize: 0.25,        // Size scale of the rising beam particles (subtle, delicate motes)
    swirlParticleSize: 0.022,  // Size scale of the non-glowing swirling particles (10x smaller)
    swirlParticleOpacity: 0.85,// Opacity / transparency multiplier for swirling particles [0.0 - 1.0]
    bloomBoost: 0.022,         // Beam glow / bloom intensity multiplier (glow settings = 0.022)
    baseGlowOpacity: 0.022,    // Ground contact disc & ring opacity multiplier
    particleBrightness: 0.25,  // Particle glow/emission multiplier (small crisp floating motes)
    color: 0xf55e00,           // Beam color (matches image: #f55e00)
    emissiveColor: 0xf55e00,
    emissiveIntensity: 0.95,
    opacity: 0.88,
    hoverAmplitude: 0.004,     // Subtle vertical bobbing amplitude
    hoverSpeed: 3.2,           // Idle bobbing frequency
    spinSpeed: 2.0,            // Rotation speed
    pulseSpeed: 3.5,           // Glow pulsation speed
    appearDurationMs: 380,     // Quick arcade scale-up duration
    disappearDurationMs: 260   // Snappy collapse on tile capture
  },

  // Additional non-intrusive board feedback
  feedback: {
    // 1. Subtle pulse when only a few capturable tiles remain (<= threshold)
    remainingTilesNoticeThreshold: 5,
    
    // 2. Proximity edge glow hint for immediate adjacent uncaptured tiles
    nearbyCapturableHighlight: false, // Disabled by default for maximum performance & cleanliness

    // 3. Audio chime on guidance marker appearance
    markerSoundPitch: 1200,
    markerSoundDuration: 0.18,
    resolveSoundPitch: 1550,
    resolveSoundDuration: 0.22
  }
};
