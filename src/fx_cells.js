import {
  Group,
  Object3D,
  BoxGeometry,
  MeshBasicMaterial,
  InstancedMesh,
  AdditiveBlending,
  DynamicDrawUsage
} from 'three';

export const cellParticles = {
  group: null,
  instancedMesh: null,
  count: 60,
  particles: [],
  tableWidth: 0.514,
  tableHeight: 1.07,
  dummy: new Object3D(),

  init(parentGroup) {
    if (!parentGroup) {
      console.error('cellParticles.init: parentGroup is required.');
      return;
    }

    this.group = new Group();
    this.particles = [];

    const geometry = new BoxGeometry(0.008, 0.008, 0.008);

    const material = new MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 1,
      blending: AdditiveBlending,
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
  },

  trigger(x, z, isPhysics = false) {
    if (!this.instancedMesh) {
      return;
    }

    let posX = x;
    let posZ = z;
    if (isPhysics) {
      posX = x - this.tableWidth / 2;
      posZ = z - this.tableHeight / 2;
    }

    let spawned = 0;

    for (let i = 0; i < this.count && spawned < 8; i++) {
      const particle = this.particles[i];

      if (!particle.active) {
        particle.active = true;
        particle.life = 0.5;
        particle.maxLife = 0.5;

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

        this.dummy.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );

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

    let spawned = 0;
    for (let i = 0; i < this.count && spawned < count; i++) {
      const particle = this.particles[i];
      if (!particle.active) {
        particle.active = true;
        particle.life = 0.7 + Math.random() * 0.3;
        particle.maxLife = particle.life;

        // Origin at exact ball coordinates
        particle.x = x + (Math.random() - 0.5) * 0.008;
        particle.y = y + (Math.random() - 0.5) * 0.008;
        particle.z = z + (Math.random() - 0.5) * 0.008;

        // High-velocity 3D explosive radial burst
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const speed = 0.4 + Math.random() * 0.6;

        particle.vx = Math.sin(phi) * Math.cos(theta) * speed;
        particle.vy = Math.abs(Math.cos(phi)) * speed * 0.8 + 0.2; // Erupt upward
        particle.vz = Math.sin(phi) * Math.sin(theta) * speed;

        this.dummy.position.set(particle.x, particle.y, particle.z);
        this.dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        this.dummy.scale.set(1.4, 1.4, 1.4);
        this.dummy.updateMatrix();

        this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        spawned++;
      }
    }

    if (spawned > 0) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
  },

  update(dt) {
    if (!this.instancedMesh || !Number.isFinite(dt) || dt <= 0) {
      return;
    }

    const deltaTime = Math.min(dt, 0.05);
    let needsUpdate = false;

    for (let i = 0; i < this.count; i++) {
      const particle = this.particles[i];

      if (!particle.active) {
        continue;
      }

      particle.life -= deltaTime;

      if (particle.life <= 0) {
        particle.active = false;
        particle.life = 0;

        this.dummy.position.set(0, -10, 0);
        this.dummy.rotation.set(0, 0, 0);
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

        const lifeProgress = Math.max(
          0,
          particle.life / particle.maxLife
        );

        const scale = 0.25 + lifeProgress * 0.75;

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