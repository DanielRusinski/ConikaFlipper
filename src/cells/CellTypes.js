/**
 * Centralized Cell and Special Tile Types and Configuration.
 * 
 * Defines supported cell types, default configurations, state machines, and stage rules:
 * - STANDARD (Standard plain tile using cellPlainTile.glb)
 * - COLUMN (Obstacle pillar using cellColumn.glb)
 * - JELLY (Elastic wobble pillar using cellColumn.glb)
 * - COUNTDOWN (Timed capture tile using cellPlainTile.glb)
 * - MULTICOLOUR (Multi-pass sequence tile using cellPlainTile.glb)
 * - PLAYER_OCCUPIED (Conquered player territory)
 */

export const CELL_TYPES = Object.freeze({
    STANDARD: 'STANDARD',
    COLUMN: 'COLUMN',
    JELLY: 'JELLY',
    COUNTDOWN: 'COUNTDOWN',
    MULTICOLOUR: 'MULTICOLOUR',
    GRADIENT: 'GRADIENT',
    GREEN: 'GREEN',
    PLAYER_OCCUPIED: 'PLAYER_OCCUPIED'
});

export const COUNTDOWN_STATES = Object.freeze({
    IDLE: 'idle',
    ACTIVE: 'active',
    INTERRUPTED: 'interrupted',
    COMPLETED: 'completed',
    DISABLED: 'disabled'
});

export const MULTICOLOUR_STATES = Object.freeze({
    IDLE: 'idle',
    ENTERED: 'entered',
    WAITING_FOR_EXIT: 'waitingForExit',
    COLOUR_TRANSITION: 'colourTransition',
    READY_FOR_FINAL_CAPTURE: 'readyForFinalCapture',
    CAPTURED: 'captured',
    DISABLED: 'disabled'
});

/**
 * Multicolour reference palette definition:
 * The 5 bands from reference:
 * 1. #7BF004 - Vivid Lime Green
 * 2. #FC05B8 - Vivid Hot Pink / Flamingo
 * 3. Yellow band: In the reference image, the visible swatch is a bright arcade yellow
 *    while the text label was '#231F20' (dark charcoal). We provide both:
 *    the visible bright arcade yellow '#FFDD00' as default render color, and the original label #231F20.
 * 4. #FA6B05 - Vivid Blaze Orange
 * 5. #0AA9E0 - Vivid Cyan / Sky Blue
 */
export const MULTICOLOUR_CONFIG = {
    // Reference label hexadecimal codes
    referenceHexLabels: [
        '#7BF004',
        '#FC05B8',
        '#231F20', // Visible label text on card
        '#FA6B05',
        '#0AA9E0'
    ],
    // Rendered visual colors (bright arcade yellow for stage 3)
    defaultColours: [
        0x7BF004,
        0xFC05B8,
        0xFFE600, // Bright Arcade Confection Yellow (swatch visual representation)
        0xFA6B05,
        0x0AA9E0
    ],
    // Numeric hexes matching project tests and strict palette
    strictPalette: [
        0x7BF004,
        0xFC05B8,
        0x231F20,
        0xFA6B05,
        0x0AA9E0
    ],
    brightYellowHex: 0xFFE600,
    darkCharcoalHex: 0x231F20,
    requiresFinalCapturePass: true,
    totalPasses: 5
};

export const COUNTDOWN_CONFIG = {
    defaultDurationSeconds: 4,
    captureNeighbourRadius: 1, // 8 surrounding neighbours (3x3 grid)
    interruptionMode: 'reset', // 'reset' | 'pause'
    reusable: false,
    scorePoints: 250,
    neighbourScorePoints: 50
};

export const GRADIENT_STATES = Object.freeze({
    IDLE: 'idle',
    ACTIVE: 'active',
    CAPTURED: 'captured',
    DISABLED: 'disabled'
});

export const GRADIENT_CONFIG = {
    defaultColors: [
        0x00f0ff, // Electric Cyan
        0x7000ff, // Deep Neon Purple
        0xff007b, // Vivid Hot Pink
        0xffb700  // Warm Sun Gold
    ],
    flowSpeed: 1.8,
    angle: 0.785398, // 45 degrees
    scorePoints: 200
};

export const GREEN_STATES = Object.freeze({
    IDLE: 'idle',
    ACTIVE: 'active',
    CAPTURED: 'captured',
    DISABLED: 'disabled'
});

export const GREEN_CONFIG = {
    color: 0x00E676,          // Radiant arcade emerald green
    colorHexStr: '#00E676',
    scorePoints: 175,
    pulseSpeed: 3.0,
    randomMinCount: 2,
    randomMaxCount: 4
};
