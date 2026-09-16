import * as THREE from 'three';

const materialCache = new Map();

export const BALL_COLORS = {
    brass: 0xd4a84b,
    marble: 0xede8e1,
    wood: 0x8a5229
};

export const BALL_CSS_COLORS = {
    brass: '#d4a84b',
    marble: '#ede8e1',
    wood: '#8a5229'
};

export const BALL_DISPLAY_NAMES = {
    brass: 'Brass',
    marble: 'Marble',
    wood: 'Wood'
};

export function createBallMaterial(type) {
    const key = (type || 'brass').toLowerCase();
    if (materialCache.has(key)) {
        return materialCache.get(key);
    }

    let material;
    switch(key) {
        case 'brass':
            material = new THREE.MeshStandardMaterial({
                color: BALL_COLORS.brass,
                metalness: 0.88,
                roughness: 0.20,
                envMapIntensity: 1.5
            });
            break;
        case 'marble':
            material = new THREE.MeshStandardMaterial({
                color: BALL_COLORS.marble,
                metalness: 0.05,
                roughness: 0.35,
                envMapIntensity: 0.8
            });
            break;
        case 'wood':
            material = new THREE.MeshStandardMaterial({
                color: BALL_COLORS.wood,
                metalness: 0.0,
                roughness: 0.75,
                envMapIntensity: 0.4
            });
            break;
        default:
            material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    }

    materialCache.set(key, material);
    return material;
}

export function disposeBallMaterials() {
    materialCache.forEach(mat => mat.dispose());
    materialCache.clear();
}
