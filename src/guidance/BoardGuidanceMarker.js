import * as THREE from 'three';
import anime from 'animejs';
import { BOARD_GUIDANCE_CONFIG } from './BoardGuidanceConfig.js';
import { ItemBeam } from '../effects/itemBeam.js';
import { playSound } from '../soundfx.js';

/**
 * BoardGuidanceMarker
 * Represents the 3D visual beacon positioned over the targeted uncaptured tile.
 * Exclusively uses the procedural ItemBeam effect with animated core, outer volumetric glow,
 * ground contact disc & ring, and surrounding rising energy particles.
 */
export class BoardGuidanceMarker {
  /**
   * @param {THREE.Group} parentGroup The parent Three.js group (e.g. boardGroup)
   * @param {Object} tileData { gridX, gridY, index, worldX, worldZ }
   */
  constructor(parentGroup, tileData) {
    this._parentGroup = parentGroup;
    this.tileData = tileData;
    this.isActive = true;

    this._group = new THREE.Group();
    this._group.name = `BoardGuidanceMarker_${tileData.index}`;
    // Position at tile center, with beam foot exactly at board surface (y = 0.002)
    const cfg = BOARD_GUIDANCE_CONFIG.marker;
    const beamHeight = cfg.height || 0.16;
    this._group.position.set(tileData.worldX, beamHeight * 0.5 + 0.002, tileData.worldZ);

    this._animTime = 0;
    this._activeTween = null;
    this._itemBeam = null;

    this._buildMesh(beamHeight);
    this._playAppearAnimation();
  }

  _buildMesh(beamHeight) {
    const cfg = BOARD_GUIDANCE_CONFIG.marker;

    // Procedural ItemBeam sized appropriately for table tile dimensions (~0.028 width)
    try {
      this._itemBeam = new ItemBeam(this._group, {
        color: cfg.color || 0x00f0ff,
        position: new THREE.Vector3(0, 0, 0),
        height: beamHeight,
        coreRadius: cfg.coreRadius || 0.0035,
        glowRadius: cfg.glowRadius || 0.0125,
        topScale: cfg.topScale !== undefined ? cfg.topScale : 0.20,
        particleCount: cfg.particleCount !== undefined ? cfg.particleCount : 24,
        swirlParticleCount: cfg.swirlParticleCount !== undefined ? cfg.swirlParticleCount : 40,
        particleRadius: cfg.particleRadius || 0.018,
        swirlRadius: cfg.swirlRadius || 0.016,
        particleSize: cfg.particleSize !== undefined ? cfg.particleSize : 0.25,
        swirlParticleSize: cfg.swirlParticleSize !== undefined ? cfg.swirlParticleSize : 0.022,
        swirlParticleOpacity: cfg.swirlParticleOpacity !== undefined ? cfg.swirlParticleOpacity : 0.85,
        bloomBoost: cfg.bloomBoost !== undefined ? cfg.bloomBoost : 0.022,
        baseGlowOpacity: cfg.baseGlowOpacity !== undefined ? cfg.baseGlowOpacity : 0.022,
        particleBrightness: cfg.particleBrightness !== undefined ? cfg.particleBrightness : 1.0,
        enableLights: false
      });
    } catch (err) {
      console.warn('[BoardGuidanceMarker] ItemBeam instantiation failed:', err);
    }

    if (this._parentGroup) {
      this._parentGroup.add(this._group);
    }
  }

  _playAppearAnimation() {
    const cfg = BOARD_GUIDANCE_CONFIG.marker;
    this._group.scale.set(0.001, 0.001, 0.001);

    if (BOARD_GUIDANCE_CONFIG.reducedEffects) {
      this._group.scale.set(1, 1, 1);
      return;
    }

    try {
      playSound(BOARD_GUIDANCE_CONFIG.feedback.markerSoundPitch, BOARD_GUIDANCE_CONFIG.feedback.markerSoundDuration);
    } catch (_) {}

    this._activeTween = anime({
      targets: this._group.scale,
      x: [0.001, 1],
      y: [0.001, 1],
      z: [0.001, 1],
      duration: cfg.appearDurationMs,
      easing: 'easeOutBack',
      complete: () => {
        this._activeTween = null;
      }
    });
  }

  update(delta) {
    if (!this.isActive || !this._group) return;
    this._animTime += delta;

    if (this._itemBeam && typeof this._itemBeam.update === 'function') {
      this._itemBeam.update(this._animTime);
    }
  }

  /**
   * Plays snappy collapse/fade disappearance animation and cleans up meshes.
   * @param {Function} onComplete Callback after animation finishes
   */
  disappear(onComplete = null) {
    if (!this.isActive) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    this.isActive = false;

    if (this._activeTween) {
      try { this._activeTween.pause(); } catch (_) {}
      this._activeTween = null;
    }

    try {
      playSound(BOARD_GUIDANCE_CONFIG.feedback.resolveSoundPitch, BOARD_GUIDANCE_CONFIG.feedback.resolveSoundDuration);
    } catch (_) {}

    const cfg = BOARD_GUIDANCE_CONFIG.marker;

    if (BOARD_GUIDANCE_CONFIG.reducedEffects) {
      this.dispose();
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    this._activeTween = anime({
      targets: this._group.scale,
      x: [1, 0.001],
      y: [1, 1.8],
      z: [1, 0.001],
      duration: cfg.disappearDurationMs,
      easing: 'easeInBack',
      complete: () => {
        this._activeTween = null;
        this.dispose();
        if (typeof onComplete === 'function') onComplete();
      }
    });
  }

  dispose() {
    this.isActive = false;

    if (this._activeTween) {
      try { this._activeTween.pause(); } catch (_) {}
      this._activeTween = null;
    }

    if (this._itemBeam) {
      if (typeof this._itemBeam.dispose === 'function') {
        this._itemBeam.dispose();
      }
      this._itemBeam = null;
    }

    if (this._parentGroup && this._group && this._group.parent === this._parentGroup) {
      this._parentGroup.remove(this._group);
    }
    this._group = null;
    this._parentGroup = null;
  }
}
