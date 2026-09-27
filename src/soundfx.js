let audioCtx = null;

if (typeof window !== 'undefined') {
  window.addEventListener('click', () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }, { once: true });
}

export function playSound(freq = 900, duration = 0.2) {
  if (typeof window === 'undefined') return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (_) {}
}

/**
 * Sparkling multi-tone musical arpeggio for crystal collections:
 * - Points Crystal (Gold): Sparkling major triad [1050 Hz, 1320 Hz, 1650 Hz]
 * - Emerald Crystal (Life): Radiant life fanfare [880 Hz, 1108 Hz, 1480 Hz, 1760 Hz]
 * - Modifier Crystal (Card): Mystical rising shimmer [950 Hz, 1260 Hz, 1580 Hz, 1900 Hz]
 */
export function playCrystalCollectSound(type = 'points_crystal') {
  if (typeof window === 'undefined') return;
  try {
    if (type === 'emerald_crystal') {
      playSound(880, 0.15);
      setTimeout(() => playSound(1108, 0.18), 45);
      setTimeout(() => playSound(1480, 0.22), 90);
      setTimeout(() => playSound(1760, 0.30), 135);
    } else if (type === 'modifier') {
      playSound(950, 0.15);
      setTimeout(() => playSound(1260, 0.18), 45);
      setTimeout(() => playSound(1580, 0.22), 90);
      setTimeout(() => playSound(1900, 0.30), 135);
    } else {
      // points_crystal
      playSound(1050, 0.12);
      setTimeout(() => playSound(1320, 0.15), 45);
      setTimeout(() => playSound(1650, 0.22), 90);
    }
  } catch (_) {}
}