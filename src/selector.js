import * as THREE from 'three';
import { gameField } from './field.js';
import { playSound } from './soundfx.js';

export const tableSelector = {
  mesh: null,
  gridX: 9, 
  gridY: 18,
  tilesX: 18,
  tilesY: 36,
  tableWidth: 0.514,
  tableHeight: 1.07,
  active: true,
  baseY: 0.08, 
  lastHighlightedIndex: -1,

  createSelectorMesh() {
    const radius = (this.tableWidth / this.tilesX) * 0.8;
    const height = 0.06;
    const geometry = new THREE.ConeGeometry(radius, height, 4);
    
    geometry.rotateX(Math.PI);
    geometry.rotateY(Math.PI / 4);

    const material = new THREE.MeshStandardMaterial({
      color: 0x00ffcc,
      emissive: new THREE.Color(0x00ffcc),
      emissiveIntensity: 0.6,
      roughness: 0.2,
      wireframe: false
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.updatePosition(0);
    this.highlightCurrentTile();
    
    return this.mesh;
  },

  updatePosition(time = 0) {
    if (!this.mesh) return;
    const tileWidth = this.tableWidth / this.tilesX;
    const tileHeight = this.tableHeight / this.tilesY;

    const posX = (this.gridX * tileWidth) + (tileWidth / 2) - (this.tableWidth / 2);
    const posZ = (this.gridY * tileHeight) + (tileHeight / 2) - (this.tableHeight / 2);

    const hoverOffset = Math.sin(time * 0.006) * 0.012;
    this.mesh.position.set(posX, this.baseY + hoverOffset, posZ);
  },

  highlightCurrentTile() {
    if (!gameField.instancedMesh) return;

    const currentIndex = this.gridX * this.tilesY + this.gridY;

    if (this.lastHighlightedIndex !== currentIndex) {
      const defaultColor = new THREE.Color(0x1e3a5f);
      // Kolor podświetlenia kafelka dopasowany do koloru piramidy (0x00ffcc)
      const highlightColor = new THREE.Color(0x00ffcc);

      if (this.lastHighlightedIndex >= 0 && !gameField.visitedTiles.has(this.lastHighlightedIndex)) {
        gameField.instancedMesh.setColorAt(this.lastHighlightedIndex, defaultColor);
      }

      if (!gameField.visitedTiles.has(currentIndex)) {
        gameField.instancedMesh.setColorAt(currentIndex, highlightColor);
      }

      gameField.instancedMesh.instanceColor.needsUpdate = true;
      this.lastHighlightedIndex = currentIndex;
    }
  },

  handleInput(e) {
    if (!this.active) return false;

    let moved = false;
    if (e.key === 'ArrowLeft' || e.key === 'a') {
      this.gridX = Math.max(0, this.gridX - 1);
      moved = true;
    } else if (e.key === 'ArrowRight' || e.key === 'd') {
      this.gridX = Math.min(this.tilesX - 1, this.gridX + 1);
      moved = true;
    } else if (e.key === 'ArrowUp' || e.key === 'w') {
      this.gridY = Math.max(0, this.gridY - 1);
      moved = true;
    } else if (e.key === 'ArrowDown' || e.key === 's') {
      this.gridY = Math.min(this.tilesY - 1, this.gridY + 1);
      moved = true;
    }

    if (moved) {
      this.updatePosition(performance.now());
      this.highlightCurrentTile();
      // Odtworzenie dźwięku ruchu piramidy
      playSound(600, 0.08);
    }

    if (e.key === 'Enter' || e.key === ' ') {
      this.active = false;
      if (this.mesh) this.mesh.visible = false;
      
      if (this.lastHighlightedIndex >= 0 && !gameField.visitedTiles.has(this.lastHighlightedIndex)) {
        gameField.instancedMesh.setColorAt(this.lastHighlightedIndex, new THREE.Color(0x1e3a5f));
        gameField.instancedMesh.instanceColor.needsUpdate = true;
      }

      return true;
    }

    return false;
  },

  animate(time) {
    if (this.active) {
      this.updatePosition(time);
    }
  },

  getSpawnCoordinates() {
    const tileWidth = this.tableWidth / this.tilesX;
    const tileHeight = this.tableHeight / this.tilesY;

    return {
      x: (this.gridX * tileWidth) + (tileWidth / 2),
      y: (this.gridY * tileHeight) + (tileHeight / 2)
    };
  }
};