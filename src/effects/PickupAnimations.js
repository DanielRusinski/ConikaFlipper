import { animate } from 'animejs';

export class PickupAnimations {
    constructor() {
        this._animations = new Set();
    }
    animateSpawn(mesh, targetY, callback) {
        mesh.scale.set(0.01, 0.01, 0.01);
        mesh.position.y = 0;
        const anim = animate({
            targets: mesh.scale,
            x: 1, y: 1, z: 1,
            duration: 800,
            easing: 'easeOutElastic(1, .5)'
        });
        const animY = animate({
            targets: mesh.position,
            y: targetY,
            duration: 600,
            easing: 'easeOutQuad',
            complete: () => {
                this._animations.delete(anim);
                this._animations.delete(animY);
                if (callback) callback();
            }
        });
        this._animations.add(anim);
        this._animations.add(animY);
    }
    animateIdle(mesh, baseY, time) {
        const amplitude = 0.5;
        const rotationSpeed = 2.0;
        mesh.position.y = baseY + Math.sin(time * 2) * amplitude;
        mesh.rotation.y += rotationSpeed * 0.016; // approx dt
        const scalePulse = 1.0 + Math.sin(time * 4) * 0.1;
        mesh.scale.set(scalePulse, scalePulse, scalePulse);
    }
    animateCollect(mesh, targetPos, callback) {
        const anim = animate({
            targets: mesh.position,
            x: targetPos.x,
            y: targetPos.y,
            z: targetPos.z,
            duration: 400,
            easing: 'easeInQuad'
        });
        const scaleAnim = animate({
            targets: mesh.scale,
            x: 0.01, y: 0.01, z: 0.01,
            duration: 400,
            easing: 'easeInQuad',
            complete: () => {
                this._animations.delete(anim);
                this._animations.delete(scaleAnim);
                if (callback) callback();
            }
        });
        this._animations.add(anim);
        this._animations.add(scaleAnim);
    }
    animateExpire(mesh, callback) {
        const anim = animate({
            targets: mesh.scale,
            x: 0.01, y: 0.01, z: 0.01,
            duration: 500,
            easing: 'easeInQuad'
        });
        const moveAnim = animate({
            targets: mesh.position,
            y: mesh.position.y - 2,
            duration: 500,
            easing: 'easeInQuad',
            complete: () => {
                this._animations.delete(anim);
                this._animations.delete(moveAnim);
                if (callback) callback();
            }
        });
        this._animations.add(anim);
        this._animations.add(moveAnim);
    }
    dispose() {
        for (const anim of this._animations) {
            anim.pause();
        }
        this._animations.clear();
    }
}
