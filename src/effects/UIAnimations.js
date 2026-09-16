import { animate } from 'animejs';

export class UIAnimations {
    constructor() {
    }
    _checkReducedMotion(options) {
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduced) {
            return { ...options, duration: 1 }; // near-0
        }
        return options;
    }
    fadeIn(element, options = {}) {
        element.style.display = '';
        const defaultOpts = { targets: element, opacity: [0, 1], duration: 400, easing: 'easeOutQuad' };
        if (options.translateY) {
            defaultOpts.translateY = options.translateY;
        }
        return animate(this._checkReducedMotion({ ...defaultOpts, ...options }));
    }
    fadeOut(element, options = {}) {
        const defaultOpts = {
            targets: element,
            opacity: 0,
            duration: 300,
            easing: 'easeInQuad',
            complete: () => { element.style.display = 'none'; if (options.complete) options.complete(); }
        };
        return animate(this._checkReducedMotion({ ...defaultOpts, ...options }));
    }
    slideIn(element, direction, options = {}) {
        element.style.display = '';
        let startVal = direction === 'left' ? '-100%' : direction === 'right' ? '100%' : direction === 'top' ? '-100%' : '100%';
        const props = (direction === 'left' || direction === 'right') ? { translateX: [startVal, '0%'] } : { translateY: [startVal, '0%'] };
        const defaultOpts = { targets: element, opacity: [0, 1], duration: 500, easing: 'easeOutQuint', ...props };
        return animate(this._checkReducedMotion({ ...defaultOpts, ...options }));
    }
    slideOut(element, direction, options = {}) {
        let endVal = direction === 'left' ? '-100%' : direction === 'right' ? '100%' : direction === 'top' ? '-100%' : '100%';
        const props = (direction === 'left' || direction === 'right') ? { translateX: endVal } : { translateY: endVal };
        const defaultOpts = {
            targets: element, opacity: 0, duration: 400, easing: 'easeInQuint', ...props,
            complete: () => { element.style.display = 'none'; if (options.complete) options.complete(); }
        };
        return animate(this._checkReducedMotion({ ...defaultOpts, ...options }));
    }
    staggerIn(elements, options = {}) {
        const defaultOpts = { targets: elements, opacity: [0, 1], translateY: [20, 0], duration: 400, delay: animate.stagger(100), easing: 'easeOutQuad' };
        return animate(this._checkReducedMotion({ ...defaultOpts, ...options }));
    }
    scaleIn(element, options = {}) {
        element.style.display = '';
        const defaultOpts = { targets: element, scale: [0, 1], opacity: [0, 1], duration: 600, easing: 'easeOutElastic(1, .6)' };
        return animate(this._checkReducedMotion({ ...defaultOpts, ...options }));
    }
    flyTo(element, fromX, fromY, toX, toY, options = {}) {
        element.style.transform = `translate(${fromX}px, ${fromY}px)`;
        const midX = (fromX + toX) / 2;
        const midY = Math.min(fromY, toY) - 100;
        const defaultOpts = {
            targets: element,
            translateX: [
                { value: midX, duration: options.duration ? options.duration / 2 : 300, easing: 'easeOutQuad' },
                { value: toX, duration: options.duration ? options.duration / 2 : 300, easing: 'easeInQuad' }
            ],
            translateY: [
                { value: midY, duration: options.duration ? options.duration / 2 : 300, easing: 'easeOutQuad' },
                { value: toY, duration: options.duration ? options.duration / 2 : 300, easing: 'easeInQuad' }
            ],
            scale: [ { value: 1.5, duration: 300 }, { value: 1, duration: 300 } ]
        };
        return animate(this._checkReducedMotion({ ...defaultOpts, ...options }));
    }
    pulseElement(element, options = {}) {
        const defaultOpts = { targets: element, scale: [1, 1.1, 1], duration: 300, easing: 'easeInOutQuad' };
        return animate(this._checkReducedMotion({ ...defaultOpts, ...options }));
    }
    dispose() {
    }
}
