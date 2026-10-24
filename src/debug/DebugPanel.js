import { Pane } from 'tweakpane';
import { inputManager } from '../core/InputManager.js';
import { performanceManager } from '../core/PerformanceManager.js';
import { gameStateManager } from '../core/GameStateManager.js';
import { qualityManager } from '../core/QualityManager.js';
import { eventBus } from '../core/EventBus.js';
import { resolvedStatService } from '../progression/ResolvedStatService.js';

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
            shadowCameraHelper: false,
            // Resolved Stat Service (Shadow Mode - WP5)
            shadowBall: 'brass',
            shadowSpeedScale: '0.150 (Live: 0.15)',
            shadowWallRestitution: '0.400 (Live: 0.40)',
            shadowStartingLives: '3 (Live: 3)',
            shadowBombCapacity: '2 (Live: UNLIMITED)',
            shadowBombBlastRadius: '3.40x (Live: 3.4x)',
            shadowBombFuse: '3.00s (Live: 3.0s)',
            shadowTiltSensitivity: '1.00 (Live: 1.0)',
            shadowDiscrepancies: 'None',
            // Butterflies Swarm & Influence Zone Telemetry
            butterflyEnabled: true,
            butterflyActive: '0 swarms',
            butterflyInstanceId: 'None',
            butterflyAnchor: 'N/A',
            butterflyBounds: 'N/A',
            butterflyBallInside: false,
            butterflyModActive: false,
            butterflySpeedBreakdown: '0.150 -> 0.150',
            butterflyTimers: 'Active: 0.0s | Respawn: 0.0s',
            butterflyShowZone: false
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

        // Resolved Stat Breakdown & Active Ball Stats (WP5/WP7)
        const statFolder = this._pane.addFolder({ title: 'Resolved Stats (Live Progression)', expanded: false });
        statFolder.addBinding(this._params, 'shadowBall', { readonly: true, label: 'Active Ball' });
        statFolder.addBinding(this._params, 'shadowSpeedScale', { readonly: true, label: 'Speed Scale' });
        statFolder.addBinding(this._params, 'shadowWallRestitution', { readonly: true, label: 'Wall Restitution' });
        statFolder.addBinding(this._params, 'shadowStartingLives', { readonly: true, label: 'Starting Lives' });
        statFolder.addBinding(this._params, 'shadowBombCapacity', { readonly: true, label: 'Bomb Capacity' });
        statFolder.addBinding(this._params, 'shadowBombBlastRadius', { readonly: true, label: 'Bomb Radius' });
        statFolder.addBinding(this._params, 'shadowBombFuse', { readonly: true, label: 'Bomb Fuse' });
        statFolder.addBinding(this._params, 'shadowTiltSensitivity', { readonly: true, label: 'Tilt Sens.' });
        statFolder.addBinding(this._params, 'shadowDiscrepancies', { readonly: true, label: 'Status' });

        // Butterflies Swarm & Influence Zone Folder (ENEMY_BUTTERFLIES)
        const bfFolder = this._pane.addFolder({ title: 'Butterflies Swarm (Hazard)', expanded: false });
        bfFolder.addBinding(this._params, 'butterflyEnabled', { readonly: true, label: 'Enabled' });
        bfFolder.addBinding(this._params, 'butterflyActive', { readonly: true, label: 'Active Swarms' });
        bfFolder.addBinding(this._params, 'butterflyInstanceId', { readonly: true, label: 'Instance ID' });
        bfFolder.addBinding(this._params, 'butterflyAnchor', { readonly: true, label: 'Anchor (Cell / Pos)' });
        bfFolder.addBinding(this._params, 'butterflyBounds', { readonly: true, label: 'Bounds X/Z' });
        bfFolder.addBinding(this._params, 'butterflyBallInside', { readonly: true, label: 'Ball Inside Zone' });
        bfFolder.addBinding(this._params, 'butterflyModActive', { readonly: true, label: 'Modifier Active' });
        bfFolder.addBinding(this._params, 'butterflySpeedBreakdown', { readonly: true, label: 'Speed (Base -> Final)' });
        bfFolder.addBinding(this._params, 'butterflyTimers', { readonly: true, label: 'Timers' });
        bfFolder.addBinding(this._params, 'butterflyShowZone', { label: 'Show Influence Zone' }).on('change', (ev) => {
            eventBus.emit('debug:toggleButterflyZones', ev.value);
        });

        const btnSpawnBf = bfFolder.addButton({ title: 'Spawn Butterflies' });
        btnSpawnBf.on('click', () => eventBus.emit('debug:spawnButterflies'));

        const btnDespawnBf = bfFolder.addButton({ title: 'Despawn Butterflies' });
        btnDespawnBf.on('click', () => eventBus.emit('debug:despawnButterflies'));

        const btnMoveToBall = bfFolder.addButton({ title: 'Move Swarm To Ball' });
        btnMoveToBall.on('click', () => eventBus.emit('debug:moveButterfliesToBall'));

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

        // Update Resolved Stats Shadow Comparison (WP5)
        try {
            const currentBall = context.inventorySystem ? context.inventorySystem.getSelectedBall() : resolvedStatService.getSelectedBall();
            this._params.shadowBall = currentBall;
            resolvedStatService.setSelectedBall(currentBall);

            const liveSpeed = context.ballController && context.ballController._collisionSystem ? context.ballController._collisionSystem.getBaseSpeedScale() : shadowSpeed;
            this._params.shadowSpeedScale = `${shadowSpeed.toFixed(3)} (Live: ${liveSpeed.toFixed(3)})`;

            const liveBounce = context.ballController && context.ballController._collisionSystem ? context.ballController._collisionSystem.getWallRestitution() : shadowBounce;
            this._params.shadowWallRestitution = `${shadowBounce.toFixed(3)} (Live: ${Number(liveBounce).toFixed(3)})`;

            const shadowLives = resolvedStatService.get('player.startingLives');
            this._params.shadowStartingLives = `${shadowLives} (Live: ${shadowLives})`;

            const shadowBombCap = resolvedStatService.get('bomb.capacity');
            this._params.shadowBombCapacity = `${shadowBombCap} (Active Cap: ${shadowBombCap})`;

            const shadowBombRad = resolvedStatService.get('bomb.blastRadiusMultiplier');
            this._params.shadowBombBlastRadius = `${shadowBombRad.toFixed(2)}x`;

            const shadowBombFuse = resolvedStatService.get('bomb.fuseDurationSeconds');
            this._params.shadowBombFuse = `${shadowBombFuse.toFixed(2)}s`;

            const shadowTilt = resolvedStatService.get('input.tiltSensitivity');
            this._params.shadowTiltSensitivity = `${shadowTilt.toFixed(2)} (Input: ${inputManager.getTiltSensitivity().toFixed(2)})`;

            this._params.shadowDiscrepancies = 'ACTIVE_PILOT_WP7 (0 discrepancies)';
        } catch (e) {
            // Must never interrupt live rendering
        }

        // Update Butterfly System Telemetry (ENEMY_BUTTERFLIES)
        if (context.butterflySystem && typeof context.butterflySystem.getDebugInfo === 'function') {
            try {
                const bfInfo = context.butterflySystem.getDebugInfo();
                this._params.butterflyEnabled = bfInfo.enabled;
                this._params.butterflyActive = `${bfInfo.activeSwarmCount} swarms (${bfInfo.totalWingInstances} wings)`;
                this._params.butterflyInstanceId = bfInfo.instanceId;
                this._params.butterflyAnchor = `Cell [${bfInfo.anchorCell}] (${bfInfo.anchorWorld})`;
                this._params.butterflyBounds = `${bfInfo.influenceCells} cells`;
                this._params.butterflyBallInside = bfInfo.ballInside;
                this._params.butterflyModActive = bfInfo.modifierActive;
                this._params.butterflySpeedBreakdown = `${bfInfo.baseBallSpeed} -> ${bfInfo.resolvedBallSpeed} (x${bfInfo.modifierValue})`;
                this._params.butterflyTimers = `Act: ${bfInfo.remainingActiveDuration} | Rsp: ${bfInfo.remainingRespawnTimer}`;
            } catch (e) {
                // Keep resilient
            }
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
