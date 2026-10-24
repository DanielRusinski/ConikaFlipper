import * as AnimeModule from 'https://esm.sh/animejs@3.2.2';

const baseFn = AnimeModule.default || AnimeModule.anime || AnimeModule.animate;
const animeFn = function(...args) {
    return baseFn.apply(this, args);
};

// Copy all static helpers (stagger, timeline, remove, etc.)
Object.assign(animeFn, baseFn);
if (AnimeModule.stagger) animeFn.stagger = AnimeModule.stagger;
if (AnimeModule.timeline) animeFn.timeline = AnimeModule.timeline;
if (AnimeModule.remove) animeFn.remove = AnimeModule.remove;

export const animate = animeFn;
export const anime = animeFn;
export const stagger = animeFn.stagger;
export default animeFn;
