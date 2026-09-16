import { Pane } from 'tweakpane';
import { eventBus } from '../core/EventBus.js';
import { inputManager } from '../core/InputManager.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { GRAPHICS_CONFIG } from '../config/graphicsConfig.js';
import { LIGHTING_CONFIG } from '../config/lightingConfig.js';
import { qualityManager } from '../core/QualityManager.js';

export class SettingsPanel {
    constructor() {
        this._pane = null;
        this._visible = false;
        this._keyHandler = this._handleKeyDown.bind(this);
        this._params = {
            backgroundColor: '#1a1a2e',
            fogEnabled: GRAPHICS_CONFIG.fog?.enabled ?? true,
            fogColor: '#1a1a2e',
            fogNear: GRAPHICS_CONFIG.fog?.near || 1.5,
            fogFar: GRAPHICS_CONFIG.fog?.far || 4.0,
            environmentIntensity: 1.0,
            postProcessing: true,
            bloomEnabled: true,
            bloomStrength: 0.35,
            bloomRadius: 1.00,
            bloomThreshold: 0.80,
            saturation: GRAPHICS_CONFIG.saturation || 1.0,
            exposure: GRAPHICS_CONFIG.toneMappingExposure || 1.0,
            qualityLevel: qualityManager.level || 'high',
            lightingPreset: LIGHTING_CONFIG.defaultPreset || 'vivid',
            hemiIntensity: LIGHTING_CONFIG.presets?.vivid?.hemisphere?.intensity || 0.6,
            hemiSkyColor: '#ffffff',
            hemiGroundColor: '#444444',
            dirIntensity: LIGHTING_CONFIG.presets?.vivid?.directional?.intensity || 1.2,
            dirColor: '#ffffff',
            dirPosX: LIGHTING_CONFIG.presets?.vivid?.directional?.position?.x || 5,
            dirPosY: LIGHTING_CONFIG.presets?.vivid?.directional?.position?.y || 10,
            dirPosZ: LIGHTING_CONFIG.presets?.vivid?.directional?.position?.z || 5,
            tilesX: GAME_CONFIG.grid?.tilesX || 18,
            tilesY: GAME_CONFIG.grid?.tilesY || 36,
            obstacleDensity: GAME_CONFIG.obstacles?.density || 0.08,
            randomSeed: 12345,
            findingProbability: 0.35,
            modifierProbability: 0.05,
            ballType: GAME_CONFIG.ball?.defaultType || 'brass',
            ghostSilhouette: true,
            targetFps: GRAPHICS_CONFIG.fps?.target || 60,
            adaptiveQuality: GRAPHICS_CONFIG.adaptiveQuality?.enabled ?? true,
            maxPixelRatio: GRAPHICS_CONFIG.pixelRatioCap || 2,
            currentQualityTier: 'high',
            shadowsEnabled: true
        };
    }
    init() {
        window.addEventListener('keydown', this._keyHandler);
    }
    _handleKeyDown(e) {
        if (e.code === 'Digit1') {
            if (inputManager.isEditableTarget(document.activeElement)) return;
            this.toggle();
        }
    }
    _createPane() {
        this._pane = new Pane({ title: 'Settings' });

        const bloomFolder = this._pane.addFolder({ title: 'Bloom / Blask', expanded: true });
        bloomFolder.addBinding(this._params, 'bloomEnabled', { label: 'Bloom Active' });
        bloomFolder.addBinding(this._params, 'bloomStrength', { label: 'Intensity (Moc)', min: 0.0, max: 4.0, step: 0.05 });
        bloomFolder.addBinding(this._params, 'bloomRadius', { label: 'Size (Promień)', min: 0.0, max: 2.0, step: 0.05 });
        bloomFolder.addBinding(this._params, 'bloomThreshold', { label: 'Threshold (Próg)', min: 0.0, max: 1.0, step: 0.01 });
        
        const envFolder = this._pane.addFolder({ title: 'Environment', expanded: false });
        envFolder.addBinding(this._params, 'backgroundColor');
        envFolder.addBinding(this._params, 'fogEnabled');
        envFolder.addBinding(this._params, 'fogColor');
        envFolder.addBinding(this._params, 'fogNear', { min: 0, max: 50 });
        envFolder.addBinding(this._params, 'fogFar', { min: 10, max: 200 });
        envFolder.addBinding(this._params, 'environmentIntensity', { min: 0, max: 2 });
        envFolder.addBinding(this._params, 'postProcessing');
        envFolder.addBinding(this._params, 'saturation', { min: 0, max: 2 });
        envFolder.addBinding(this._params, 'exposure', { min: 0, max: 3 });
        envFolder.addBinding(this._params, 'qualityLevel', { options: { high: 'high', medium: 'medium', low: 'low' }});
        
        const lightFolder = this._pane.addFolder({ title: 'Lighting', expanded: false });
        lightFolder.addBinding(this._params, 'lightingPreset', { options: { vivid: 'vivid', sunset: 'sunset', neonDusk: 'neonDusk', moonlight: 'moonlight', arcade: 'arcade' }});
        lightFolder.addBinding(this._params, 'hemiIntensity', { min: 0, max: 3 });
        lightFolder.addBinding(this._params, 'hemiSkyColor');
        lightFolder.addBinding(this._params, 'hemiGroundColor');
        lightFolder.addBinding(this._params, 'dirIntensity', { min: 0, max: 3 });
        lightFolder.addBinding(this._params, 'dirColor');
        lightFolder.addBinding(this._params, 'dirPosX', { min: -20, max: 20 });
        lightFolder.addBinding(this._params, 'dirPosY', { min: 0, max: 20 });
        lightFolder.addBinding(this._params, 'dirPosZ', { min: -20, max: 20 });
        
        const worldFolder = this._pane.addFolder({ title: 'World', expanded: false });
        worldFolder.addBinding(this._params, 'tilesX', { min: 4, max: 50, step: 1 });
        worldFolder.addBinding(this._params, 'tilesY', { min: 4, max: 80, step: 1 });
        worldFolder.addBinding(this._params, 'obstacleDensity', { min: 0, max: 0.3, step: 0.01 });
        worldFolder.addBinding(this._params, 'randomSeed', { min: 0, max: 99999, step: 1 });
        worldFolder.addBinding(this._params, 'findingProbability', { min: 0, max: 1 });
        worldFolder.addBinding(this._params, 'modifierProbability', { min: 0, max: 0.3 });
        const rebuildBtn = worldFolder.addButton({ title: 'Rebuild Board' });
        rebuildBtn.on('click', () => eventBus.emit('request:gridRebuild', this._params));

        const spawnGreenBtn = worldFolder.addButton({ title: 'Spawn Green Crystal (💚)' });
        spawnGreenBtn.on('click', () => eventBus.emit('request:spawnGreenCrystal'));

        const spawnCardBtn = worldFolder.addButton({ title: 'Spawn Card Crystal (🃏)' });
        spawnCardBtn.on('click', () => eventBus.emit('request:spawnCardCrystal'));

        const triggerLaserBtn = worldFolder.addButton({ title: 'Trigger Laser Hazard (⚡)' });
        triggerLaserBtn.on('click', () => eventBus.emit('request:triggerLaser'));

        const completeStageBtn = worldFolder.addButton({ title: 'Complete Stage (🏆)' });
        completeStageBtn.on('click', () => eventBus.emit('request:completeStage'));

        const grantBombsBtn = worldFolder.addButton({ title: 'Grant 3× Bombs (💣)' });
        grantBombsBtn.on('click', () => eventBus.emit('card:grantBombs', { count: 3 }));

        const summonDragonBtn = worldFolder.addButton({ title: 'Summon Dragon (🐉)' });
        summonDragonBtn.on('click', () => eventBus.emit('card:summonDragon', { duration: 6 }));
        
        const ballFolder = this._pane.addFolder({ title: 'Ball', expanded: false });
        ballFolder.addBinding(this._params, 'ballType', { options: { brass: 'brass', marble: 'marble', wood: 'wood' }});
        ballFolder.addBinding(this._params, 'ghostSilhouette');
        
        const devFolder = this._pane.addFolder({ title: 'Developer Graphics', expanded: false });
        devFolder.addBinding(this._params, 'targetFps', { readonly: true });
        devFolder.addBinding(this._params, 'adaptiveQuality');
        devFolder.addBinding(this._params, 'maxPixelRatio', { min: 1, max: 3, step: 0.1 });
        devFolder.addBinding(this._params, 'currentQualityTier', { readonly: true });
        devFolder.addBinding(this._params, 'shadowsEnabled');
        
        this._bindEvents();
        this._pane.element.style.display = this._visible ? '' : 'none';
        this._pane.element.style.zIndex = '9999';
    }
    _bindEvents() {
        this._pane.on('change', (ev) => {
            const key = ev.target?.key || ev.presetKey || '';
            eventBus.emit('settings:changed', { key, value: ev.value });
        });
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
    dispose() {
        window.removeEventListener('keydown', this._keyHandler);
        if (this._pane) {
            this._pane.dispose();
            this._pane = null;
        }
    }
}
