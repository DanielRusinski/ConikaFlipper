import Stats from 'three/addons/libs/stats.module.js';

export class PerformanceGraph {
    constructor() {
        this._stats = null;
        this._visible = false;
        this._container = null;
    }
    init() {
        this._stats = new Stats();
        this._stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
        this._stats.dom.style.position = 'absolute';
        this._stats.dom.style.top = 'env(safe-area-inset-top, 0px)';
        this._stats.dom.style.left = 'env(safe-area-inset-left, 0px)';
        this._stats.dom.style.zIndex = '1000';
        this._stats.dom.style.pointerEvents = 'none';
        this._stats.dom.style.display = 'none';
        document.body.appendChild(this._stats.dom);
        this._container = this._stats.dom;
    }
    show() {
        if (this._stats) {
            this._stats.dom.style.display = '';
            this._visible = true;
        }
    }
    hide() {
        if (this._stats) {
            this._stats.dom.style.display = 'none';
            this._visible = false;
        }
    }
    toggle() {
        if (this._visible) this.hide();
        else this.show();
    }
    begin() {
        if (this._stats && this._visible) this._stats.begin();
    }
    end() {
        if (this._stats && this._visible) this._stats.end();
    }
    update() {
        if (this._stats && this._visible) this._stats.update();
    }
    dispose() {
        if (this._container && this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }
        this._stats = null;
        this._container = null;
    }
}
