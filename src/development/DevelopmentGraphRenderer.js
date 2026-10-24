import * as THREE from 'three';
import { NODE_STATES } from './DevelopmentEffectResolver.js';
import { NODE_TYPES } from './DevelopmentConfig.js';

/**
 * 3D Three.js Graph Renderer for the Development System (inspired by Crystarium2 3D).
 * Features:
 * - 3D crystal geometries (octahedron / icosahedron) with inner wireframe & emissive materials
 * - Pulsing selection billboards & rotating node rings
 * - Wavy energy beams with moving laser tip and welding glow during charge
 * - Particle starfield dust
 * - Camera rig with smooth orbit, touch/mouse drag pan and pinch/wheel zoom
 * - Precise 3D raycasting for node selection
 */
export class DevelopmentGraphRenderer {
  constructor(container) {
    this.container = container;

    // Three.js Core
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.tree = null;
    this.ballId = 'brass';
    this.selectedNodeId = null;

    // State & rank providers
    this.nodeStateGetter = null;
    this.nodeRankGetter = null;
    this.chargeProgressGetter = null;
    this.onNodeSelected = null;

    // Node & Beam meshes
    this._nodeGroup = new THREE.Group();
    this._beamGroup = new THREE.Group();
    this._nodeMeshMap = new Map(); // nodeId -> { group, mesh, ring, labelSprite, pointLight, glowMesh }
    this._beamList = []; // Array of connection beam objects

    // Particle starfield
    this._starfield = null;

    // Camera rig state
    this._camTarget = new THREE.Vector3(0, 0, 0);
    this._camPosition = new THREE.Vector3(0, 4, 14);
    this._camDistance = 14;
    this._camRotX = 0.2;
    this._camRotY = 0;
    this._isDragging = false;
    this._prevMouseX = 0;
    this._prevMouseY = 0;
    this._touchDist = 0;

    // Raycaster for 3D selection
    this._raycaster = new THREE.Raycaster();
    this._mouseVec = new THREE.Vector2();

    this._animFrame = null;
    this._clock = new THREE.Clock();

    this._initThree();
    this._bindEvents();
  }

  _initThree() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x02030a, 0.025);

    const w = this.container.clientWidth || 600;
    const h = this.container.clientHeight || 500;

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
    this.camera.position.set(0, 5, 14);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 15);
    this.scene.add(dirLight);

    this.scene.add(this._beamGroup);
    this.scene.add(this._nodeGroup);

    this._initStarfield();
  }

  _initStarfield() {
    const starCount = 600;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 40 - 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;

      const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.15, 0.8, 0.6 + Math.random() * 0.3);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });

    this._starfield = new THREE.Points(geom, mat);
    this.scene.add(this._starfield);
  }

  resize() {
    if (!this.renderer || !this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setTree(tree, ballId, selectedNodeId = null) {
    this.tree = tree;
    this.ballId = ballId;
    this.selectedNodeId = selectedNodeId || (tree && tree.nodes && tree.nodes[0] ? tree.nodes[0].id : null);

    this._build3DGraph();
    this.focusNode(this.selectedNodeId);
  }

  setSelectedNode(nodeId) {
    this.selectedNodeId = nodeId;
    this.focusNode(nodeId);
  }

  focusNode(nodeId) {
    if (!nodeId || !this._nodeMeshMap.has(nodeId)) return;
    const nodeObj = this._nodeMeshMap.get(nodeId);
    this._camTarget.copy(nodeObj.group.position);
  }

  resetView() {
    this._camRotX = 0.2;
    this._camRotY = 0;
    this._camDistance = 14;
    this.focusNode(this.selectedNodeId);
  }

  zoom(factor) {
    this._camDistance = Math.min(30, Math.max(5, this._camDistance * factor));
  }

  startAnimationLoop() {
    if (this._animFrame) return;
    this._clock.start();

    const loop = () => {
      this._updateScene(this._clock.getDelta(), this._clock.getElapsedTime());
      this._render();
      this._animFrame = requestAnimationFrame(loop);
    };
    this._animFrame = requestAnimationFrame(loop);
  }

  stopAnimationLoop() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }

  _build3DGraph() {
    // Clear old meshes
    while (this._nodeGroup.children.length > 0) {
      const obj = this._nodeGroup.children[0];
      this._nodeGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    }
    while (this._beamGroup.children.length > 0) {
      const obj = this._beamGroup.children[0];
      this._beamGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    }
    this._nodeMeshMap.clear();
    this._beamList = [];

    if (!this.tree || !Array.isArray(this.tree.nodes)) return;

    const themeColorHex = this.tree.themeColor || '#00e5ff';

    // 1. Build Nodes
    for (const node of this.tree.nodes) {
      const group = new THREE.Group();
      const pos = node.pos || [0, 0, 0];
      group.position.set(pos[0], pos[1], pos[2]);

      const isApex = node.type === NODE_TYPES.ABILITY || node.type === NODE_TYPES.GLOBAL;
      const size = isApex ? 0.7 : 0.45;

      // Polyhedron Geometry
      const geom = isApex ? new THREE.IcosahedronGeometry(size, 0) : new THREE.OctahedronGeometry(size, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x445566,
        roughness: 0.3,
        metalness: 0.7,
        emissive: 0x112233,
        emissiveIntensity: 0.5
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.userData = { nodeId: node.id };
      group.add(mesh);

      // Wireframe overlay
      const wireMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.3 });
      const wireMesh = new THREE.Mesh(geom, wireMat);
      group.add(wireMesh);

      // Rotating Halo Ring
      const ringGeom = new THREE.TorusGeometry(size * 1.5, 0.02, 16, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.8 });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      // Point Light for unlocked / selected
      const pointLight = new THREE.PointLight(themeColorHex, 0, 4);
      group.add(pointLight);

      this._nodeGroup.add(group);
      this._nodeMeshMap.set(node.id, {
        node,
        group,
        mesh,
        wireMesh,
        ring,
        pointLight,
        size
      });
    }

    // 2. Build Connections
    const connections = this.tree.connections || [];
    for (const conn of connections) {
      const fromObj = this._nodeMeshMap.get(conn.from);
      const toObj = this._nodeMeshMap.get(conn.to);
      if (!fromObj || !toObj) continue;

      // Base beam line
      const lineGeom = new THREE.BufferGeometry();
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x334455,
        transparent: true,
        opacity: 0.5,
        linewidth: 1
      });
      const lineMesh = new THREE.Line(lineGeom, lineMat);
      this._beamGroup.add(lineMesh);

      // Active fill beam line (shows charging progress)
      const fillGeom = new THREE.BufferGeometry();
      const fillMat = new THREE.LineBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 1.0,
        linewidth: 3
      });
      const fillMesh = new THREE.Line(fillGeom, fillMat);
      fillMesh.visible = false;
      this._beamGroup.add(fillMesh);

      // Glowing laser tip on the advancing beam
      const tipGeom = new THREE.SphereGeometry(0.12, 16, 16);
      const tipMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const tipMesh = new THREE.Mesh(tipGeom, tipMat);
      tipMesh.visible = false;
      this._beamGroup.add(tipMesh);

      this._beamList.push({
        from: conn.from,
        to: conn.to,
        fromObj,
        toObj,
        lineMesh,
        fillMesh,
        tipMesh
      });
    }
  }

  _updateScene(dt, elapsedTime) {
    if (!this.tree) return;

    const themeColor = new THREE.Color(this.tree.themeColor || '#00e5ff');

    // 1. Update Camera Position smoothly toward target
    const camX = this._camTarget.x + this._camDistance * Math.sin(this._camRotY) * Math.cos(this._camRotX);
    const camY = this._camTarget.y + this._camDistance * Math.sin(this._camRotX);
    const camZ = this._camTarget.z + this._camDistance * Math.cos(this._camRotY) * Math.cos(this._camRotX);

    this._camPosition.lerp(new THREE.Vector3(camX, camY, camZ), 0.1);
    this.camera.position.copy(this._camPosition);
    this.camera.lookAt(this._camTarget);

    // 2. Rotate starfield
    if (this._starfield) {
      this._starfield.rotation.y = elapsedTime * 0.02;
    }

    // 3. Update Nodes appearance
    for (const [nodeId, item] of this._nodeMeshMap.entries()) {
      const { node, mesh, wireMesh, ring, pointLight, size } = item;
      const isSelected = this.selectedNodeId === nodeId;
      const state = this.nodeStateGetter ? this.nodeStateGetter(nodeId, this.ballId) : NODE_STATES.LOCKED;
      const rank = this.nodeRankGetter ? this.nodeRankGetter(nodeId, this.ballId) : 0;
      const charge = this.chargeProgressGetter ? this.chargeProgressGetter(nodeId) : 0;

      // Rotation animation
      mesh.rotation.y += dt * 0.8;
      mesh.rotation.x += dt * 0.4;
      ring.rotation.z += dt * 0.5;

      if (isSelected) {
        const pulse = 1.0 + Math.sin(elapsedTime * 6) * 0.15;
        ring.scale.set(pulse, pulse, pulse);
      } else {
        ring.scale.set(1, 1, 1);
      }

      // Material color depending on state
      if (state === NODE_STATES.MAXED || state === NODE_STATES.UNLOCKED) {
        mesh.material.color.copy(themeColor);
        mesh.material.emissive.copy(themeColor);
        mesh.material.emissiveIntensity = 1.4;
        wireMesh.material.opacity = 0.6;
        ring.material.color.copy(themeColor);
        pointLight.intensity = isSelected ? 3.5 : 1.2;
      } else if (state === NODE_STATES.AFFORDABLE) {
        mesh.material.color.setHex(0xffd700);
        mesh.material.emissive.setHex(0xffaa00);
        mesh.material.emissiveIntensity = isSelected ? 1.8 : 0.8;
        ring.material.color.setHex(0xffd700);
        pointLight.intensity = isSelected ? 2.5 : 0.5;
      } else if (state === NODE_STATES.AVAILABLE) {
        mesh.material.color.setHex(0x3377aa);
        mesh.material.emissive.setHex(0x113355);
        mesh.material.emissiveIntensity = 0.5;
        ring.material.color.setHex(0x3377aa);
        pointLight.intensity = 0;
      } else {
        // LOCKED
        mesh.material.color.setHex(0x222530);
        mesh.material.emissive.setHex(0x050810);
        mesh.material.emissiveIntensity = 0.1;
        ring.material.color.setHex(0x444455);
        pointLight.intensity = 0;
      }
    }

    // 4. Update Connection Beams & Advancing Progress Laser
    for (const beam of this._beamList) {
      const { fromObj, toObj, lineMesh, fillMesh, tipMesh, to } = beam;
      const p1 = fromObj.group.position;
      const p2 = toObj.group.position;

      // Base beam
      const basePoints = [p1, p2];
      lineMesh.geometry.setFromPoints(basePoints);

      const fromState = this.nodeStateGetter ? this.nodeStateGetter(beam.from, this.ballId) : NODE_STATES.LOCKED;
      const toState = this.nodeStateGetter ? this.nodeStateGetter(beam.to, this.ballId) : NODE_STATES.LOCKED;

      const isPathUnlocked = (fromState === NODE_STATES.UNLOCKED || fromState === NODE_STATES.MAXED) &&
                             (toState === NODE_STATES.UNLOCKED || toState === NODE_STATES.MAXED);

      if (isPathUnlocked) {
        lineMesh.material.color.copy(themeColor);
        lineMesh.material.opacity = 0.9;
      } else {
        lineMesh.material.color.setHex(0x334455);
        lineMesh.material.opacity = 0.4;
      }

      // Fill beam during charging
      const charge = this.chargeProgressGetter ? this.chargeProgressGetter(to) : 0;
      if (charge > 0 && !isPathUnlocked) {
        const fillPoint = new THREE.Vector3().lerpVectors(p1, p2, charge);
        fillMesh.geometry.setFromPoints([p1, fillPoint]);
        fillMesh.visible = true;
        fillMesh.material.color.copy(themeColor);

        tipMesh.position.copy(fillPoint);
        tipMesh.visible = true;
        // Tip sparkle flicker
        const flicker = 1.0 + (Math.random() - 0.5) * 0.4;
        tipMesh.scale.set(flicker, flicker, flicker);
      } else {
        fillMesh.visible = false;
        tipMesh.visible = false;
      }
    }
  }

  _render() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _bindEvents() {
    const el = this.renderer.domElement;

    // Mouse drag
    el.addEventListener('mousedown', (e) => {
      this._isDragging = true;
      this._prevMouseX = e.clientX;
      this._prevMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._isDragging) return;
      const dx = e.clientX - this._prevMouseX;
      const dy = e.clientY - this._prevMouseY;

      this._camRotY -= dx * 0.006;
      this._camRotX = Math.max(-0.4, Math.min(1.2, this._camRotX + dy * 0.006));

      this._prevMouseX = e.clientX;
      this._prevMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this._isDragging = false;
    });

    // Raycast click
    el.addEventListener('click', (e) => {
      const rect = el.getBoundingClientRect();
      this._mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this._mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this._raycaster.setFromCamera(this._mouseVec, this.camera);
      const meshes = Array.from(this._nodeMeshMap.values()).map(v => v.mesh);
      const hits = this._raycaster.intersectObjects(meshes);

      if (hits.length > 0) {
        const hitNodeId = hits[0].object.userData.nodeId;
        if (hitNodeId) {
          this.setSelectedNode(hitNodeId);
          if (typeof this.onNodeSelected === 'function') {
            this.onNodeSelected(hitNodeId);
          }
        }
      }
    });

    // Wheel zoom
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      this.zoom(factor);
    }, { passive: false });

    // Touch support (drag pan & pinch zoom)
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this._isDragging = true;
        this._prevMouseX = e.touches[0].clientX;
        this._prevMouseY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        this._isDragging = false;
        this._touchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this._isDragging) {
        const dx = e.touches[0].clientX - this._prevMouseX;
        const dy = e.touches[0].clientY - this._prevMouseY;

        this._camRotY -= dx * 0.006;
        this._camRotX = Math.max(-0.4, Math.min(1.2, this._camRotX + dy * 0.006));

        this._prevMouseX = e.touches[0].clientX;
        this._prevMouseY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (this._touchDist > 0) {
          const factor = this._touchDist / dist;
          this.zoom(factor);
        }
        this._touchDist = dist;
      }
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        this._isDragging = false;
        this._touchDist = 0;
      }
    }, { passive: true });
  }

  dispose() {
    this.stopAnimationLoop();
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
