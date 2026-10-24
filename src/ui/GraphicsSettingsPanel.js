import { graphicsSettingsController } from '../core/GraphicsSettingsController.js';
import { eventBus } from '../core/EventBus.js';
import { QUALITY_LEVELS } from '../core/QualityManager.js';

export class GraphicsSettingsPanel {
    constructor() {
        this._el = null;
        this._visible = false;
        this._unsub = null;
    }

    init(container = null) {
        this._el = document.createElement('div');
        this._el.className = 'graphics-settings-modal screen-overlay hidden';
        this._el.id = 'graphics-settings-modal';
        this._el.style.position = 'fixed';
        this._el.style.inset = '0';
        this._el.style.width = '100vw';
        this._el.style.height = '100vh';
        this._el.style.display = 'none';
        this._el.style.alignItems = 'center';
        this._el.style.justifyContent = 'center';
        this._el.style.zIndex = '6000';
        this._el.style.pointerEvents = 'auto';

        this._renderHTML();

        const parent = container || document.getElementById('panels') || document.body;
        parent.appendChild(this._el);

        this._bindUIEvents();

        this._unsub = eventBus.on('graphics:settingsChanged', () => {
            this._updateUIFromState();
        });
    }

    _renderHTML() {
        this._el.innerHTML = `
            <div class="screen-backdrop" style="position:absolute; inset:0; background:rgba(6,10,24,0.85); backdrop-filter:blur(8px);"></div>
            <div class="screen-content" style="position:relative; z-index:1; text-align:center; color:white; background:rgba(20,24,40,0.96); padding:28px 24px; border-radius:18px; border:1.5px solid rgba(0,229,255,0.35); max-width:440px; width:92%; box-shadow:0 12px 40px rgba(0,0,0,0.75); max-height:92vh; overflow-y:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; border-bottom:1px solid rgba(255,255,255,0.12); padding-bottom:12px;">
                    <h2 style="font-size:22px; margin:0; letter-spacing:1.5px; font-weight:800; color:#00e5ff; text-transform:uppercase;">Graphics Settings</h2>
                    <button id="gfx-close-x-btn" type="button" style="background:transparent; border:none; color:#aaa; font-size:22px; cursor:pointer; padding:4px 8px; line-height:1;" aria-label="Close">✕</button>
                </div>

                <!-- PRESETS ROW -->
                <div style="margin-bottom:20px; text-align:left;">
                    <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:#94a3b8; margin-bottom:8px; letter-spacing:1px;">Graphics Presets</div>
                    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
                        <button type="button" id="gfx-preset-mobile" class="gfx-preset-btn" style="padding:10px 4px; font-size:12px; font-weight:700; border-radius:8px; cursor:pointer; background:rgba(255,255,255,0.08); border:1.5px solid rgba(255,255,255,0.15); color:#fff; transition:all 0.2s;">MOBILE</button>
                        <button type="button" id="gfx-preset-low" class="gfx-preset-btn" style="padding:10px 4px; font-size:12px; font-weight:700; border-radius:8px; cursor:pointer; background:rgba(255,255,255,0.08); border:1.5px solid rgba(255,255,255,0.15); color:#fff; transition:all 0.2s;">LOW</button>
                        <button type="button" id="gfx-preset-medium" class="gfx-preset-btn" style="padding:10px 4px; font-size:12px; font-weight:700; border-radius:8px; cursor:pointer; background:rgba(255,255,255,0.08); border:1.5px solid rgba(255,255,255,0.15); color:#fff; transition:all 0.2s;">MEDIUM</button>
                        <button type="button" id="gfx-preset-high" class="gfx-preset-btn" style="padding:10px 4px; font-size:12px; font-weight:700; border-radius:8px; cursor:pointer; background:rgba(255,255,255,0.08); border:1.5px solid rgba(255,255,255,0.15); color:#fff; transition:all 0.2s;">HIGH</button>
                    </div>
                </div>

                <!-- 1. GRAPHICS QUALITY -->
                <div class="gfx-setting-row" style="margin-bottom:14px; background:rgba(255,255,255,0.04); padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); text-align:left;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:13px; font-weight:700; color:#fff;">GRAPHICS QUALITY</span>
                        <span id="gfx-quality-tag" style="font-size:11px; font-weight:800; color:#00ffcc; text-transform:uppercase;">MEDIUM</span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
                        <button type="button" id="gfx-quality-mobile" class="gfx-opt-btn" style="padding:8px 2px; font-size:11px; font-weight:700; border-radius:6px; cursor:pointer; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#ddd;">MOBILE</button>
                        <button type="button" id="gfx-quality-low" class="gfx-opt-btn" style="padding:8px 2px; font-size:11px; font-weight:700; border-radius:6px; cursor:pointer; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#ddd;">LOW</button>
                        <button type="button" id="gfx-quality-medium" class="gfx-opt-btn" style="padding:8px 2px; font-size:11px; font-weight:700; border-radius:6px; cursor:pointer; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#ddd;">MEDIUM</button>
                        <button type="button" id="gfx-quality-high" class="gfx-opt-btn" style="padding:8px 2px; font-size:11px; font-weight:700; border-radius:6px; cursor:pointer; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#ddd;">HIGH</button>
                    </div>
                </div>

                <!-- 2. POST PROCESSING -->
                <div class="gfx-setting-row" style="margin-bottom:12px; background:rgba(255,255,255,0.04); padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center; text-align:left;">
                    <div>
                        <div style="font-size:13px; font-weight:700; color:#fff;">POST PROCESSING</div>
                        <div style="font-size:11px; color:#888;">Master EffectComposer switch</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" id="gfx-pp-on" class="gfx-toggle-btn" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer;">ON</button>
                        <button type="button" id="gfx-pp-off" class="gfx-toggle-btn" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer;">OFF</button>
                    </div>
                </div>

                <!-- 3. BLOOM -->
                <div class="gfx-setting-row" style="margin-bottom:12px; background:rgba(255,255,255,0.04); padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center; text-align:left;">
                    <div>
                        <div style="font-size:13px; font-weight:700; color:#fff;">BLOOM</div>
                        <div id="gfx-bloom-sub" style="font-size:11px; color:#888;">Neon glow & blask</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" id="gfx-bloom-on" class="gfx-toggle-btn" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer;">ON</button>
                        <button type="button" id="gfx-bloom-off" class="gfx-toggle-btn" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer;">OFF</button>
                    </div>
                </div>

                <!-- 4. GRAIN -->
                <div class="gfx-setting-row" style="margin-bottom:12px; background:rgba(255,255,255,0.04); padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center; text-align:left;">
                    <div>
                        <div style="font-size:13px; font-weight:700; color:#fff;">GRAIN</div>
                        <div id="gfx-grain-sub" style="font-size:11px; color:#888;">Film grain noise effect</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" id="gfx-grain-on" class="gfx-toggle-btn" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer;">ON</button>
                        <button type="button" id="gfx-grain-off" class="gfx-toggle-btn" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer;">OFF</button>
                    </div>
                </div>

                <!-- 5. OTHER GRAPHICS EFFECTS -->
                <div class="gfx-setting-row" style="margin-bottom:18px; background:rgba(255,255,255,0.04); padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center; text-align:left;">
                    <div>
                        <div style="font-size:13px; font-weight:700; color:#fff;">OTHER GRAPHICS EFFECTS</div>
                        <div style="font-size:11px; color:#888;">Particles, Vignette, Shake, Accent lights</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" id="gfx-other-on" class="gfx-toggle-btn" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer;">ON</button>
                        <button type="button" id="gfx-other-off" class="gfx-toggle-btn" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer;">OFF</button>
                    </div>
                </div>

                <!-- CLOSE BUTTON -->
                <button type="button" id="gfx-close-btn" class="screen-btn" style="width:100%; max-width:240px; margin:0 auto; padding:12px; font-size:15px; font-weight:700; background:linear-gradient(135deg,#00b4d8,#0077b6); border:none; border-radius:10px; cursor:pointer; color:#fff;">Close / Zamknij</button>
            </div>
        `;
    }

    _bindUIEvents() {
        const bindClick = (id, fn) => {
            const btn = this._el.querySelector(id);
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    fn();
                });
            }
        };

        // Presets
        bindClick('#gfx-preset-mobile', () => graphicsSettingsController.applyPreset('mobile'));
        bindClick('#gfx-preset-low', () => graphicsSettingsController.applyPreset('low'));
        bindClick('#gfx-preset-medium', () => graphicsSettingsController.applyPreset('medium'));
        bindClick('#gfx-preset-high', () => graphicsSettingsController.applyPreset('high'));

        // Quality
        bindClick('#gfx-quality-mobile', () => graphicsSettingsController.setQuality('mobile'));
        bindClick('#gfx-quality-low', () => graphicsSettingsController.setQuality('low'));
        bindClick('#gfx-quality-medium', () => graphicsSettingsController.setQuality('medium'));
        bindClick('#gfx-quality-high', () => graphicsSettingsController.setQuality('high'));

        // Post-processing
        bindClick('#gfx-pp-on', () => graphicsSettingsController.setPostProcessing(true));
        bindClick('#gfx-pp-off', () => graphicsSettingsController.setPostProcessing(false));

        // Bloom
        bindClick('#gfx-bloom-on', () => graphicsSettingsController.setBloom(true));
        bindClick('#gfx-bloom-off', () => graphicsSettingsController.setBloom(false));

        // Grain
        bindClick('#gfx-grain-on', () => graphicsSettingsController.setGrain(true));
        bindClick('#gfx-grain-off', () => graphicsSettingsController.setGrain(false));

        // Other effects
        bindClick('#gfx-other-on', () => graphicsSettingsController.setOtherEffects(true));
        bindClick('#gfx-other-off', () => graphicsSettingsController.setOtherEffects(false));

        // Close
        bindClick('#gfx-close-btn', () => this.hide());
        bindClick('#gfx-close-x-btn', () => this.hide());
    }

    _updateUIFromState() {
        const s = graphicsSettingsController.settings;
        const ppActive = graphicsSettingsController.isPostProcessingActive();

        // Preset buttons styling
        const isPresetMobile = (s.quality === 'mobile' && s.postProcessing && s.bloom && s.grain && s.otherEffects);
        const isPresetLow = (s.quality === 'low' && !s.postProcessing && !s.bloom && !s.grain && !s.otherEffects);
        const isPresetMed = (s.quality === 'medium' && s.postProcessing && s.bloom && !s.grain && s.otherEffects);
        const isPresetHigh = (s.quality === 'high' && s.postProcessing && s.bloom && s.grain && s.otherEffects);

        this._stylePresetBtn('#gfx-preset-mobile', isPresetMobile);
        this._stylePresetBtn('#gfx-preset-low', isPresetLow);
        this._stylePresetBtn('#gfx-preset-medium', isPresetMed);
        this._stylePresetBtn('#gfx-preset-high', isPresetHigh);

        // Quality buttons
        this._styleOptionBtn('#gfx-quality-mobile', s.quality === 'mobile');
        this._styleOptionBtn('#gfx-quality-low', s.quality === 'low');
        this._styleOptionBtn('#gfx-quality-medium', s.quality === 'medium');
        this._styleOptionBtn('#gfx-quality-high', s.quality === 'high');

        const qualityTag = this._el.querySelector('#gfx-quality-tag');
        if (qualityTag) qualityTag.textContent = s.quality.toUpperCase();

        // Post-processing buttons
        this._styleToggleBtn('#gfx-pp-on', '#gfx-pp-off', s.postProcessing);

        // Bloom buttons & indicator
        this._styleToggleBtn('#gfx-bloom-on', '#gfx-bloom-off', s.bloom);
        const bloomSub = this._el.querySelector('#gfx-bloom-sub');
        if (bloomSub) {
            if (!ppActive && s.bloom) {
                bloomSub.textContent = 'Preference ON (Inactive: Post-Processing OFF)';
                bloomSub.style.color = '#ffaa44';
            } else {
                bloomSub.textContent = 'Neon glow & blask';
                bloomSub.style.color = '#888';
            }
        }

        // Grain buttons & indicator
        this._styleToggleBtn('#gfx-grain-on', '#gfx-grain-off', s.grain);
        const grainSub = this._el.querySelector('#gfx-grain-sub');
        if (grainSub) {
            if (!ppActive && s.grain) {
                grainSub.textContent = 'Preference ON (Inactive: Post-Processing OFF)';
                grainSub.style.color = '#ffaa44';
            } else {
                grainSub.textContent = 'Film grain noise effect';
                grainSub.style.color = '#888';
            }
        }

        // Other effects
        this._styleToggleBtn('#gfx-other-on', '#gfx-other-off', s.otherEffects);
    }

    _stylePresetBtn(selector, isActive) {
        const btn = this._el.querySelector(selector);
        if (!btn) return;
        if (isActive) {
            btn.style.background = 'linear-gradient(135deg, #00b4d8, #0077b6)';
            btn.style.borderColor = '#00f0ff';
            btn.style.boxShadow = '0 0 12px rgba(0, 229, 255, 0.4)';
            btn.style.color = '#fff';
        } else {
            btn.style.background = 'rgba(255,255,255,0.08)';
            btn.style.borderColor = 'rgba(255,255,255,0.15)';
            btn.style.boxShadow = 'none';
            btn.style.color = '#bbb';
        }
    }

    _styleOptionBtn(selector, isSelected) {
        const btn = this._el.querySelector(selector);
        if (!btn) return;
        if (isSelected) {
            btn.style.background = '#0077b6';
            btn.style.borderColor = '#00ffcc';
            btn.style.color = '#fff';
            btn.style.boxShadow = '0 0 8px rgba(0,255,204,0.3)';
        } else {
            btn.style.background = 'rgba(255,255,255,0.06)';
            btn.style.borderColor = 'rgba(255,255,255,0.12)';
            btn.style.color = '#aaa';
            btn.style.boxShadow = 'none';
        }
    }

    _styleToggleBtn(onSelector, offSelector, isOn) {
        const onBtn = this._el.querySelector(onSelector);
        const offBtn = this._el.querySelector(offSelector);
        if (!onBtn || !offBtn) return;

        if (isOn) {
            onBtn.style.background = '#00b4d8';
            onBtn.style.borderColor = '#00f0ff';
            onBtn.style.color = '#fff';
            onBtn.style.boxShadow = '0 0 8px rgba(0,229,255,0.3)';

            offBtn.style.background = 'rgba(255,255,255,0.06)';
            offBtn.style.borderColor = 'rgba(255,255,255,0.12)';
            offBtn.style.color = '#777';
            offBtn.style.boxShadow = 'none';
        } else {
            offBtn.style.background = '#e63946';
            offBtn.style.borderColor = '#ff4d6d';
            offBtn.style.color = '#fff';
            offBtn.style.boxShadow = '0 0 8px rgba(230,57,70,0.3)';

            onBtn.style.background = 'rgba(255,255,255,0.06)';
            onBtn.style.borderColor = 'rgba(255,255,255,0.12)';
            onBtn.style.color = '#777';
            onBtn.style.boxShadow = 'none';
        }
    }

    show() {
        if (!this._el) return;
        this._updateUIFromState();
        this._el.classList.remove('hidden');
        this._el.style.display = 'flex';
        this._visible = true;
    }

    hide() {
        if (!this._el) return;
        this._el.classList.add('hidden');
        this._el.style.display = 'none';
        this._visible = false;
    }

    toggle() {
        if (this._visible) this.hide();
        else this.show();
    }

    dispose() {
        if (this._unsub) {
            this._unsub();
            this._unsub = null;
        }
        if (this._el && this._el.parentNode) {
            this._el.parentNode.removeChild(this._el);
        }
        this._el = null;
    }
}

export const graphicsSettingsPanel = new GraphicsSettingsPanel();
