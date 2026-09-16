import * as THREE from 'three';
import { playSound } from './soundfx.js';
import { cellParticles } from './fx_cells.js';

export const gameField = {
  group: null,
  instancedMesh: null,
  tileMat: null,
  tilesX: 18,
  tilesY: 36,
  tableWidth: 0.514,
  tableHeight: 1.07,
  tileWidth: 0,
  tileHeight: 0,
  
  visitedTiles: new Set(),
  activeFlashes: new Map(),

  createFieldMesh() {
    this.group = new THREE.Group();
    this.visitedTiles.clear();
    this.activeFlashes.clear();

    this.tileWidth = this.tableWidth / this.tilesX;
    this.tileHeight = this.tableHeight / this.tilesY;
    const totalTiles = this.tilesX * this.tilesY;

    const tileGeo = new THREE.PlaneGeometry(this.tileWidth * 0.94, this.tileHeight * 0.94);
    tileGeo.rotateX(-Math.PI / 2);

    const textureLoader = new THREE.TextureLoader();
    const imperfectionTexture = textureLoader.load('./512white_mperfections02.png', (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2.0, 2.0); // Skala tekstury ustawiona na 2.0, 2.0
    });

    // Ustawienia początkowe dla srebra (zgodnie z wymaganiem: szorstkość 0.40, głębokość 0.060)
    this.tileMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,          // Odcień srebra
      metalness: 0.98,
      roughness: 0.40,          // Szorstkość 0.40
      roughnessMap: imperfectionTexture,
      bumpMap: imperfectionTexture,
      bumpScale: 0.060          // Głębokość rys 0.060
    });

    this.tileMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `
        #include <project_vertex>
        
        vec4 globalPosition;
        #ifdef USE_INSTANCING
            globalPosition = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
            globalPosition = modelMatrix * vec4(transformed, 1.0);
        #endif

        vec2 globalUv = globalPosition.xz;

        #ifdef USE_UV
            vUv = globalUv;
        #endif
        #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = ( roughnessMapTransform * vec3( globalUv, 1 ) ).xy;
        #endif
        #ifdef USE_BUMPMAP
            vBumpMapUv = ( bumpMapTransform * vec3( globalUv, 1 ) ).xy;
        #endif
        `
      );
    };

    this.instancedMesh = new THREE.InstancedMesh(tileGeo, this.tileMat, totalTiles);
    
    const dummy = new THREE.Object3D();
    const defaultColor = new THREE.Color(0xdddddd); // Srebrny kolor bazowy

    let index = 0;
    for (let x = 0; x < this.tilesX; x++) {
      for (let y = 0; y < this.tilesY; y++) {
        const posX = (x * this.tileWidth) + (this.tileWidth / 2) - (this.tableWidth / 2);
        const posZ = (y * this.tileHeight) + (this.tileHeight / 2) - (this.tableHeight / 2);

        dummy.position.set(posX, -0.001, posZ);
        dummy.updateMatrix();

        this.instancedMesh.setMatrixAt(index, dummy.matrix);
        this.instancedMesh.setColorAt(index, defaultColor);
        index++;
      }
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
    
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = true;

    this.group.add(this.instancedMesh);

    cellParticles.init(this.group);

    return this.group;
  },

  checkAndUpdate(ballX, ballZ, dt) {
    if (!this.instancedMesh) return;

    // Zajęty kafelek ma odcień miedzi (0xb87333) zamiast czerni
    const conqueredColor = new THREE.Color(0xb87333);  
    const flashColor = new THREE.Color(1.5, 1.2, 1.5); 
    
    let colorUpdated = false;

    for (let [index, intensity] of this.activeFlashes.entries()) {
      intensity -= dt * 0.67; 
      
      let targetColor;
      if (intensity <= 0) {
        intensity = 0;
        this.activeFlashes.delete(index);
        targetColor = conqueredColor; 
      } else {
        this.activeFlashes.set(index, intensity);
        targetColor = conqueredColor.clone().lerp(flashColor, intensity);
      }

      this.instancedMesh.setColorAt(index, targetColor);
      colorUpdated = true;
    }

    if (colorUpdated && this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    const x = Math.floor(ballX / this.tileWidth);
    const y = Math.floor(ballZ / this.tileHeight);

    if (x >= 0 && x < this.tilesX && y >= 0 && y < this.tilesY) {
      const index = x * this.tilesY + y;

      if (!this.visitedTiles.has(index) && !this.activeFlashes.has(index)) {
        this.visitedTiles.add(index);               
        this.activeFlashes.set(index, 1.0);        

        this.instancedMesh.setColorAt(index, flashColor);
        if (this.instancedMesh.instanceColor) {
          this.instancedMesh.instanceColor.needsUpdate = true;
        }

        playSound(900, 0.2);
        cellParticles.trigger(ballX, ballZ);
      }
    }

    cellParticles.update(dt);
  }
};