import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class LabelSystem {
  constructor() {
    this._renderer = null;
    this._labels = new Map();
    this._nextId = 0;
    this._pool = [];
    this._categoryVisibility = new Map();
    this._labelGroup = new THREE.Group();
    this._labelGroup.name = 'LabelSystemGroup';
    this._scene = null;
    this._tempPos = new THREE.Vector3();
  }

  init(container, scene = null) {
    this._scene = scene;
    if (this._scene) {
      this._scene.add(this._labelGroup);
    }

    this._renderer = new CSS2DRenderer();
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.domElement.style.position = 'absolute';
    this._renderer.domElement.style.top = '0px';
    this._renderer.domElement.style.left = '0px';
    this._renderer.domElement.style.pointerEvents = 'none';
    this._renderer.domElement.style.zIndex = '5';
    container.appendChild(this._renderer.domElement);
  }

  setVisible(visible) {
    if (this._renderer && this._renderer.domElement) {
      this._renderer.domElement.style.display = visible ? 'block' : 'none';
    }
  }

  createLabel(object3D, options = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'label-wrapper';
    wrapper.style.position = 'absolute';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.userSelect = 'none';
    wrapper.style.willChange = 'transform';

    const inner = document.createElement('div');
    inner.className = options.className || 'label-default';
    inner.textContent = options.text || '';
    wrapper.appendChild(inner);

    const cssObject = new CSS2DObject(wrapper);
    const offset = options.worldOffset || { x: 0, y: 0.045, z: 0 };

    // Position initially at target position
    if (object3D) {
      object3D.getWorldPosition(this._tempPos);
      cssObject.position.set(
        this._tempPos.x + offset.x,
        this._tempPos.y + offset.y,
        this._tempPos.z + offset.z
      );
    }

    // Add to label group, NOT directly to rotating mesh
    this._labelGroup.add(cssObject);

    const id = this._nextId++;
    const labelData = {
      id,
      category: options.category || 'default',
      text: options.text,
      object3D,
      worldOffset: { ...offset },
      cssObject,
      wrapper,
      divElement: inner,
      priority: options.priority || 0,
      maxDistance: options.maxDistance || 0,
      autoRemoveTime: options.autoRemoveTime || 0,
      createdAt: performance.now(),
      visible: true
    };

    this._labels.set(id, labelData);

    if (this._categoryVisibility.has(labelData.category) && !this._categoryVisibility.get(labelData.category)) {
      this.setLabelVisible(id, false);
    }

    return id;
  }

  updateLabel(id, data) {
    const label = this._labels.get(id);
    if (label) {
      if (data.text !== undefined) {
        label.text = data.text;
        label.divElement.textContent = data.text;
      }
      if (data.className !== undefined) {
        label.divElement.className = data.className;
      }
    }
  }

  setLabelVisible(id, visible) {
    const label = this._labels.get(id);
    if (label) {
      label.visible = visible;
      label.wrapper.style.display = visible ? 'block' : 'none';
    }
  }

  removeLabel(id) {
    const label = this._labels.get(id);
    if (label) {
      this._labelGroup.remove(label.cssObject);
      if (label.wrapper.parentNode) {
        label.wrapper.parentNode.removeChild(label.wrapper);
      }
      this._labels.delete(id);
    }
  }

  setCategoryVisible(category, visible) {
    this._categoryVisibility.set(category, visible);
    for (const [id, label] of this._labels.entries()) {
      if (label.category === category) {
        this.setLabelVisible(id, visible);
      }
    }
  }

  update(sceneOrCamera, cameraOrRenderer) {
    if (this._labels.size === 0) return;

    let scene = sceneOrCamera;
    let camera = cameraOrRenderer;
    if (sceneOrCamera && sceneOrCamera.isCamera) {
      camera = sceneOrCamera;
      scene = this._scene;
    } else if (!scene && this._scene) {
      scene = this._scene;
    }

    if (scene && !this._labelGroup.parent) {
      scene.add(this._labelGroup);
    }
    
    // Sync each label world position with target object without rotating/scaling with it
    const now = performance.now();
    for (const [id, label] of this._labels.entries()) {
      if (label.autoRemoveTime > 0 && now - label.createdAt >= label.autoRemoveTime) {
        this.removeLabel(id);
        continue;
      }
      if (label.object3D && label.object3D.visible) {
        label.object3D.getWorldPosition(this._tempPos);
        label.cssObject.position.set(
          this._tempPos.x + label.worldOffset.x,
          this._tempPos.y + label.worldOffset.y,
          this._tempPos.z + label.worldOffset.z
        );
        if (!label.visible && (!this._categoryVisibility.has(label.category) || this._categoryVisibility.get(label.category))) {
          this.setLabelVisible(id, true);
        }
      } else {
        if (label.visible) {
          this.setLabelVisible(id, false);
        }
      }
    }

    if (scene && camera && this._renderer) {
      this._renderer.render(scene, camera);
    }
  }

  resize(width, height) {
    if (this._renderer) {
      this._renderer.setSize(width, height);
    }
  }

  clear() {
    for (const id of Array.from(this._labels.keys())) {
      this.removeLabel(id);
    }
  }

  dispose() {
    this.clear();
    if (this._labelGroup.parent) {
      this._labelGroup.parent.remove(this._labelGroup);
    }
    if (this._renderer && this._renderer.domElement.parentNode) {
      this._renderer.domElement.parentNode.removeChild(this._renderer.domElement);
    }
  }
}
