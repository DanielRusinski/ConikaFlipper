import {
  Group,
  Object3D,
  PlaneGeometry,
  MeshBasicMaterial,
  InstancedMesh,
  AdditiveBlending,
  DynamicDrawUsage,
  DoubleSide
} from 'three';
import { eventBus } from './core/EventBus.js';
import { graphicsSettingsController } from './core/GraphicsSettingsController.js';

export const cellParticles = {
  group: null,
  instancedMesh: null,
  camera: null,
  count: 120,
  maxActiveParticles: 60,
  particleLifetime: 0.5,
  particles: [],
  tableWidth: 0.514,
  tableHeight: 1.07,
  dummy: new Object3D(),
  _qualityUnsub: null,
  _gfxUnsub: null,

  init(parentGroup, camera = null) {
    if (!parentGroup) {
      console.error('cellParticles.init: parentGroup is required.');
      return;
    }

    this.group = new Group();
    this.particles = [];
    if (camera) {
      this.camera = camera;
    }

    // 2-triangle quad geometry (replaces 12-triangle cubes for 83% vertex reduction)
    const geometry = new PlaneGeometry(0.008, 0.008);

    const material = new MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 1,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
      depthTest: true
    });

    this.instancedMesh = new InstancedMesh(
      geometry,
      material,
      this.count
    );

    this.instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.instancedMesh.frustumCulled = false;

    for (let i = 0; i < this.count; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5
      });

      this.dummy.position.set(0, -10, 0);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();

      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;

    this.group.add(this.instancedMesh);
    parentGroup.add(this.group);

    this._qualityUnsub = eventBus.on('quality:changed', ({ config }) => {
      if (config) {
        this.setQuality(config);
      }
    });

    this._gfxUnsub = eventBus.on('graphics:settingsChanged', ({ settings }) => {
      if (settings && !settings.otherEffects) {
        this.clearAll();
      }
    });
  },

  clearAll() {
    if (!this.instancedMesh) return;
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].active = false;
      this.particles[i].life = 0;
      this.dummy.position.set(0, -10, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  },

  setQuality(qualityConfig) {
    if (!qualityConfig) return;
    if (qualityConfig.particlesMax !== undefined) {
      this.maxActiveParticles = Math.min(this.count, qualityConfig.particlesMax);
    }
    if (qualityConfig.particleLifetime !== undefined) {
      this.particleLifetime = qualityConfig.particleLifetime;
    }
  },

  trigger(x, z, isPhysics = false) {
    if (!this.instancedMesh) {
      return;
    }

    // Suppress particles when OTHER EFFECTS is OFF
    if (graphicsSettingsController && !graphicsSettingsController.isOtherEffectsActive()) {
      return;
    }

    let posX = x;
    let posZ = z;
    if (isPhysics) {
      posX = x - this.tableWidth / 2;
      posZ = z - this.tableHeight / 2;
    }

    let spawned = 0;
    const spawnLimit = Math.min(8, Math.floor(this.maxActiveParticles / 8));

    for (let i = 0; i < this.maxActiveParticles && spawned < spawnLimit; i++) {
      const particle = this.particles[i];

      if (!particle.active) {
        particle.active = true;
        particle.life = this.particleLifetime;
        particle.maxLife = this.particleLifetime;

        particle.x = posX;
        particle.y = 0.02;
        particle.z = posZ;

        particle.vx = (Math.random() - 0.5) * 0.4;
        particle.vy = Math.random() * 0.3 + 0.15;
        particle.vz = (Math.random() - 0.5) * 0.4;

        this.dummy.position.set(
          particle.x,
          particle.y,
          particle.z
        );

        if (this.camera) {
          this.dummy.quaternion.copy(this.camera.quaternion);
        } else {
          this.dummy.rotation.set(0, 0, 0);
        }

        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();

        this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

        spawned++;
      }
    }

    if (spawned > 0) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
  },

  shatter(x, y = 0.015, z, count = 28) {
    if (!this.instancedMesh) return;

    // Suppress particles when OTHER EFFECTS is OFF
    if (graphicsSettingsController && !graphicsSettingsController.isOtherEffectsActive()) {
      return;
    }

    let spawned = 0;
    const spawnLimit = Math.min(count, this.maxActiveParticles);

    for (let i = 0; i < this.maxActiveParticles && spawned < spawnLimit; i++) {
      const particle = this.particles[i];
      if (!particle.active) {
        particle.active = true;
        particle.life = this.particleLifetime * (0.8 + Math.random() * 0.4);
        particle.maxLife = particle.life;

        // Position slightly jittered around hit point
        particle.x = x + (Math.random() - 0.5) * 0.008;
        particle.y = y + (Math.random() - 0.5) * 0.008;
        particle.z = z + (Math.random() - 0.5) * 0.008;

        // High-velocity 3D explosive burst with radial distribution
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.5) * Math.PI * 0.7;
        const speed = 0.35 + Math.random() * 0.55;

        particle.vx = Math.sin(phi) * Math.cos(theta) * speed;
        particle.vy = Math.abs(Math.cos(phi)) * speed * 0.8 + 0.2; // Erupt upward
        particle.vz = Math.sin(phi) * Math.sin(theta) * speed;

        this.dummy.position.set(particle.x, particle.y, particle.z);
        if (this.camera) {
          this.dummy.quaternion.copy(this.camera.quaternion);
        } else {
          this.dummy.rotation.set(0, 0, 0);
        }

        const initialScale = 1.2 + Math.random() * 0.6;
        this.dummy.scale.set(initialScale, initialScale, initialScale);
        this.dummy.updateMatrix();

        this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        spawned++;
      }
    }

    if (spawned > 0) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
  },

  update(deltaTime) {
    if (!this.instancedMesh) {
      return;
    }

    let needsUpdate = false;

    for (let i = 0; i < this.maxActiveParticles; i++) {
      const particle = this.particles[i];

      if (!particle.active) {
        continue;
      }

      particle.life -= deltaTime;

      if (particle.life <= 0) {
        particle.active = false;
        particle.life = 0;

        this.dummy.position.set(0, -10, 0);
        this.dummy.scale.set(0, 0, 0);
      } else {
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;
        particle.z += particle.vz * deltaTime;

        particle.vy -= 1.2 * deltaTime;

        this.dummy.position.set(
          particle.x,
          particle.y,
          particle.z
        );

        if (this.camera) {
          this.dummy.quaternion.copy(this.camera.quaternion);
        }

        const scale = (particle.life / particle.maxLife);
        this.dummy.scale.set(scale, scale, scale);
      }

      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

      needsUpdate = true;
    }

    if (needsUpdate) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
  },

  dispose() {
    if (this._qualityUnsub) {
      this._qualityUnsub();
      this._qualityUnsub = null;
    }
    if (this._gfxUnsub) {
      this._gfxUnsub();
      this._gfxUnsub = null;
    }

    if (!this.instancedMesh) {
      return;
    }

    this.instancedMesh.geometry.dispose();
    this.instancedMesh.material.dispose();

    if (this.group && this.group.parent) {
      this.group.parent.remove(this.group);
    }

    this.particles = [];
    this.instancedMesh = null;
    this.group = null;
  }
};
