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
            backgroundColor: '#2b0015',
            fogEnabled: GRAPHICS_CONFIG.fog?.enabled ?? false,
            fogColor: '#2b0015',
            fogNear: GRAPHICS_CONFIG.fog?.near || 1.5,
            fogFar: GRAPHICS_CONFIG.fog?.far || 4.0,
            environmentIntensity: LIGHTING_CONFIG.presets?.sunset?.environment?.intensity || 1.2,
            postProcessing: true,
            bloomEnabled: true,
            bloomStrength: 0.62,
            bloomRadius: 1.05,
            bloomThreshold: 0.60,
            saturation: GRAPHICS_CONFIG.saturation !== undefined ? GRAPHICS_CONFIG.saturation : 1.0,
            exposure: GRAPHICS_CONFIG.toneMappingExposure !== undefined ? GRAPHICS_CONFIG.toneMappingExposure : 0.62,
            qualityLevel: qualityManager.level || 'low',
            lightingPreset: LIGHTING_CONFIG.defaultPreset || 'sunset',
            hemiIntensity: LIGHTING_CONFIG.presets?.sunset?.hemisphere?.intensity || 0.7,
            hemiSkyColor: '#ff8c00',
            hemiGroundColor: '#4b0082',
            dirIntensity: LIGHTING_CONFIG.presets?.sunset?.directional?.intensity || 1.6,
            dirColor: '#ff6347',
            dirPosX: LIGHTING_CONFIG.presets?.sunset?.directional?.position?.x || -1.5,
            dirPosY: LIGHTING_CONFIG.presets?.sunset?.directional?.position?.y || 3.0,
            dirPosZ: LIGHTING_CONFIG.presets?.sunset?.directional?.position?.z || 2.0,
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
            currentQualityTier: 'low',
            shadowsEnabled: false,
            pointLightsEnabled: true,
            pointLightsAutoCycle: true,
            pointLightsIntensity: 2.0,
            pointLightsPulsing: true,
            pointLightsSpeed: 3.0,
            pinkLightColor: '#ff44aa',
            pinkLightDistance: 30,
            blueLightColor: '#3377ff',
            blueLightDistance: 50,
            ballSpeedMultiplier: 0.15
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

        const closeBtn = this._pane.addButton({ title: '✕ Zamknij / Close Settings' });
        closeBtn.on('click', () => this.hide());

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
        
        const pointLightsFolder = this._pane.addFolder({ title: 'Point Lights / Światła Punktowe', expanded: false });
        pointLightsFolder.addBinding(this._params, 'pointLightsEnabled', { label: 'Aktywne' });
        pointLightsFolder.addBinding(this._params, 'pointLightsAutoCycle', { label: 'Cykl 2-4 (30s)' });
        pointLightsFolder.addBinding(this._params, 'pointLightsIntensity', { label: 'Moc bazowa', min: 0.0, max: 6.0, step: 0.1 });
        pointLightsFolder.addBinding(this._params, 'pointLightsPulsing', { label: 'Pulsacja' });
        pointLightsFolder.addBinding(this._params, 'pointLightsSpeed', { label: 'Szybkość pulsu', min: 0.5, max: 8.0, step: 0.2 });
        pointLightsFolder.addBinding(this._params, 'pinkLightColor', { label: 'Kolor Róż' });
        pointLightsFolder.addBinding(this._params, 'pinkLightDistance', { label: 'Zasięg Róż', min: 5, max: 80, step: 1 });
        pointLightsFolder.addBinding(this._params, 'blueLightColor', { label: 'Kolor Niebieski' });
        pointLightsFolder.addBinding(this._params, 'blueLightDistance', { label: 'Zasięg Niebieski', min: 5, max: 100, step: 1 });
        const randLightsBtn = pointLightsFolder.addButton({ title: 'Losuj Pozycje Świateł' });
        randLightsBtn.on('click', () => eventBus.emit('request:randomizeLights'));
        
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

        const spawnCentipedeBtn = worldFolder.addButton({ title: 'Spawn Centipede (🐛)' });
        spawnCentipedeBtn.on('click', () => eventBus.emit('request:spawnCentipede'));
        
        const ballFolder = this._pane.addFolder({ title: 'Ball / Bila', expanded: true });
        ballFolder.addBinding(this._params, 'ballType', { options: { brass: 'brass', marble: 'marble', wood: 'wood' }});
        ballFolder.addBinding(this._params, 'ghostSilhouette');
        ballFolder.addBinding(this._params, 'ballSpeedMultiplier', {
            label: 'Ball Speed / Prędkość Bili',
            min: 0.10,
            max: 1.50,
            step: 0.05
        });
        
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
