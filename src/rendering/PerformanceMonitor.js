import * as THREE from 'three';

/**
 * PerformanceMonitor
 * 
 * Lightweight real-time diagnostics overlay and telemetry monitor.
 * Displays:
 *  - FPS (Instant, 1s Avg, 1% Low Min)
 *  - Draw Calls (renderer.info.render.calls)
 *  - Geometry Count (renderer.info.memory.geometries)
 *  - Triangle Count (renderer.info.render.triangles)
 *  - Estimated GPU Memory (Geometries typed arrays + Textures)
 *  - Visible vs Hidden Object Count (Scene traversal)
 *  - JS Heap Memory (if available)
 */
export class PerformanceMonitor {
    constructor() {
        this._container = null;
        this._visible = false;
        this._lastUpdateTime = 0;
        this._updateInterval = 0.15; // 6.6 Hz updates (lightweight)

        // FPS tracking
        this._frameCount = 0;
        this._fpsHistory = [];
        this._fpsHistoryDuration = 1.0; // 1 second window
        this._fpsTimer = 0;
        this._currentFps = 60;
        this._avgFps = 60;
        this._minFps = 60;

        // Metrics snapshots
        this._metrics = {
            fps: 60,
            avgFps: 60,
            minFps: 60,
            drawCalls: 0,
            geometries: 0,
            triangles: 0,
            gpuMemoryMB: 0,
            visibleObjects: 0,
            hiddenObjects: 0,
            heapMB: 0
        };

        // DOM elements cache
        this._dom = {
            fps: null,
            drawCalls: null,
            triangles: null,
            geometries: null,
            gpuMemory: null,
            objects: null,
            heap: null
        };

        this._onKeyDown = this._onKeyDown.bind(this);
    }

    /**
     * Initializes the DOM elements and event listeners.
     */
    init() {
        if (typeof document === 'undefined') return;

        this._container = document.createElement('div');
        this._container.id = 'performance-monitor-panel';
        this._container.setAttribute('aria-label', 'Performance Diagnostics');
        this._container.style.cssText = `
            position: fixed;
            top: max(10px, env(safe-area-inset-top, 0px));
            right: max(10px, env(safe-area-inset-right, 0px));
            z-index: 10000;
            background: rgba(12, 14, 28, 0.88);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(0, 223, 242, 0.35);
            border-radius: 8px;
            padding: 8px 12px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 11px;
            line-height: 1.45;
            color: #e2e8f0;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
            pointer-events: none;
            display: none;
            min-width: 175px;
            user-select: none;
        `;

        this._container.innerHTML = `
            <div style="font-weight: 700; color: #00dff2; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px; display: flex; justify-content: space-between;">
                <span>PERF TELEMETRY</span>
                <span style="font-size: 9px; color: #94a3b8;">[3] Toggle</span>
            </div>
            <div>FPS: <span id="pm-fps" style="font-weight:700; color:#38ef7d;">60</span> <span style="font-size:9px; color:#94a3b8;">(avg <span id="pm-avg-fps">60</span>, min <span id="pm-min-fps">60</span>)</span></div>
            <div>Draw Calls: <span id="pm-draw-calls" style="font-weight:700; color:#ffd166;">0</span></div>
            <div>Triangles: <span id="pm-triangles" style="color:#00f0ff;">0</span></div>
            <div>Geometries: <span id="pm-geoms" style="color:#a78bfa;">0</span></div>
            <div>GPU Mem Est: <span id="pm-gpu-mem" style="color:#f472b6;">0.0 MB</span></div>
            <div>Objects (V/H): <span id="pm-objects" style="color:#cbd5e1;">0 / 0</span></div>
            <div id="pm-heap-row">JS Heap: <span id="pm-heap" style="color:#38bdf8;">-- MB</span></div>
        `;

        document.body.appendChild(this._container);

        this._dom.fps = this._container.querySelector('#pm-fps');
        this._dom.avgFps = this._container.querySelector('#pm-avg-fps');
        this._dom.minFps = this._container.querySelector('#pm-min-fps');
        this._dom.drawCalls = this._container.querySelector('#pm-draw-calls');
        this._dom.triangles = this._container.querySelector('#pm-triangles');
        this._dom.geometries = this._container.querySelector('#pm-geoms');
        this._dom.gpuMemory = this._container.querySelector('#pm-gpu-mem');
        this._dom.objects = this._container.querySelector('#pm-objects');
        this._dom.heap = this._container.querySelector('#pm-heap');

        window.addEventListener('keydown', this._onKeyDown);
    }

    _onKeyDown(e) {
        // Toggle with Digit 3 when not typing in form inputs
        if (e.code === 'Digit3' && !e.ctrlKey && !e.altKey && !e.metaKey) {
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
                return;
            }
            this.toggle();
        }
    }

    show() {
        if (this._container) {
            this._container.style.display = 'block';
            this._visible = true;
        }
    }

    hide() {
        if (this._container) {
            this._container.style.display = 'none';
            this._visible = false;
        }
    }

    toggle() {
        if (this._visible) this.hide();
        else this.show();
    }

    isVisible() {
        return this._visible;
    }

    /**
     * Estimates GPU memory usage from scene geometries and textures.
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene} scene
     * @returns {number} Memory in Megabytes (MB)
     */
    _estimateGPUMemoryMB(renderer, scene) {
        let totalBytes = 0;
        const countedGeometries = new Set();

        if (scene) {
            scene.traverse(obj => {
                if (obj.isMesh && obj.geometry && !countedGeometries.has(obj.geometry)) {
                    countedGeometries.add(obj.geometry);
                    const attrs = obj.geometry.attributes;
                    for (const name in attrs) {
                        const attr = attrs[name];
                        if (attr && attr.array) {
                            totalBytes += attr.array.byteLength || 0;
                        }
                    }
                    if (obj.geometry.index && obj.geometry.index.array) {
                        totalBytes += obj.geometry.index.array.byteLength || 0;
                    }
                }
            });
        }

        // Add texture memory estimation if available in renderer.info.memory
        if (renderer && renderer.info && renderer.info.memory) {
            const textureCount = renderer.info.memory.textures || 0;
            // Rough average estimate: 512x512 RGBA = 1MB, or 1024x1024 RGBA = 4MB
            totalBytes += textureCount * 1.5 * 1024 * 1024;
        }

        return totalBytes / (1024 * 1024);
    }

    /**
     * Traverses the scene to count visible vs hidden mesh objects.
     * @param {THREE.Scene} scene
     * @returns {{ visible: number, hidden: number }}
     */
    _countSceneObjects(scene) {
        let visible = 0;
        let hidden = 0;

        if (scene) {
            scene.traverse(obj => {
                if (obj.isMesh) {
                    if (obj.visible) visible++;
                    else hidden++;
                }
            });
        }

        return { visible, hidden };
    }

    /**
     * Updates performance metrics. Call every frame in the main render loop.
     * 
     * @param {number} delta - Frame delta in seconds
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene} scene
     */
    update(delta, renderer, scene) {
        if (!delta || delta <= 0) return;

        // Record instantaneous FPS
        const instantFps = Math.min(240, 1.0 / Math.max(delta, 0.0001));
        this._currentFps = instantFps;

        this._fpsHistory.push(instantFps);
        this._fpsTimer += delta;

        if (this._fpsTimer >= this._fpsHistoryDuration) {
            let sum = 0;
            let min = Infinity;
            for (let i = 0; i < this._fpsHistory.length; i++) {
                const f = this._fpsHistory[i];
                sum += f;
                if (f < min) min = f;
            }
            this._avgFps = this._fpsHistory.length > 0 ? sum / this._fpsHistory.length : 60;
            this._minFps = min === Infinity ? 60 : min;

            this._fpsHistory = [];
            this._fpsTimer = 0;
        }

        this._lastUpdateTime += delta;
        if (this._lastUpdateTime < this._updateInterval) {
            return;
        }
        this._lastUpdateTime = 0;

        // Update telemetry data
        const rInfo = renderer ? renderer.info : null;
        const calls = (rInfo && rInfo.render && rInfo.render.calls) || 0;
        const tris = (rInfo && rInfo.render && rInfo.render.triangles) || 0;
        const geoms = (rInfo && rInfo.memory && rInfo.memory.geometries) || 0;
        const gpuMemMB = this._estimateGPUMemoryMB(renderer, scene);
        const { visible, hidden } = this._countSceneObjects(scene);

        let heapMB = 0;
        if (typeof performance !== 'undefined' && performance.memory && performance.memory.usedJSHeapSize) {
            heapMB = performance.memory.usedJSHeapSize / (1024 * 1024);
        }

        this._metrics.fps = Math.round(this._currentFps);
        this._metrics.avgFps = Math.round(this._avgFps);
        this._metrics.minFps = Math.round(this._minFps);
        this._metrics.drawCalls = calls;
        this._metrics.triangles = tris;
        this._metrics.geometries = geoms;
        this._metrics.gpuMemoryMB = Math.round(gpuMemMB * 10) / 10;
        this._metrics.visibleObjects = visible;
        this._metrics.hiddenObjects = hidden;
        this._metrics.heapMB = Math.round(heapMB * 10) / 10;

        // Update DOM display if visible
        if (this._visible && this._dom.fps) {
            this._dom.fps.textContent = this._metrics.fps;
            this._dom.fps.style.color = this._metrics.fps >= 55 ? '#38ef7d' : (this._metrics.fps >= 30 ? '#ffd166' : '#ff4d4d');
            this._dom.avgFps.textContent = this._metrics.avgFps;
            this._dom.minFps.textContent = this._metrics.minFps;

            this._dom.drawCalls.textContent = this._metrics.drawCalls;
            this._dom.drawCalls.style.color = this._metrics.drawCalls < 20 ? '#38ef7d' : (this._metrics.drawCalls < 40 ? '#ffd166' : '#ff4d4d');

            this._dom.triangles.textContent = this._metrics.triangles.toLocaleString();
            this._dom.geometries.textContent = this._metrics.geometries;
            this._dom.gpuMemory.textContent = `${this._metrics.gpuMemoryMB.toFixed(1)} MB`;
            this._dom.objects.textContent = `${this._metrics.visible} / ${this._metrics.hidden}`;

            if (heapMB > 0) {
                this._dom.heap.textContent = `${this._metrics.heapMB.toFixed(1)} MB`;
            } else {
                const row = this._container.querySelector('#pm-heap-row');
                if (row) row.style.display = 'none';
            }
        }
    }

    /**
     * Public getter for snapshot telemetry data.
     * @returns {Object}
     */
    getMetrics() {
        return { ...this._metrics };
    }

    dispose() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', this._onKeyDown);
        }
        if (this._container && this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }
        this._container = null;
    }
}

export const performanceMonitor = new PerformanceMonitor();
