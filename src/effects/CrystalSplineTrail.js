import * as THREE from 'three';

export class CrystalSplineTrail {
  constructor(maxCrystals = 16, nodesPerTrail = 10) {
    this.maxCrystals = maxCrystals;
    this.nodesPerTrail = nodesPerTrail;
    this.totalInstances = maxCrystals * nodesPerTrail;
    
    this.group = new THREE.Group();
    this.group.name = 'CrystalSplineTrailGroup';
    this.instancedMesh = null;
    this._dummy = new THREE.Object3D();
    this._colorCard = new THREE.Color(0x00ffff);
    this._colorPoints = new THREE.Color(0xffd700);
    this._colorEmerald = new THREE.Color(0x00ff66);
    this._colorReady = new THREE.Color(0xff00cc);
    this._tempColor = new THREE.Color();
  }

  init(parentGroup) {
    const geometry = new THREE.TetrahedronGeometry(0.0035, 0);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });

    this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.totalInstances);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.frustumCulled = false;

    // Initialize all offscreen
    for (let i = 0; i < this.totalInstances; i++) {
      this._dummy.position.set(0, -50, 0);
      this._dummy.scale.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this._dummy.matrix);
      this.instancedMesh.setColorAt(i, this._colorCard);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    this.group.add(this.instancedMesh);
    if (parentGroup) {
      parentGroup.add(this.group);
    }
  }

  update(activeCrystals, elapsed) {
    if (!this.instancedMesh) return;

    let instanceIdx = 0;
    const crystalList = Array.from(activeCrystals.values()).filter(c => c.active && c.mesh && c.mesh.visible);

    for (let c = 0; c < crystalList.length && c < this.maxCrystals; c++) {
      const crystal = crystalList[c];
      const mesh = crystal.mesh;
      const basePos = mesh.position;
      const timeOffset = mesh.userData.timeOffset || 0;
      const speed = 2.8;
      const radius = (crystal.type === 'points_crystal' || crystal.type === 'emerald_crystal') ? 0.024 : 0.022;
      
      // Determine trail base color
      let baseColor = this._colorCard;
      if (crystal.type === 'points_crystal') {
        baseColor = this._colorPoints;
      } else if (crystal.type === 'emerald_crystal') {
        baseColor = this._colorEmerald;
      } else if (mesh.userData.bloomReady) {
        baseColor = this._colorReady;
      }

      for (let i = 0; i < this.nodesPerTrail; i++) {
        const t = (elapsed * speed + timeOffset) - (i * 0.11);
        
        // 3D Spline loop coordinates around the crystal
        const x = basePos.x + Math.cos(t) * radius;
        const y = basePos.y + Math.sin(t * 2.0) * 0.010;
        const z = basePos.z + Math.sin(t) * radius;

        const taper = Math.max(0.1, 1.0 - (i / this.nodesPerTrail));
        const scale = taper * 1.1;

        this._dummy.position.set(x, y, z);
        this._dummy.scale.set(scale, scale, scale);
        this._dummy.rotation.set(t, t * 1.5, 0);
        this._dummy.updateMatrix();

        this.instancedMesh.setMatrixAt(instanceIdx, this._dummy.matrix);

        // Color intensity fades toward tail
        this._tempColor.copy(baseColor).multiplyScalar(taper);
        this.instancedMesh.setColorAt(instanceIdx, this._tempColor);

        instanceIdx++;
      }
    }

    // Hide remaining unused instances
    while (instanceIdx < this.totalInstances) {
      this._dummy.position.set(0, -50, 0);
      this._dummy.scale.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(instanceIdx, this._dummy.matrix);
      instanceIdx++;
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  clear() {
    if (!this.instancedMesh) return;
    for (let i = 0; i < this.totalInstances; i++) {
      this._dummy.position.set(0, -50, 0);
      this._dummy.scale.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.clear();
    if (this.instancedMesh) {
      this.group.remove(this.instancedMesh);
      this.instancedMesh.geometry.dispose();
      this.instancedMesh.material.dispose();
      this.instancedMesh = null;
    }
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
