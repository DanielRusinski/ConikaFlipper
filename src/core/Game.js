import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { GRAPHICS_CONFIG } from '../config/graphicsConfig.js';
import { eventBus } from './EventBus.js';
import { timeManager } from './TimeManager.js';
import { inputManager } from './InputManager.js';
import { gameStateManager, GAME_STATES } from './GameStateManager.js';
import { performanceManager } from './PerformanceManager.js';
import { qualityManager } from './QualityManager.js';

import { RendererManager } from '../rendering/RendererManager.js';
import { LightingSystem } from '../rendering/LightingSystem.js';
import { ShadowSystem } from '../rendering/ShadowSystem.js';
import { PostProcessingManager } from '../rendering/PostProcessingManager.js';
import { colourManagement } from '../rendering/ColourManagement.js';
import { shaderManager } from '../rendering/ShaderManager.js';

import { TileManager } from '../world/TileManager.js';
import { ObstacleManager } from '../world/ObstacleManager.js';
import { BoardValidator } from '../world/BoardValidator.js';
import { CollisionSystem } from '../world/CollisionSystem.js';
import { TableSelector } from '../world/TableSelector.js';
import { LaserHazardSystem } from '../world/LaserHazardSystem.js';

import { BallController } from '../player/BallController.js';
import { BallLifeSystem } from '../player/BallLifeSystem.js';

import { FindingSystem } from '../gameplay/FindingSystem.js';
import { ScoreSystem } from '../gameplay/ScoreSystem.js';
import { CoinRewardSystem } from '../gameplay/CoinRewardSystem.js';
import { ModifierCardSystem } from '../gameplay/ModifierCardSystem.js';
import { BattleMenuSystem } from '../gameplay/BattleMenuSystem.js';
import { InventorySystem } from '../gameplay/InventorySystem.js';
import { BombSystem } from '../gameplay/BombSystem.js';
import { DragonSystem } from '../gameplay/DragonSystem.js';
import { EnemySystem } from '../gameplay/EnemySystem.js';
import { CentipedeSystem } from '../gameplay/CentipedeSystem.js';

import { ScreenManager } from '../ui/ScreenManager.js';
import { GameHUD } from '../ui/GameHUD.js';
import { LabelSystem } from '../ui/LabelSystem.js';
import { StageBriefing } from '../ui/StageBriefing.js';
import { getStageConfig, STAGE_CONFIG } from '../config/stageConfig.js';

import { SettingsPanel } from '../debug/SettingsPanel.js';
import { DebugPanel } from '../debug/DebugPanel.js';
import { PerformanceGraph } from '../debug/PerformanceGraph.js';

import { TransitionManager } from '../effects/TransitionManager.js';
import { PickupAnimations } from '../effects/PickupAnimations.js';
import { UIAnimations } from '../effects/UIAnimations.js';
import { cellParticles } from '../fx_cells.js';
import { playSound } from '../soundfx.js';

export class Game {
    constructor() {
        this.container = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;

        this.currentStage = 1;
        this.stageBriefing = null;

        this._accumulator = 0;
        this._gameTimer = 0;
        this._gameTimerFormatted = '05:00';
        this._animationFrameId = null;
        this._resizeHandler = this._onResize.bind(this);
        this._gameLoop = this._gameLoop.bind(this);
        this._gameOverTriggered = false;

        this.boardGroup = null;

        // Pre-allocated reusable objects for game loop
        this._cameraTargetPos = new THREE.Vector3();
        this._tableWidth = GAME_CONFIG.table?.width || 0.513;
        this._tableHeight = GAME_CONFIG.table?.height || 1.07;
        this._tableCenterX = this._tableWidth / 2;
        this._tableCenterZ = this._tableHeight / 2;

        // Camera state & fluid zoom
        this._currentCamPos = { x: 0, y: GAME_CONFIG.camera.height, z: GAME_CONFIG.camera.zOffset };
        this._camLookAt = new THREE.Vector3(0, 0, 0);
        this._targetCamLookAt = new THREE.Vector3(0, 0, 0);
        this._cameraZoom = 1.0;
        this._targetCameraZoom = 1.0;
        this._minZoom = 0.68;
        this._maxZoom = 1.45;
        this._battleCameraProgress = 0.0;
        this._targetBattleCameraProgress = 0.0;
        this._currentCameraZone = 1; // 0 = Top, 1 = Middle, 2 = Bottom (virtual 3 equal zones)

        // Table selector (Entry Phase)
        this.tableSelector = null;

        // Enemy system
        this.enemySystem = null;

        // Centipede system (Stonoga)
        this.centipedeSystem = null;

        // Camera shake trauma state
        this._camTrauma = 0.0;
        this._camShakeOffset = new THREE.Vector3();

        // Respawn countdown state (9 to 0)
        this._respawnCountdown = null;
        this._respawnCountdownInt = 9;

        // Tilt state
        this._currentTiltX = 0;
        this._currentTiltY = 0;
    }

    triggerCameraShake(amount = 0.45) {
        this._camTrauma = Math.min(1.0, Math.max(this._camTrauma, amount));
    }

    async init() {
        this.container = document.getElementById('game-container');
        const uiOverlay = document.getElementById('ui-overlay');
        const hudContainer = document.getElementById('hud');
        const screensContainer = document.getElementById('screens');
        const labelContainer = document.getElementById('label-container');

        // 1. Renderer
        this.rendererManager = new RendererManager(this.container);
        this.rendererManager.init();
        this.renderer = this.rendererManager.renderer;
        this.scene = this.rendererManager.scene;
        this.camera = this.rendererManager.camera;

        // 2. Colour management
        colourManagement.init(this.renderer);

        // 3. Lighting
        this.lightingSystem = new LightingSystem();
        this.lightingSystem.init(this.scene);

        // 4. Shadows
        this.shadowSystem = new ShadowSystem();
        this.shadowSystem.init(this.lightingSystem.getKeyLight(), this.scene);
        this.shadowSystem.updateBounds(GAME_CONFIG.table);

        // 5. Post-processing
        this.postProcessing = new PostProcessingManager();
        this.postProcessing.init(this.renderer, this.scene, this.camera);
        this.postProcessing.resize(window.innerWidth, window.innerHeight, this.renderer.getPixelRatio());

        // 6. Board group
        this.boardGroup = new THREE.Group();
        this.scene.add(this.boardGroup);

        // 7. Tile system
        this.tileManager = new TileManager();
        this.tileManager.init(this.scene, new THREE.TextureLoader());
        this.boardGroup.add(this.tileManager.group);

        // 8. Obstacles
        this.boardValidator = new BoardValidator();
        this.obstacleManager = new ObstacleManager();
        this.obstacleManager.init(this.tileManager);

        const spawnGX = GAME_CONFIG.spawn.defaultGridX;
        const spawnGY = GAME_CONFIG.spawn.defaultGridY;

        let obstacles = this.obstacleManager.generate(
            GAME_CONFIG.grid.tilesX,
            GAME_CONFIG.grid.tilesY,
            GAME_CONFIG.obstacles.density,
            spawnGX, spawnGY,
            GAME_CONFIG.obstacles.safeRadius,
            Date.now() % 100000
        );

        // Validate board
        const validation = this.boardValidator.validate(
            GAME_CONFIG.grid.tilesX,
            GAME_CONFIG.grid.tilesY,
            obstacles, spawnGX, spawnGY
        );
        if (!validation.valid) {
            // Retry with reduced density or empty obstacles
            for (let retry = 0; retry < GAME_CONFIG.obstacles.maxRetries; retry++) {
                obstacles = this.obstacleManager.generate(
                    GAME_CONFIG.grid.tilesX,
                    GAME_CONFIG.grid.tilesY,
                    GAME_CONFIG.obstacles.density * 0.7,
                    spawnGX, spawnGY,
                    GAME_CONFIG.obstacles.safeRadius,
                    Date.now() % 100000 + retry
                );
                const v = this.boardValidator.validate(
                    GAME_CONFIG.grid.tilesX,
                    GAME_CONFIG.grid.tilesY,
                    obstacles, spawnGX, spawnGY
                );
                if (v.valid) break;
            }
        }

        this.tileManager.setObstacles(obstacles);
        this.obstacleManager.createObstacleMeshes(this.scene, this.tileManager);
        if (this.obstacleManager.obstacleGroup) {
            this.boardGroup.add(this.obstacleManager.obstacleGroup);
        }

        // 9. Collision system
        this.collisionSystem = new CollisionSystem();
        this.collisionSystem.init(
            GAME_CONFIG.table.width,
            GAME_CONFIG.table.height,
            GAME_CONFIG.ball.radius
        );

        // Build obstacle AABBs for collision
        const obstacleAABBs = this._buildObstacleAABBs(obstacles);
        this.collisionSystem.setObstacles(obstacleAABBs);

        // 10. Inventory
        this.inventorySystem = new InventorySystem();
        this.inventorySystem.init();

        // 11. Ball controller
        this.ballController = new BallController();
        this.ballController.init(
            this.boardGroup,
            this.collisionSystem,
            this.inventorySystem.getSelectedBall()
        );

        // 12. Ball life system
        this.ballLifeSystem = new BallLifeSystem();
        this.ballLifeSystem.init(GAME_CONFIG.lives.starting);

        // 13. Input
        inputManager.init(this.renderer.domElement);

        // 14. Gameplay systems
        this.findingSystem = new FindingSystem();
        this.findingSystem.init(this.boardGroup);

        this.laserHazardSystem = new LaserHazardSystem();
        this.laserHazardSystem.init(this.boardGroup, this.tileManager);

        this.scoreSystem = new ScoreSystem();
        this.scoreSystem.init();

        this.coinRewardSystem = new CoinRewardSystem();
        this.coinRewardSystem.init(uiOverlay, this.boardGroup);

        this.modifierCardSystem = new ModifierCardSystem();
        this.modifierCardSystem.init(uiOverlay);

        this.battleMenuSystem = new BattleMenuSystem();
        this.battleMenuSystem.init(uiOverlay);

        // 15. UI
        this.gameHUD = new GameHUD();
        this.gameHUD.init(hudContainer);

        this.screenManager = new ScreenManager();
        this.screenManager.init(screensContainer);

        this.labelSystem = new LabelSystem();
        this.labelSystem.init(labelContainer, this.scene);
        this.findingSystem.setLabelSystem(this.labelSystem);
        this.findingSystem.setupBoardCrystals(this.tileManager);

        this.stageBriefing = new StageBriefing();
        this.stageBriefing.init(uiOverlay);

        // 16. Debug
        this.settingsPanel = new SettingsPanel();
        this.settingsPanel.init();

        this.debugPanel = new DebugPanel();
        this.debugPanel.init();

        this.performanceGraph = new PerformanceGraph();
        this.performanceGraph.init();

        // 17. Effects
        this.transitionManager = new TransitionManager();
        this.transitionManager.init(this.renderer);

        this.uiAnimations = new UIAnimations();
        this.pickupAnimations = new PickupAnimations();

        // 18. Particles
        cellParticles.init(this.boardGroup, this.camera);

        // 18b. Table selector (Entry phase)
        this.tableSelector = new TableSelector();
        this.tableSelector.init(this.boardGroup, this.tileManager, this.camera, this.renderer.domElement);

        // 18c. Bomb system
        this.bombSystem = new BombSystem();
        this.bombSystem.init(this.boardGroup, this.tileManager, this.camera, this.renderer.domElement, this.ballController);

        // 18d. Dragon companion system
        this.dragonSystem = new DragonSystem();
        this.dragonSystem.init(this.boardGroup, this.tileManager, this.ballController);

        // 18e. Enemy system (Cylinder / Walce)
        this.enemySystem = new EnemySystem();
        this.enemySystem.init(this.boardGroup, this.tileManager, this.ballController, this.dragonSystem, this.labelSystem);

        // 18f. Centipede system (Stonoga)
        this.centipedeSystem = new CentipedeSystem();
        this.centipedeSystem.init(
            this.boardGroup,
            this.tileManager,
            this.ballController,
            this.labelSystem,
            this.enemySystem,
            this.laserHazardSystem
        );

        // Zoom event listeners (mouse wheel + touch pinch)
        this.renderer.domElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomDelta = e.deltaY * 0.001;
            this._targetCameraZoom = THREE.MathUtils.clamp(this._targetCameraZoom + zoomDelta, this._minZoom, this._maxZoom);
        }, { passive: false });

        // Pinch-to-zoom using unified Pointer Events (works for mouse, touch screen, and stylus/pen)
        const activePointers = new Map();
        let initialPinchDist = null;
        let initialZoom = 1.0;

        this.renderer.domElement.addEventListener('pointerdown', (e) => {
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
            if (activePointers.size === 2) {
                const pts = Array.from(activePointers.values());
                const dx = pts[0].x - pts[1].x;
                const dy = pts[0].y - pts[1].y;
                initialPinchDist = Math.hypot(dx, dy);
                initialZoom = this._targetCameraZoom;
            }
        }, { passive: true });

        this.renderer.domElement.addEventListener('pointermove', (e) => {
            if (activePointers.has(e.pointerId)) {
                activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
            }
            if (activePointers.size === 2 && initialPinchDist) {
                const pts = Array.from(activePointers.values());
                const dx = pts[0].x - pts[1].x;
                const dy = pts[0].y - pts[1].y;
                const dist = Math.hypot(dx, dy);
                if (dist > 10) {
                    const factor = initialPinchDist / dist;
                    this._targetCameraZoom = THREE.MathUtils.clamp(initialZoom * factor, this._minZoom, this._maxZoom);
                }
            }
        }, { passive: true });

        const onPointerRelease = (e) => {
            activePointers.delete(e.pointerId);
            if (activePointers.size < 2) {
                initialPinchDist = null;
            }
        };

        this.renderer.domElement.addEventListener('pointerup', onPointerRelease, { passive: true });
        this.renderer.domElement.addEventListener('pointercancel', onPointerRelease, { passive: true });

        // 19. Event listeners
        window.addEventListener('resize', this._resizeHandler);
        this._setupEventListeners();

        // 20. Initial state
        this._gameTimer = GAME_CONFIG.timer.startingSeconds;
        this.showTitle();

        // Set initial camera position
        this._currentCamPos.x = 0;
        this._currentCamPos.y = GAME_CONFIG.camera.height;
        this._currentCamPos.z = GAME_CONFIG.camera.zOffset;
        this.camera.position.set(this._currentCamPos.x, this._currentCamPos.y, this._currentCamPos.z);
        this.camera.lookAt(0, 0, 0);
    }

    _setupEventListeners() {
        // Screen button events
        eventBus.on('ui:startRequested', () => this.startEntryPhase());
        eventBus.on('ui:equipmentRequested', () => this.showEquipment());
        eventBus.on('ui:settingsRequested', () => this.settingsPanel.toggle());
        eventBus.on('ui:pauseRequested', () => this.pauseGame());
        eventBus.on('ui:resumeRequested', () => this.resumeGame());
        eventBus.on('ui:restartRequested', () => this.startEntryPhase());
        eventBus.on('ui:titleRequested', () => this.showTitle());
        eventBus.on('selector:confirmed', ({ gridX, gridY }) => this.launchBall(gridX, gridY));
        eventBus.on('stage:completed', (data) => this.onStageCompleted(data));
        eventBus.on('ui:nextStageRequested', () => this.nextStage());
        eventBus.on('ui:equipmentBack', () => {
            this.screenManager.hideAll();
            const prev = this._equipmentPrevState || gameStateManager.previousState || GAME_STATES.PLAYING;
            this._equipmentPrevState = null;
            if (prev === GAME_STATES.PLAYING) {
                this.gameHUD.show();
                gameStateManager.setState(GAME_STATES.PLAYING);
            } else if (prev === GAME_STATES.SELECTION) {
                this.gameHUD.show();
                gameStateManager.setState(GAME_STATES.SELECTION);
            } else if (prev === GAME_STATES.SLOW_MOTION_MENU) {
                this.gameHUD.show();
                gameStateManager.setState(GAME_STATES.SLOW_MOTION_MENU);
            } else {
                this.showTitle();
            }
        });

        // Ball type change
        eventBus.on('ball:typeChanged', ({ type }) => {
            if (this.inventorySystem) {
                this.inventorySystem.selectedBallType = type;
                this.inventorySystem.save();
            }
            if (this.ballController) {
                this.ballController.setType(type);
            }
        });

        // Game over from lives
        eventBus.on('life:changed', ({ lives }) => {
            if (lives <= 0) {
                this.gameOver('noLives');
            }
        });

        // Audio & Particle FX
        eventBus.on('tile:discovered', (data) => {
            playSound(550, 0.08);
            if (cellParticles && cellParticles.trigger) {
                const px = (data && Number.isFinite(data.x)) ? data.x : (this.ballController?.mesh?.position.x ?? 0);
                const pz = (data && Number.isFinite(data.z)) ? data.z : (this.ballController?.mesh?.position.z ?? 0);
                if (Number.isFinite(px) && Number.isFinite(pz)) {
                    cellParticles.trigger(px, pz, false);
                }
            }
        });
        eventBus.on('coin:collected', () => playSound(1100, 0.12));
        eventBus.on('finding:collected', (data) => {
            playSound(850, 0.2);
            if (data && data.givesLife && this.ballLifeSystem) {
                this.ballLifeSystem.addLife(1);
            }
        });
        eventBus.on('laser:hit', (data) => this._onLaserHit(data));
        eventBus.on('modifier:collected', () => playSound(1300, 0.3));
        eventBus.on('modifier:selected', ({ card }) => {
            if (card && card.duration && card.duration > 0) {
                const addedSeconds = Number(card.duration);
                this._gameTimer += addedSeconds;
                
                const mins = Math.floor(this._gameTimer / 60);
                const secs = Math.floor(this._gameTimer % 60);
                this._gameTimerFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                
                eventBus.emit('timer:changed', {
                    time: this._gameTimer,
                    formatted: this._gameTimerFormatted,
                    added: addedSeconds
                });

                playSound(1600, 0.25);
            }
        });
        eventBus.on('timer:add', ({ seconds }) => {
            if (seconds && seconds > 0) {
                const addedSeconds = Number(seconds);
                this._gameTimer += addedSeconds;
                
                const mins = Math.floor(this._gameTimer / 60);
                const secs = Math.floor(this._gameTimer % 60);
                this._gameTimerFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                
                eventBus.emit('timer:changed', {
                    time: this._gameTimer,
                    formatted: this._gameTimerFormatted,
                    added: addedSeconds
                });

                playSound(1600, 0.25);
            }
        });

        // State changes
        eventBus.on('state:changed', ({ state, previousState }) => {
            this._onStateChanged(state, previousState);
        });

        // Battle menu (via circular battle orb or UI event)
        eventBus.on('ui:battleMenuRequested', () => {
            if (this.battleMenuSystem) {
                this.battleMenuSystem.toggle();
            }
        });

        // Keyboard: Escape
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape') {
                if (gameStateManager.is(GAME_STATES.PAUSED)) {
                    this.resumeGame();
                } else if (gameStateManager.is(GAME_STATES.SLOW_MOTION_MENU)) {
                    this.battleMenuSystem.close();
                } else if (gameStateManager.is(GAME_STATES.EQUIPMENT)) {
                    eventBus.emit('ui:equipmentBack');
                } else if (gameStateManager.is(GAME_STATES.PLAYING) || gameStateManager.is(GAME_STATES.SELECTION)) {
                    this.pauseGame();
                }
            }
        });

        // Grid rebuild request
        eventBus.on('request:gridRebuild', (params) => this.rebuildBoard(params));

        // Settings change live dispatcher
        eventBus.on('settings:changed', ({ key, value }) => {
            if (key === 'lightingPreset') {
                this.lightingSystem.applyPreset(value);
            } else if (key === 'qualityLevel') {
                qualityManager.setUserPreference(value);
            } else if (key === 'saturation') {
                colourManagement.setSaturation(value);
            } else if (key === 'exposure') {
                colourManagement.setExposure(value);
            } else if (key === 'postProcessing') {
                this.postProcessing.setEnabled(value);
            } else if (key === 'ballType') {
                this.inventorySystem.setSelectedBall(value);
            } else if (key === 'ghostSilhouette') {
                this.ballController.setGhostEnabled(value);
            } else if (key === 'adaptiveQuality') {
                qualityManager._autoEnabled = value;
            } else if (key === 'bloomStrength') {
                this.postProcessing.setBloomStrength(value);
            } else if (key === 'bloomRadius') {
                this.postProcessing.setBloomRadius(value);
            } else if (key === 'bloomThreshold') {
                this.postProcessing.setBloomThreshold(value);
            } else if (key === 'bloomEnabled') {
                this.postProcessing.setBloomEnabled(value);
            } else if (key === 'shadowsEnabled') {
                this.shadowSystem.setEnabled(value);
            } else if (key === 'pointLightsEnabled') {
                if (this.lightingSystem) this.lightingSystem.setPointLightsEnabled(value);
            } else if (key === 'pointLightsIntensity') {
                if (this.lightingSystem) this.lightingSystem.setPointLightsIntensity(value);
            } else if (key === 'pointLightsPulsing') {
                if (this.lightingSystem) this.lightingSystem.setPointLightsPulsing(value);
            } else if (key === 'pointLightsSpeed') {
                if (this.lightingSystem) this.lightingSystem.setPointLightsSpeed(value);
            } else if (key === 'pinkLightColor') {
                if (this.lightingSystem) this.lightingSystem.setPinkLightColor(value);
            } else if (key === 'pinkLightDistance') {
                if (this.lightingSystem) this.lightingSystem.setPinkLightDistance(value);
            } else if (key === 'blueLightColor') {
                if (this.lightingSystem) this.lightingSystem.setBlueLightColor(value);
            } else if (key === 'blueLightDistance') {
                if (this.lightingSystem) this.lightingSystem.setBlueLightDistance(value);
            } else if (key === 'pointLightsAutoCycle') {
                if (this.lightingSystem) this.lightingSystem.setPointLightsAutoCycle(value);
            } else if (key === 'ballSpeedMultiplier') {
                if (this.collisionSystem) this.collisionSystem.setBaseSpeedScale(value);
            }
        });

        // Screen shake listener
        eventBus.on('fx:shake', ({ trauma }) => {
            this.triggerCameraShake(trauma || 0.45);
        });

        // Debug actions from settings
        eventBus.on('request:randomizeLights', () => {
            if (this.lightingSystem) {
                this.lightingSystem.randomizeAccentLights();
            }
        });

        eventBus.on('request:spawnGreenCrystal', () => {
            if (this.findingSystem && this.ballController && this.ballController.mesh) {
                const pos = this.ballController.mesh.position;
                this.findingSystem._spawnFinding(pos.x + 0.04, pos.z + 0.04, 0, 'emerald_crystal');
            }
        });

        eventBus.on('request:spawnCardCrystal', () => {
            if (this.findingSystem && this.ballController && this.ballController.mesh) {
                const pos = this.ballController.mesh.position;
                this.findingSystem._spawnFinding(pos.x + 0.04, pos.z + 0.04, 0, 'modifier');
            }
        });

        eventBus.on('request:spawnCentipede', () => {
            if (this.centipedeSystem) {
                this.centipedeSystem.spawn();
            }
        });

        eventBus.on('request:triggerLaser', () => {
            if (this.laserHazardSystem) {
                const ballPos = this.ballController && this.ballController.mesh ? this.ballController.mesh.position : null;
                this.laserHazardSystem.triggerManual(ballPos);
            }
        });

        eventBus.on('request:completeStage', () => {
            this.debugCompleteStage();
        });

        // Debug change live dispatcher
        eventBus.on('debug:changed', ({ key, value }) => {
            if (key === 'wireframeMode') {
                this.scene.traverse((obj) => {
                    if (obj.isMesh && obj.material) {
                        obj.material.wireframe = value;
                    }
                });
            }
        });
    }

    _buildObstacleAABBs(obstacles) {
        const aabbs = [];
        const tw = GAME_CONFIG.table.width / GAME_CONFIG.grid.tilesX;
        const th = GAME_CONFIG.table.height / GAME_CONFIG.grid.tilesY;

        for (const tileIndex of obstacles) {
            const gridY = Math.floor(tileIndex / GAME_CONFIG.grid.tilesX);
            const gridX = tileIndex % GAME_CONFIG.grid.tilesX;
            const worldX = gridX * tw;
            const worldZ = gridY * th;
            aabbs.push({
                minX: worldX,
                minZ: worldZ,
                maxX: worldX + tw,
                maxZ: worldZ + th
            });
        }
        return aabbs;
    }

    start() {
        this._animationFrameId = requestAnimationFrame(this._gameLoop);
        if (gameStateManager.is(GAME_STATES.TITLE)) {
            this.showTitle();
        }
    }

    _gameLoop(timestamp) {
        this._animationFrameId = requestAnimationFrame(this._gameLoop);

        this.performanceGraph.begin();
        performanceManager.begin();

        timeManager.update(timestamp);
        inputManager.update();

        const delta = timeManager.delta;
        const gameplayDelta = timeManager.gameplayDelta;
        const elapsed = timeManager.elapsed;

        // Adaptive quality (evaluates rolling average FPS, frame time, and WebGL metrics)
        qualityManager.update(performanceManager.fps, delta, this.renderer ? this.renderer.info : null);

        // Update camera trauma shake decay
        if (this._camTrauma > 0) {
            this._camTrauma = Math.max(0, this._camTrauma - delta * 2.4);
            const shake = (this._camTrauma * this._camTrauma) * 0.055;
            this._camShakeOffset.set(
                (Math.random() * 2 - 1) * shake,
                (Math.random() * 2 - 1) * (shake * 0.6),
                (Math.random() * 2 - 1) * shake
            );
        } else {
            this._camShakeOffset.set(0, 0, 0);
        }

        const isPlaying = gameStateManager.is(GAME_STATES.PLAYING);
        const isSlowMo = gameStateManager.is(GAME_STATES.SLOW_MOTION_MENU);
        const isModifierSelect = gameStateManager.is(GAME_STATES.MODIFIER_SELECTION);

        if (isPlaying || isSlowMo || isModifierSelect) {
            // Map input tilt to physics angles (neutralized during card selection modal)
            const maxTilt = GAME_CONFIG.physics.maxTilt;
            const targetTiltX = isModifierSelect ? 0 : (inputManager.tiltX * maxTilt);
            const targetTiltY = isModifierSelect ? 0 : (inputManager.tiltY * maxTilt);

            // Smooth tilt interpolation
            const tiltLerp = Math.min(delta * 10, 1.0);
            this._currentTiltX += (targetTiltX - this._currentTiltX) * tiltLerp;
            this._currentTiltY += (targetTiltY - this._currentTiltY) * tiltLerp;

            // Update ball physics only if active (not destroyed)
            const ballActive = Boolean(this.ballController && this.ballController.active);
            const ballPos = (this.ballController && this.ballController.getPhysicsPosition && ballActive)
                ? this.ballController.getPhysicsPosition()
                : (this.tableSelector && this.tableSelector.mesh && this.tableSelector.active
                    ? { x: this.tableSelector.mesh.position.x + this._tableCenterX, y: this.tableSelector.mesh.position.z + this._tableCenterZ }
                    : { x: this._tableCenterX, y: this._tableCenterZ });

            if (ballActive) {
                this.ballController.update(
                    this._currentTiltX,
                    this._currentTiltY,
                    delta,
                    gameplayDelta
                );

                const updatedPos = this.ballController.getPhysicsPosition();
                ballPos.x = updatedPos.x;
                ballPos.y = updatedPos.y;

                // Tile discovery (only during active playing)
                if (isPlaying) {
                    this.tileManager.checkAndUpdate(ballPos.x, ballPos.y, gameplayDelta);
                }

                // Findings collection check (prevent double collection during card modal)
                if (this.ballController.mesh && !isModifierSelect) {
                    this.findingSystem.checkCollection(
                        this.ballController.mesh.position.x,
                        this.ballController.mesh.position.z,
                        GAME_CONFIG.ball.radius
                    );
                }
            }

            // Findings animations and timers
            this.findingSystem.update(gameplayDelta);

            // Laser hazard
            if (this.laserHazardSystem && (isPlaying || isSlowMo || isModifierSelect)) {
                const ball3D = (ballActive && this.ballController && this.ballController.mesh)
                    ? this.ballController.mesh.position
                    : null;
                this.laserHazardSystem.update(gameplayDelta, ball3D);
            }

            // Bomb system (countdown, drops, and detonations)
            if (this.bombSystem) {
                try {
                    this.bombSystem.update(gameplayDelta);
                } catch (err) {
                    console.error('BombSystem update error:', err);
                }
            }

            // Dragon companion system (flight, wave motion, tile discovery)
            if (this.dragonSystem) {
                try {
                    this.dragonSystem.update(gameplayDelta);
                } catch (err) {
                    console.error('DragonSystem update error:', err);
                }
            }

            // Enemy system (Cylinder / Walce patrolling 3x3 perimeters)
            if (this.enemySystem && (isPlaying || isSlowMo || isModifierSelect)) {
                try {
                    this.enemySystem.update(gameplayDelta);
                } catch (err) {
                    console.error('EnemySystem update error:', err);
                }
            }

            // Centipede enemy system (Stonoga)
            if (this.centipedeSystem && (isPlaying || isSlowMo || isModifierSelect)) {
                try {
                    this.centipedeSystem.update(gameplayDelta);
                } catch (err) {
                    console.error('CentipedeSystem update error:', err);
                }
            }

            // Score multiplier expiry (only ticks down during active play)
            if (isPlaying) {
                this.scoreSystem.update(elapsed);
            }

            // Game timer (only countdown during PLAYING, not slow-mo selection screens)
            if (isPlaying) {
                this._gameTimer -= gameplayDelta;
                if (this._gameTimer < 0) this._gameTimer = 0;

                const mins = Math.floor(this._gameTimer / 60);
                const secs = Math.floor(this._gameTimer % 60);
                this._gameTimerFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                eventBus.emit('timer:changed', {
                    time: this._gameTimer,
                    formatted: this._gameTimerFormatted
                });

                if (this._gameTimer <= 0 && !this._gameOverTriggered) {
                    this.gameOver('timeout');
                }
            }

            // Board tilt visual
            this.boardGroup.rotation.z = -this._currentTiltX;
            this.boardGroup.rotation.x = this._currentTiltY;

            // Smooth zoom dampening
            this._cameraZoom += (this._targetCameraZoom - this._cameraZoom) * Math.min(delta * 5.0, 1.0);

            // Dynamically restore standard gameplay FOV (45 deg)
            if (this.camera && Math.abs(this.camera.fov - 45) > 0.05) {
                const fovLerp = 1.0 - Math.exp(-3.5 * delta);
                this.camera.fov += (45 - this.camera.fov) * fovLerp;
                this.camera.updateProjectionMatrix();
            }

            // Battle camera zoom progress (smooth transition in/out of bullet-time close-up)
            this._targetBattleCameraProgress = (isSlowMo || isModifierSelect) ? 1.0 : 0.0;
            const battleLerpRate = 1.0 - Math.exp(-5.0 * delta);
            this._battleCameraProgress += (this._targetBattleCameraProgress - this._battleCameraProgress) * battleLerpRate;
            const p = Math.max(0, Math.min(1, this._battleCameraProgress));
            const smoothP = p * p * (3 - 2 * p); // smoothstep S(p)

            // Camera follow with 3-zone intelligent framing & fluid ball tracking
            const ball3DX = ballPos.x - this._tableCenterX;
            const ball3DZ = ballPos.y - this._tableCenterZ;

            // 3 Equal Zones along Z:
            // Zone 0: Top [-0.535, -0.1783], center -0.3567
            // Zone 1: Middle [-0.1783, 0.1783], center 0.0
            // Zone 2: Bottom [0.1783, 0.535], center 0.3567
            // Hysteresis thresholds avoid jitter near boundaries
            if (this._currentCameraZone === 0) {
                if (ball3DZ > -0.14) this._currentCameraZone = 1;
            } else if (this._currentCameraZone === 1) {
                if (ball3DZ < -0.20) this._currentCameraZone = 0;
                else if (ball3DZ > 0.20) this._currentCameraZone = 2;
            } else {
                if (ball3DZ < 0.14) this._currentCameraZone = 1;
            }

            const zoneCenters = [-0.3567, 0.0, 0.3567];
            const zoneCenterZ = zoneCenters[this._currentCameraZone];

            // Dynamic camera distance calculated from aspect ratio to ensure zone fits on portrait screens
            // with generous 2/3 margins above and below while ball remains centered
            const aspect = this.camera.aspect || (window.innerWidth / window.innerHeight);
            const aspectFactor = Math.max(0.40, Math.min(1.0, aspect / 0.85));
            const baseHeight = (0.75 / aspectFactor) * this._cameraZoom;
            const baseZOffset = baseHeight * 0.48;

            // Intelligent tracking: blend zone center framing with real-time ball position
            const normLookAtX = ball3DX * 0.55;
            const normLookAtY = 0;
            const normLookAtZ = zoneCenterZ * 0.40 + ball3DZ * 0.60;

            const normCamTargetX = ball3DX * 0.50;
            const normCamTargetY = baseHeight;
            const normCamTargetZ = normLookAtZ + baseZOffset;

            // Close-up target centered on ball for slow-mo bullet-time
            const closeCamTargetX = ball3DX;
            const closeCamTargetY = 0.26;
            const closeCamTargetZ = ball3DZ + 0.22;

            // Blend targets
            const camTargetX = normCamTargetX + (closeCamTargetX - normCamTargetX) * smoothP;
            const camTargetY = normCamTargetY + (closeCamTargetY - normCamTargetY) * smoothP;
            const camTargetZ = normCamTargetZ + (closeCamTargetZ - normCamTargetZ) * smoothP;

            const camLerp = 1.0 - Math.exp(-4.2 * delta);
            this._currentCamPos.x += (camTargetX - this._currentCamPos.x) * camLerp;
            this._currentCamPos.y += (camTargetY - this._currentCamPos.y) * camLerp;
            this._currentCamPos.z += (camTargetZ - this._currentCamPos.z) * camLerp;

            this.camera.position.set(
                this._currentCamPos.x + this._camShakeOffset.x,
                this._currentCamPos.y + this._camShakeOffset.y,
                this._currentCamPos.z + this._camShakeOffset.z
            );

            // Overview lookAt vs Close-up lookAt
            const closeLookAtX = ball3DX;
            const closeLookAtY = GAME_CONFIG.ball.radius;
            const closeLookAtZ = ball3DZ;

            const targetLookAtX = normLookAtX + (closeLookAtX - normLookAtX) * smoothP;
            const targetLookAtY = normLookAtY + (closeLookAtY - normLookAtY) * smoothP;
            const targetLookAtZ = normLookAtZ + (closeLookAtZ - normLookAtZ) * smoothP;

            this._targetCamLookAt.set(targetLookAtX, targetLookAtY, targetLookAtZ);
            this._camLookAt.lerp(this._targetCamLookAt, camLerp);
            this.camera.lookAt(this._camLookAt);

            // Particles
            cellParticles.update(gameplayDelta, this.camera);

        } else if (gameStateManager.is(GAME_STATES.SELECTION)) {
            this._targetBattleCameraProgress = 0.0;
            this._battleCameraProgress = 0.0;
            // Update table selector in entry phase
            this.tableSelector.update(timestamp);
            this._cameraZoom += (this._targetCameraZoom - this._cameraZoom) * Math.min(delta * 5.0, 1.0);

            // Level / flatten the board vertically and horizontally (pitch=0, roll=0, yaw=0)
            this._currentTiltX = 0;
            this._currentTiltY = 0;
            const tiltLerp = 1.0 - Math.exp(-9.0 * delta);
            this.boardGroup.rotation.x += (0 - this.boardGroup.rotation.x) * tiltLerp;
            this.boardGroup.rotation.z += (0 - this.boardGroup.rotation.z) * tiltLerp;
            this.boardGroup.rotation.y += (0 - this.boardGroup.rotation.y) * tiltLerp;

            // Dynamically adjust FOV towards ~38 deg for a clean, distortion-free top-down orthogonal view
            const targetFov = 38;
            if (this.camera && Math.abs(this.camera.fov - targetFov) > 0.05) {
                const fovLerp = 1.0 - Math.exp(-3.5 * delta);
                this.camera.fov += (targetFov - this.camera.fov) * fovLerp;
                this.camera.updateProjectionMatrix();
            }

            // Top-down camera height calculated so the entire board (all 18x36 tiles) fits on screen
            // with comfortable margins on any display (portrait phone, tablet, landscape PC)
            const tableW = this._tableWidth || GAME_CONFIG.table?.width || 0.513;
            const tableH = this._tableHeight || GAME_CONFIG.table?.height || 1.07;
            const aspect = this.camera ? (this.camera.aspect || (window.innerWidth / window.innerHeight)) : 1.0;
            const fovRad = (this.camera ? (this.camera.fov || 38) : 38) * Math.PI / 180;
            const halfFovTan = Math.tan(fovRad / 2);

            const halfSpanZ = (tableH * 0.5) * 1.25;
            const halfSpanX = (tableW * 0.5) * 1.25;

            const heightForZ = halfSpanZ / halfFovTan;
            const heightForX = halfSpanX / (aspect * halfFovTan);
            const topDownHeight = Math.max(heightForZ, heightForX) * (this._cameraZoom || 1.0);

            // High-angle almost orthogonal top-down position (near 79 degrees, avoiding gimbal lock singularity)
            const camTargetX = 0;
            const camTargetY = topDownHeight;
            const camTargetZ = topDownHeight * 0.20;

            const camLerp = 1.0 - Math.exp(-GAME_CONFIG.camera.lerpSpeed * delta);
            this._currentCamPos.x += (camTargetX - this._currentCamPos.x) * camLerp;
            this._currentCamPos.y += (camTargetY - this._currentCamPos.y) * camLerp;
            this._currentCamPos.z += (camTargetZ - this._currentCamPos.z) * camLerp;

            // Defensive check against NaN
            if (isNaN(this._currentCamPos.x) || isNaN(this._currentCamPos.y) || isNaN(this._currentCamPos.z)) {
                this._currentCamPos = { x: 0, y: 1.85, z: 0.38 };
            }

            this.camera.position.set(
                this._currentCamPos.x + this._camShakeOffset.x,
                this._currentCamPos.y + this._camShakeOffset.y,
                this._currentCamPos.z + this._camShakeOffset.z
            );
            this._targetCamLookAt.set(0, 0, 0.02);
            this._camLookAt.lerp(this._targetCamLookAt, camLerp);
            this.camera.lookAt(this._camLookAt);

            // Enemies continue moving and patrolling during ball selection
            if (this.enemySystem) {
                try {
                    this.enemySystem.update(delta);
                } catch (err) {
                    console.error('EnemySystem update error in selection:', err);
                }
            }

            if (this.centipedeSystem) {
                try {
                    this.centipedeSystem.update(delta);
                } catch (err) {
                    console.error('CentipedeSystem update error in selection:', err);
                }
            }

            // Particles update during selection
            if (cellParticles && cellParticles.update) {
                cellParticles.update(delta, this.camera);
            }

            // Respawn countdown handling (9 to 0) & auto-launch
            if (this._respawnCountdown !== null) {
                this._respawnCountdown -= delta;
                const curCount = Math.max(0, Math.ceil(this._respawnCountdown));
                if (curCount !== this._respawnCountdownInt && curCount >= 0) {
                    this._respawnCountdownInt = curCount;
                    if (this.stageBriefing) {
                        this.stageBriefing.updateCountdown(curCount);
                    }
                    if (curCount > 0) {
                        playSound(700 + (9 - curCount) * 40, 0.10);
                    }
                }

                if (this._respawnCountdown <= 0) {
                    this._respawnCountdown = null;
                    playSound(1150, 0.25);
                    // Automatically place ball at current selector position
                    let gx = this.tableSelector ? this.tableSelector.gridX : (GAME_CONFIG.spawn.defaultGridX || 9);
                    let gy = this.tableSelector ? this.tableSelector.gridY : (GAME_CONFIG.spawn.defaultGridY || 18);
                    if (this.tileManager && this.tileManager.isObstacle(gx, gy)) {
                        const safe = this._findNearestSafeTile(gx, gy);
                        gx = safe.gx;
                        gy = safe.gy;
                    }
                    if (this.tableSelector) {
                        this.tableSelector.deactivate();
                    }
                    this.launchBall(gx, gy);
                }
            }

        } else if (gameStateManager.is(GAME_STATES.TITLE)) {
            // Subtle camera sway on title
            const swayX = Math.sin(elapsed * 0.3) * 0.05;
            const swayZ = Math.cos(elapsed * 0.2) * 0.03;
            this.camera.position.set(
                swayX + this._camShakeOffset.x,
                GAME_CONFIG.camera.height + this._camShakeOffset.y,
                GAME_CONFIG.camera.zOffset + swayZ + this._camShakeOffset.z
            );
            this.camera.lookAt(0, 0, 0);
        }

        // UI updates (real time)
        this.gameHUD.update(delta);
        this.coinRewardSystem.update(this.camera, this.renderer);

        // Debug
        this.debugPanel.update({
            renderer: this.renderer,
            ballController: this.ballController,
            scoreSystem: this.scoreSystem,
            ballLifeSystem: this.ballLifeSystem,
            timer: this._gameTimer,
            tileManager: this.tileManager,
            obstacleManager: this.obstacleManager,
            findingSystem: this.findingSystem
        });
        shaderManager.updateAllTime(elapsed);

        // Render
        if (this.lightingSystem && this.lightingSystem.update) {
            this.lightingSystem.update(delta);
        }

        if (this.shadowSystem) {
            this.shadowSystem.update(this.renderer);
        }

        if (this.postProcessing) {
            this.postProcessing.update(delta);
        }

        if (this.transitionManager.isTransitioning()) {
            this.transitionManager.updateTargets(this.renderer);
            this.postProcessing.renderTransition(
                this.transitionManager.getTransitionScene(),
                this.transitionManager.getTransitionCamera()
            );
        } else {
            this.postProcessing.updateTime(timestamp);
            this.postProcessing.render();
        }

        // Label renderer (CSS2D - separate pass)
        this.labelSystem.update(this.scene, this.camera);

        performanceManager.end();
        this.performanceGraph.end();
    }

    resetGame() {
        this.currentStage = 1;
        this.scoreSystem.reset();
        this.ballLifeSystem.reset();
        this._gameTimer = GAME_CONFIG.timer.startingSeconds;
        this._gameOverTriggered = false;
        this._respawnCountdown = null;

        // Full clean reset of conquered tiles back to default silver
        this.tileManager.reset();

        // Full clean reset of crystals, labels, and particle trails
        this.findingSystem.reset();
        this.findingSystem.setupBoardCrystals(this.tileManager);

        // Full clean reset of laser hazard
        if (this.laserHazardSystem) {
            this.laserHazardSystem.reset();
        }

        // Full clean reset of bombs
        if (this.bombSystem) {
            this.bombSystem.reset();
        }

        // Full clean reset of dragon companion
        if (this.dragonSystem) {
            this.dragonSystem.reset();
        }

        // Full clean reset of enemies
        if (this.enemySystem) {
            this.enemySystem.reset();
        }

        // Full clean reset of centipede
        if (this.centipedeSystem) {
            this.centipedeSystem.reset();
        }

        this._currentTiltX = 0;
        this._currentTiltY = 0;
        this._currentCameraZone = 1;
        this.boardGroup.rotation.set(0, 0, 0);

        eventBus.emit('timer:changed', {
            time: this._gameTimer,
            formatted: '05:00'
        });
    }

    _onLaserHit(data) {
        if (!gameStateManager.is(GAME_STATES.PLAYING) && !gameStateManager.is(GAME_STATES.SLOW_MOTION_MENU)) return;

        // If in slow motion menu, close it and restore speed
        if (this.battleMenuSystem && this.battleMenuSystem._active) {
            this.battleMenuSystem.close();
        }
        timeManager.targetTimeScale = 1.0;
        this._targetBattleCameraProgress = 0.0;

        playSound(110, 0.45);
        
        // Exact 3D board coordinates of the ball at the moment of destruction
        const bx = (this.ballController && this.ballController.mesh) ? this.ballController.mesh.position.x : data.x;
        const by = (this.ballController && this.ballController.mesh) ? this.ballController.mesh.position.y : 0.015;
        const bz = (this.ballController && this.ballController.mesh) ? this.ballController.mesh.position.z : data.z;

        if (cellParticles) {
            // Trigger 3D shatter explosion right at ball's exact position (isPhysics = false)
            if (cellParticles.shatter) {
                cellParticles.shatter(bx, by, bz, 36);
            } else if (cellParticles.trigger) {
                cellParticles.trigger(bx, bz, false);
            }
        }

        // Disintegrate / fully deactivate ball and physics
        if (this.ballController) {
            this.ballController.deactivate();
        }

        // High-energy trauma shake & chromatic burst on ball loss
        this.triggerCameraShake(0.85);
        eventBus.emit('fx:chromaticAberration', { intensity: 0.048, duration: 0.50, flash: 0.60 });

        // Instantly start leveling the board
        this._currentTiltX = 0;
        this._currentTiltY = 0;

        const remainingLives = this.ballLifeSystem.loseLife();

        // Player loses ball: reset active bombs and dismiss dragon companion immediately
        if (this.bombSystem) {
            this.bombSystem.reset();
        }
        if (this.dragonSystem) {
            this.dragonSystem.reset();
        }

        if (remainingLives <= 0) {
            this.gameOver('laser');
        } else {
            // Player lost 1 life: after a brief destruction pause, allow player to pick a valid tile to respawn
            setTimeout(() => {
                if (gameStateManager.is(GAME_STATES.PLAYING) || gameStateManager.is(GAME_STATES.SELECTION) || gameStateManager.is(GAME_STATES.SLOW_MOTION_MENU)) {
                    this.respawnEntryPhase(true);
                }
            }, 450);
        }
    }

    respawnEntryPhase(isRespawn = false) {
        this.screenManager.hideAll();
        this.gameHUD.show();

        // Zero out tilt and level board completely so player can comfortably position ball
        this._currentTiltX = 0;
        this._currentTiltY = 0;
        this.boardGroup.rotation.set(0, 0, 0);

        // Ensure bombs and dragon companion are reset on respawn
        if (this.bombSystem) {
            this.bombSystem.reset();
        }
        if (this.dragonSystem) {
            this.dragonSystem.reset();
        }

        // Show stage briefing banner or respawn countdown
        if (isRespawn) {
            this._respawnCountdown = 9.0;
            this._respawnCountdownInt = 9;
            if (this.stageBriefing) {
                this.stageBriefing.showRespawnCountdown(9);
            }
        } else {
            this._respawnCountdown = null;
            if (this.stageBriefing) {
                this.stageBriefing.show(
                    this.currentStage,
                    this.tileManager ? this.tileManager.getTotalPlayableTiles() : null
                );
            }
        }

        // Fully deactivate ball until starting tile is confirmed
        if (this.ballController) {
            this.ballController.deactivate();
        }

        if (this.laserHazardSystem) {
            this.laserHazardSystem.clearHit();
        }

        gameStateManager.setState(GAME_STATES.SELECTION);
        this.tableSelector.activate();
    }

    startEntryPhase() {
        this.resetGame();
        this.respawnEntryPhase(false);
    }

    _findNearestSafeTile(startGX, startGY) {
        if (!this.tileManager) return { gx: startGX, gy: startGY };
        if (!this.tileManager.isObstacle(startGX, startGY)) return { gx: startGX, gy: startGY };

        // Spiral search for nearest non-obstacle tile
        for (let r = 1; r < Math.max(this.tileManager.tilesX, this.tileManager.tilesY); r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const gx = startGX + dx;
                    const gy = startGY + dy;
                    if (gx >= 0 && gx < this.tileManager.tilesX && gy >= 0 && gy < this.tileManager.tilesY) {
                        if (!this.tileManager.isObstacle(gx, gy)) {
                            return { gx, gy };
                        }
                    }
                }
            }
        }
        return { gx: GAME_CONFIG.spawn.defaultGridX || 9, gy: GAME_CONFIG.spawn.defaultGridY || 18 };
    }

    launchBall(gridX, gridY) {
        this._respawnCountdown = null;
        if (this.stageBriefing) {
            this.stageBriefing.hide();
        }

        // Initialize active camera zone immediately to chosen starting zone (0=Top, 1=Middle, 2=Bottom)
        this._currentCameraZone = (gridY < 12) ? 0 : (gridY < 24 ? 1 : 2);

        // Calibrate handheld gyro resting posture at launch moment & enforce orientation lock
        inputManager.calibrate();
        inputManager.requestFullscreenAndLock();

        if (this.ballController) {
            this.ballController.reset(gridX, gridY, this.tileManager);
            if (this.ballController.mesh) {
                this.ballController.mesh.visible = true;
            }
        }

        // Conquering chosen starting tile immediately
        const pos = this.collisionSystem.getPosition();
        this.tileManager.checkAndUpdate(pos.x, pos.y, 0.016);

        // Ensure laser hazard is ready to detect and shatter the new ball every single time
        if (this.laserHazardSystem) {
            this.laserHazardSystem.onBallRespawn();
        }

        // Spawn enemies for the stage ONLY if none exist yet (e.g. initial game/stage start).
        // If ball was lost, active enemies are NOT reset and continue their movement ("nie resetuj walcow").
        if (this.enemySystem) {
            if (this.enemySystem.getEnemyCount() === 0) {
                this.enemySystem.spawnStageEnemies(this.currentStage);
            }
        }

        gameStateManager.setState(GAME_STATES.PLAYING);
        playSound(1200, 0.3);
    }

    onStageCompleted(data = {}) {
        if (gameStateManager.is(GAME_STATES.STAGE_CLEAR) || gameStateManager.is(GAME_STATES.GAME_OVER)) return;

        // Fanfare & celebratory sounds
        playSound(1600, 0.35);
        setTimeout(() => playSound(1850, 0.4), 220);
        setTimeout(() => playSound(2100, 0.45), 440);

        // Deactivate ball & pause physics
        if (this.ballController) {
            this.ballController.deactivate();
        }

        const totalTiles = data.total || (this.tileManager ? this.tileManager.getTotalPlayableTiles() : 0);
        const tilesDiscovered = data.discovered || totalTiles;
        const stageCfg = getStageConfig(this.currentStage);
        const stageBonus = stageCfg.bonusPoints;
        const timeBonus = Math.floor(Math.max(0, this._gameTimer)) * STAGE_CONFIG.timeBonusPerSecond;

        // Award stage bonuses to score
        this.scoreSystem.addPoints(stageBonus + timeBonus, 'stage_clear');

        gameStateManager.setState(GAME_STATES.STAGE_CLEAR);

        this.screenManager.show('stageclear', {
            stage: this.currentStage,
            totalTiles,
            tilesDiscovered,
            stageBonus,
            timeBonus,
            totalScore: this.scoreSystem.getScore()
        });
    }

    nextStage() {
        this.screenManager.hideAll();

        // 1. Ensure shadow and lighting systems are updated before beauty capture of Target A
        if (this.shadowSystem) {
            this.shadowSystem.update(this.renderer);
        }

        // 2. Capture current finished board into RenderTargetA
        this.transitionManager.captureTargetA(() => {
            this.renderer.render(this.scene, this.camera);
        });

        // 3. Advance stage and generate fresh board with new seed in background
        this.currentStage++;
        const newSeed = (Date.now() % 100000) + this.currentStage * 137;
        this.rebuildBoard({ randomSeed: newSeed });

        if (this.laserHazardSystem) {
            this.laserHazardSystem.reset();
        }
        if (this.bombSystem) {
            this.bombSystem.reset();
        }
        if (this.dragonSystem) {
            this.dragonSystem.reset();
        }
        if (this.enemySystem) {
            this.enemySystem.reset();
        }
        if (this.centipedeSystem) {
            this.centipedeSystem.reset();
        }

        // Add 1 bonus life for clearing the stage
        this.ballLifeSystem.addLife(1);

        // Reset timer to full starting seconds
        this._gameTimer = GAME_CONFIG.timer.startingSeconds;
        this._gameOverTriggered = false;
        this._respawnCountdown = null;

        // 4. Update shadow system and capture fresh new board into RenderTargetB
        if (this.shadowSystem) {
            this.shadowSystem.update(this.renderer);
        }
        this.transitionManager.captureTargetB(() => {
            this.renderer.render(this.scene, this.camera);
        });

        // 5. Set transition state and animate dissolve via TransitionNode shader
        gameStateManager.setState(GAME_STATES.TRANSITION);

        this.transitionManager.transitionTo(GAME_STATES.SELECTION, {
            duration: GRAPHICS_CONFIG.transition?.duration || 2600,
            onRenderB: () => {
                this.renderer.render(this.scene, this.camera);
            },
            onComplete: () => {
                this.respawnEntryPhase();
            }
        });
    }

    debugCompleteStage() {
        const total = this.tileManager ? this.tileManager.getTotalPlayableTiles() : 600;
        this.onStageCompleted({ total, discovered: total });
    }

    startGame() {
        this.startEntryPhase();
    }

    pauseGame() {
        const state = gameStateManager.state;
        if (state === GAME_STATES.PLAYING || state === GAME_STATES.SELECTION || state === GAME_STATES.SLOW_MOTION_MENU) {
            if (this.battleMenuSystem && this.battleMenuSystem._active) {
                this.battleMenuSystem.close();
            }
            this._pausePrevState = state;
            gameStateManager.setState(GAME_STATES.PAUSED);
            this.screenManager.show('pause');
        }
    }

    resumeGame() {
        if (gameStateManager.is(GAME_STATES.PAUSED) || gameStateManager.is(GAME_STATES.EQUIPMENT)) {
            this.screenManager.hideAll();
            this.gameHUD.show();
            const target = this._pausePrevState || GAME_STATES.PLAYING;
            this._pausePrevState = null;
            gameStateManager.setState(target);
        }
    }

    gameOver(reason) {
        if (this._gameOverTriggered) return;
        this._gameOverTriggered = true;
        gameStateManager.setState(GAME_STATES.GAME_OVER);
        this.gameHUD.hide();
        this.screenManager.show('gameover', {
            reason,
            score: this.scoreSystem.getScore(),
            tilesDiscovered: this.tileManager.getDiscoveredCount(),
            coinsCollected: 0
        });
    }

    showEquipment() {
        this._equipmentPrevState = gameStateManager.state;
        gameStateManager.setState(GAME_STATES.EQUIPMENT);
        this.screenManager.show('equipment', {
            selectedBall: this.inventorySystem.getSelectedBall()
        });
    }

    showTitle() {
        this.screenManager.hideAll();
        this.gameHUD.hide();
        if (this.tableSelector) {
            this.tableSelector.deactivate();
        }
        gameStateManager.setState(GAME_STATES.TITLE);
        this.screenManager.show('title');
    }

    rebuildBoard(params = {}) {
        if (params && params.tilesX) GAME_CONFIG.grid.tilesX = params.tilesX;
        if (params && params.tilesY) GAME_CONFIG.grid.tilesY = params.tilesY;
        if (params && params.obstacleDensity !== undefined) GAME_CONFIG.obstacles.density = params.obstacleDensity;

        // Dispose old
        if (this.tileManager.group && this.boardGroup.children.includes(this.tileManager.group)) {
            this.boardGroup.remove(this.tileManager.group);
        }
        if (this.obstacleManager.obstacleGroup && this.boardGroup.children.includes(this.obstacleManager.obstacleGroup)) {
            this.boardGroup.remove(this.obstacleManager.obstacleGroup);
        }
        this.tileManager.dispose();
        this.obstacleManager.dispose();

        // Rebuild
        this.tileManager = new TileManager();
        this.tileManager.init(this.scene, new THREE.TextureLoader());
        this.boardGroup.add(this.tileManager.group);

        this.obstacleManager = new ObstacleManager();
        this.obstacleManager.init(this.tileManager);
        const seed = (params && params.randomSeed) ? params.randomSeed : (Date.now() % 100000);
        const obstacles = this.obstacleManager.generate(
            GAME_CONFIG.grid.tilesX,
            GAME_CONFIG.grid.tilesY,
            GAME_CONFIG.obstacles.density,
            GAME_CONFIG.spawn.defaultGridX,
            GAME_CONFIG.spawn.defaultGridY,
            GAME_CONFIG.obstacles.safeRadius,
            seed
        );
        this.tileManager.setObstacles(obstacles);
        if (this.laserHazardSystem) {
            this.laserHazardSystem.setupBoard(this.tileManager);
        }
        this.obstacleManager.createObstacleMeshes(this.scene, this.tileManager);
        if (this.obstacleManager.obstacleGroup) {
            this.boardGroup.add(this.obstacleManager.obstacleGroup);
        }

        const aabbs = this._buildObstacleAABBs(obstacles);
        this.collisionSystem.setObstacles(aabbs);

        // Update all gameplay systems with the new TileManager instance
        if (this.tableSelector) {
            this.tableSelector.setTileManager(this.tileManager);
        }
        if (this.bombSystem) {
            this.bombSystem.setTileManager(this.tileManager);
        }
        if (this.dragonSystem) {
            this.dragonSystem.setTileManager(this.tileManager);
        }
        if (this.enemySystem) {
            this.enemySystem.setTileManager(this.tileManager);
        }
        if (this.centipedeSystem) {
            this.centipedeSystem.setTileManager(this.tileManager, this.boardGroup);
        }

        // Reset ball
        const spawnX = (GAME_CONFIG.spawn.defaultGridX + 0.5) * (GAME_CONFIG.table.width / GAME_CONFIG.grid.tilesX);
        const spawnY = (GAME_CONFIG.spawn.defaultGridY + 0.5) * (GAME_CONFIG.table.height / GAME_CONFIG.grid.tilesY);
        this.collisionSystem.reset(spawnX, spawnY);

        eventBus.emit('grid:rebuilt', {
            tilesX: GAME_CONFIG.grid.tilesX,
            tilesY: GAME_CONFIG.grid.tilesY,
            tileManager: this.tileManager
        });

        if (this.findingSystem) {
            this.findingSystem.reset();
            this.findingSystem.setupBoardCrystals(this.tileManager);
        }
    }

    _onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.rendererManager.resize(w, h);
        this.postProcessing.resize(w, h, this.renderer.getPixelRatio());
        this.labelSystem.resize(w, h);
        if (this.transitionManager) {
            this.transitionManager.resize(w, h, Math.min(window.devicePixelRatio, GRAPHICS_CONFIG.pixelRatioCap));
        }
    }

    _onStateChanged(state, previousState) {
        if (state === GAME_STATES.PLAYING || state === GAME_STATES.SELECTION || state === GAME_STATES.SLOW_MOTION_MENU) {
            this.gameHUD.show();
            if (this.labelSystem) this.labelSystem.setVisible(true);
        } else {
            // In MODIFIER_SELECTION, PAUSED, EQUIPMENT, GAME_OVER, TITLE - hide 3D world labels completely
            if (this.labelSystem) this.labelSystem.setVisible(false);
        }
    }

    dispose() {
        cancelAnimationFrame(this._animationFrameId);
        window.removeEventListener('resize', this._resizeHandler);

        cellParticles.dispose();
        this.pickupAnimations.dispose();
        this.uiAnimations.dispose();
        this.transitionManager.dispose();
        this.performanceGraph.dispose();
        this.debugPanel.dispose();
        this.settingsPanel.dispose();
        this.labelSystem.dispose();
        this.screenManager.dispose();
        this.gameHUD.dispose();
        this.battleMenuSystem.dispose();
        this.modifierCardSystem.dispose();
        this.coinRewardSystem.dispose();
        this.scoreSystem.dispose();
        this.findingSystem.dispose();

        inputManager.dispose();
        this.ballLifeSystem.dispose();
        this.ballController.dispose();
        this.inventorySystem.dispose();
        if (this.bombSystem) this.bombSystem.dispose();
        if (this.dragonSystem) this.dragonSystem.dispose();
        if (this.enemySystem) this.enemySystem.dispose();
        if (this.centipedeSystem) this.centipedeSystem.dispose();
        this.obstacleManager.dispose();
        this.tileManager.dispose();

        this.postProcessing.dispose();
        this.shadowSystem.dispose();
        this.lightingSystem.dispose();
        this.rendererManager.dispose();
        if (this.stageBriefing) this.stageBriefing.dispose();
        eventBus.clear();
    }
}
