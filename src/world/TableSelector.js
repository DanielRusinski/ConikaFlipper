import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { inputManager } from '../core/InputManager.js';
import { playSound } from '../soundfx.js';

export class TableSelector {
  constructor() {
    this.mesh = null;
    this.gridX = GAME_CONFIG.spawn?.defaultGridX || 9;
    this.gridY = GAME_CONFIG.spawn?.defaultGridY || 18;
    this.tilesX = GAME_CONFIG.grid.tilesX;
    this.tilesY = GAME_CONFIG.grid.tilesY;
    this.tableWidth = GAME_CONFIG.table.width;
    this.tableHeight = GAME_CONFIG.table.height;
    this.tileWidth = this.tableWidth / this.tilesX;
    this.tileHeight = this.tableHeight / this.tilesY;
    this.baseY = 0.045;
    this.active = false;
    
    this._tileManager = null;
    this._camera = null;
    this._domElement = null;
    this._lastHighlighted = null;
    
    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._mouse = new THREE.Vector2();
    this._planeIntersect = new THREE.Vector3();
    
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  init(parentGroup, tileManager, camera, domElement) {
    this._tileManager = tileManager;
    this._camera = camera;
    this._domElement = domElement;

    const radius = Math.min(this.tileWidth, this.tileHeight) * 0.42;
    const height = 0.038;
    const geometry = new THREE.ConeGeometry(radius, height, 4);
    geometry.rotateX(Math.PI); // Inverted pyramid pointing down
    geometry.rotateY(Math.PI / 4);

    const material = new THREE.MeshStandardMaterial({
      color: 0x00ffcc,
      emissive: new THREE.Color(0x00ffcc),
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.1
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = false;
    this.mesh.position.set(0, -999, 0);
    parentGroup.add(this.mesh);
  }

  activate() {
    this.active = true;
    this.mesh.visible = true;
    
    // Default to safe spawn point if current is obstacle
    if (this._tileManager && this._tileManager.isObstacle(this.gridX, this.gridY)) {
      this.gridX = GAME_CONFIG.spawn?.defaultGridX || 9;
      this.gridY = GAME_CONFIG.spawn?.defaultGridY || 18;
    }

    this._updatePosition(0);
    this._highlightCurrent();

    if (this._domElement) {
      this._domElement.addEventListener('pointermove', this._onPointerMove, { passive: true });
      this._domElement.addEventListener('pointerdown', this._onPointerDown);
    }
    window.addEventListener('keydown', this._onKeyDown);
  }

  deactivate() {
    this.active = false;
    if (this.mesh) {
      this.mesh.visible = false;
    }
    this._unhighlightCurrent();

    if (this._domElement) {
      this._domElement.removeEventListener('pointermove', this._onPointerMove);
      this._domElement.removeEventListener('pointerdown', this._onPointerDown);
    }
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _updatePosition(time) {
    if (!this.mesh) return;
    const posX = (this.gridX + 0.5) * this.tileWidth - this.tableWidth / 2;
    const posZ = (this.gridY + 0.5) * this.tileHeight - this.tableHeight / 2;
    const hoverOffset = Math.sin(time * 0.005) * 0.008;

    this.mesh.position.set(posX, this.baseY + hoverOffset, posZ);
    this.mesh.rotation.y = time * 0.0015;
  }

  _highlightCurrent() {
    if (!this._tileManager) return;
    
    if (this._lastHighlighted && 
       (this._lastHighlighted.x !== this.gridX || this._lastHighlighted.y !== this.gridY)) {
      this._tileManager.unhighlightTile(this._lastHighlighted.x, this._lastHighlighted.y);
    }

    const isObs = this._tileManager.isObstacle(this.gridX, this.gridY);
    if (isObs) {
      this.mesh.material.color.setHex(0xff3333);
      this.mesh.material.emissive.setHex(0xff3333);
    } else {
      this.mesh.material.color.setHex(0x00ffcc);
      this.mesh.material.emissive.setHex(0x00ffcc);
      this._tileManager.highlightTile(this.gridX, this.gridY, 0x00ffcc);
    }

    this._lastHighlighted = { x: this.gridX, y: this.gridY };
  }

  _unhighlightCurrent() {
    if (this._tileManager && this._lastHighlighted) {
      this._tileManager.unhighlightTile(this._lastHighlighted.x, this._lastHighlighted.y);
      this._lastHighlighted = null;
    }
  }

  _getTileFromPointer(e) {
    if (!this.active || !this._camera || !this._domElement) return null;

    const rect = this._domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this._camera);
    if (this._raycaster.ray.intersectPlane(this._plane, this._planeIntersect)) {
      const gx = Math.floor((this._planeIntersect.x + this.tableWidth / 2) / this.tileWidth);
      const gy = Math.floor((this._planeIntersect.z + this.tableHeight / 2) / this.tileHeight);

      if (gx >= 0 && gx < this.tilesX && gy >= 0 && gy < this.tilesY) {
        return { gx, gy };
      }
    }
    return null;
  }

  _onPointerMove(e) {
    this.pointerType = e.pointerType; // 'mouse' | 'touch' | 'pen'
    const tile = this._getTileFromPointer(e);
    if (tile && (tile.gx !== this.gridX || tile.gy !== this.gridY)) {
      this.gridX = tile.gx;
      this.gridY = tile.gy;
      this._updatePosition(performance.now());
      this._highlightCurrent();
      playSound(550, 0.05);
    }
  }

  _onPointerDown(e) {
    if (!this.active) return;
    if (e.target && e.target.closest && (e.target.closest('#hud') || e.target.closest('#screens'))) return;

    this.pointerType = e.pointerType; // 'mouse' | 'touch' | 'pen'
    const tile = this._getTileFromPointer(e);
    if (tile) {
      const isSameTile = (tile.gx === this.gridX && tile.gy === this.gridY);
      this.gridX = tile.gx;
      this.gridY = tile.gy;
      this._updatePosition(performance.now());
      this._highlightCurrent();

      if (isSameTile) {
        // Tapping/clicking with mouse, touch, or pen on the selected tile confirms/launches
        this.confirm();
      } else {
        // Tapping/clicking a new tile selects and highlights it
        playSound(600, 0.06);
      }
    }
  }

  _onKeyDown(e) {
    if (!this.active) return;

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
      this._updatePosition(performance.now());
      this._highlightCurrent();
      playSound(600, 0.06);
    }

    if (e.key === 'Enter' || e.key === ' ') {
      this.confirm();
    }
  }

  confirm() {
    if (!this.active) return false;
    if (this._tileManager && this._tileManager.isObstacle(this.gridX, this.gridY)) {
      playSound(250, 0.15); // Buzzer on obstacle
      return false;
    }

    // Calibrate gyro resting posture at launch moment
    inputManager.calibrate();
    inputManager.requestFullscreenAndLock();

    const worldPos = this._tileManager.getTileWorldPos(this.gridX, this.gridY);
    const spawnData = {
      gridX: this.gridX,
      gridY: this.gridY,
      worldX: worldPos.x,
      worldZ: worldPos.z
    };

    playSound(1100, 0.2);
    this.deactivate();

    eventBus.emit('selector:confirmed', spawnData);
    return true;
  }

  update(time) {
    if (this.active) {
      this._updatePosition(time);
    }
  }

  dispose() {
    this.deactivate();
    if (this.mesh) {
      if (this.mesh.parent) {
        this.mesh.parent.remove(this.mesh);
      }
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
  }
}
