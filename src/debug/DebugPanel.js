import { Pane } from 'tweakpane';
import { inputManager } from '../core/InputManager.js';
import { performanceManager } from '../core/PerformanceManager.js';
import { gameStateManager } from '../core/GameStateManager.js';
import { qualityManager } from '../core/QualityManager.js';
import { eventBus } from '../core/EventBus.js';

export class DebugPanel {
    constructor() {
        this._pane = null;
        this._visible = false;
        this._keyHandler = this._handleKeyDown.bind(this);
        this._helpers = new Map();
        this._unsubs = [];
        this._params = {
            fps: 0,
            avgFps: 0,
            minFps: 0,
            frameTime: 0,
            drawCalls: 0,
            triangles: 0,
            textures: 0,
            geometries: 0,
            pixelRatio: 1,
            qualityTier: 'low',
            currentState: 'NONE',
            ballX: 0,
            ballY: 0,
            ballSpeed: 0,
            score: 0,
            lives: 0,
            timer: 0,
            tileCount: 0,
            discovered: 0,
            obstacleCount: 0,
            findingCount: 0,
            collisionBounds: false,
            cameraHelper: false,
            wireframeMode: false,
            shadowCameraHelper: false
        };
    }

    init() {
        window.addEventListener('keydown', this._keyHandler);
    }

    _handleKeyDown(e) {
        if (e.code === 'Digit2') {
            if (inputManager.isEditableTarget(document.activeElement)) return;
            this.toggle();
        }
    }

    _createPane() {
        this._pane = new Pane({ title: 'Debug' });
        
        const perfFolder = this._pane.addFolder({ title: 'Performance', expanded: true });
        perfFolder.addBinding(this._params, 'fps', { readonly: true, view: 'graph', min: 0, max: 120 });
        perfFolder.addBinding(this._params, 'avgFps', { readonly: true });
        perfFolder.addBinding(this._params, 'minFps', { readonly: true });
        perfFolder.addBinding(this._params, 'frameTime', { readonly: true });
        perfFolder.addBinding(this._params, 'drawCalls', { readonly: true });
        perfFolder.addBinding(this._params, 'triangles', { readonly: true });
        perfFolder.addBinding(this._params, 'textures', { readonly: true });
        perfFolder.addBinding(this._params, 'geometries', { readonly: true });
        perfFolder.addBinding(this._params, 'pixelRatio', { readonly: true });
        perfFolder.addBinding(this._params, 'qualityTier', { readonly: true });
        
        const stateFolder = this._pane.addFolder({ title: 'Game State', expanded: false });
        stateFolder.addBinding(this._params, 'currentState', { readonly: true });
        stateFolder.addBinding(this._params, 'ballX', { readonly: true });
        stateFolder.addBinding(this._params, 'ballY', { readonly: true });
        stateFolder.addBinding(this._params, 'ballSpeed', { readonly: true });
        stateFolder.addBinding(this._params, 'score', { readonly: true });
        stateFolder.addBinding(this._params, 'lives', { readonly: true });
        stateFolder.addBinding(this._params, 'timer', { readonly: true });
        stateFolder.addBinding(this._params, 'tileCount', { readonly: true });
        stateFolder.addBinding(this._params, 'discovered', { readonly: true });
        stateFolder.addBinding(this._params, 'obstacleCount', { readonly: true });
        stateFolder.addBinding(this._params, 'findingCount', { readonly: true });
        
        const helperFolder = this._pane.addFolder({ title: 'Debug Helpers', expanded: false });
        helperFolder.addBinding(this._params, 'collisionBounds');
        helperFolder.addBinding(this._params, 'cameraHelper');
        helperFolder.addBinding(this._params, 'wireframeMode');
        helperFolder.addBinding(this._params, 'shadowCameraHelper');

        this._pane.on('change', (ev) => {
            const key = ev.target?.key || ev.presetKey || '';
            eventBus.emit('debug:changed', { key, value: ev.value });
        });
        
        this._pane.element.style.display = this._visible ? '' : 'none';
        this._pane.element.style.zIndex = '9999';
    }

    _updateParams(context = {}) {
        this._params.fps = Math.round(performanceManager.fps || 0);
        this._params.avgFps = Math.round(performanceManager.avgFps || 0);
        this._params.minFps = Math.round(performanceManager.minFps || 0);
        this._params.frameTime = Math.round((performanceManager.frameTime || 0) * 100) / 100;
        this._params.qualityTier = qualityManager.level || 'high';
        this._params.currentState = gameStateManager.state || 'NONE';

        if (context.renderer && context.renderer.info) {
            const rInfo = context.renderer.info;
            this._params.drawCalls = rInfo.render?.calls || 0;
            this._params.triangles = rInfo.render?.triangles || 0;
            this._params.textures = rInfo.memory?.textures || 0;
            this._params.geometries = rInfo.memory?.geometries || 0;
            this._params.pixelRatio = Math.round(context.renderer.getPixelRatio() * 100) / 100;
        }

        if (context.ballController) {
            const bp = context.ballController.getPhysicsPosition();
            if (bp) {
                this._params.ballX = Math.round(bp.x * 1000) / 1000;
                this._params.ballY = Math.round(bp.y * 1000) / 1000;
            }
            if (context.ballController._collisionSystem) {
                this._params.ballSpeed = Math.round(context.ballController._collisionSystem.getSpeed() * 100) / 100;
            }
        }

        if (context.scoreSystem) {
            this._params.score = context.scoreSystem.getScore();
        }
        if (context.ballLifeSystem) {
            this._params.lives = context.ballLifeSystem.getLives();
        }
        if (context.timer !== undefined) {
            this._params.timer = Math.ceil(context.timer);
        }
        if (context.tileManager) {
            this._params.tileCount = (context.tileManager.tilesX || 18) * (context.tileManager.tilesY || 36);
            this._params.discovered = context.tileManager.getDiscoveredCount ? context.tileManager.getDiscoveredCount() : (context.tileManager.visitedTiles?.size || 0);
        }
        if (context.obstacleManager) {
            const obs = context.obstacleManager.getObstacles();
            this._params.obstacleCount = obs ? obs.size : 0;
        }
        if (context.findingSystem && context.findingSystem._findings) {
            this._params.findingCount = context.findingSystem._findings.size;
        }
    }

    show() {
        if (!this._pane) this._createPane();
        this._visible = true;
        this._pane.element.style.display = '';
    }

    hide() {
        this._visible = false;
        if (this._pane) this._pane.element.style.display = 'none';
    }

    toggle() {
        if (this._visible) this.hide();
        else this.show();
    }

    update(context = {}) {
        if (this._visible && this._pane) {
            this._updateParams(context);
            this._pane.refresh();
        }
    }

    dispose() {
        window.removeEventListener('keydown', this._keyHandler);
        if (this._pane) {
            this._pane.dispose();
            this._pane = null;
        }
    }
}
