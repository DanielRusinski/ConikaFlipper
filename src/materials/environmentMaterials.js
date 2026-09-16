import * as THREE from 'three';

const envMaterialCache = new Map();

export function createObstacleMaterial() {
    const key = 'obstacle';
    if (envMaterialCache.has(key)) return envMaterialCache.get(key);

    const mat = new THREE.MeshStandardMaterial({
        color: 0x445566,
        metalness: 0.3,
        roughness: 0.6
    });
    envMaterialCache.set(key, mat);
    return mat;
}

export function createSelectorMaterial() {
    const key = 'selector';
    if (envMaterialCache.has(key)) return envMaterialCache.get(key);

    const mat = new THREE.MeshStandardMaterial({
        color: 0x00ffcc,
        emissive: 0x00ffcc,
        emissiveIntensity: 0.6,
        roughness: 0.2
    });
    envMaterialCache.set(key, mat);
    return mat;
}

export function createCrystalMaterial(color = 0x00ffcc) {
    const key = `crystal_${color}`;
    if (envMaterialCache.has(key)) return envMaterialCache.get(key);

    const mat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.9,
        metalness: 0.3,
        roughness: 0.15
    });
    envMaterialCache.set(key, mat);
    return mat;
}

export function createBrightBloomCrystalMaterial(color = 0xff00cc) {
    const key = `crystal_bloom_${color}`;
    if (envMaterialCache.has(key)) return envMaterialCache.get(key);

    const mat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 3.5, // High emissive triggers rich bloom
        transparent: true,
        opacity: 0.95,
        metalness: 0.2,
        roughness: 0.1
    });
    envMaterialCache.set(key, mat);
    return mat;
}

export function createEmeraldCrystalMaterial() {
    const key = 'crystal_emerald';
    if (envMaterialCache.has(key)) return envMaterialCache.get(key);

    const mat = new THREE.MeshStandardMaterial({
        color: 0x00ff66,
        emissive: 0x00ff55,
        emissiveIntensity: 2.2, // Vibrant glowing emerald green with rich bloom
        transparent: true,
        opacity: 0.95,
        metalness: 0.20,
        roughness: 0.08
    });
    envMaterialCache.set(key, mat);
    return mat;
}

export function disposeEnvironmentMaterials() {
    envMaterialCache.forEach(mat => mat.dispose());
    envMaterialCache.clear();
}
