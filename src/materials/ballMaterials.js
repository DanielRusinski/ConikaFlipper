import * as THREE from 'three';

const materialCache = new Map();

export const BALL_COLORS = {
    brass: 0xd4a84b,
    marble: 0xede8e1,
    wood: 0x8a5229,
    chrome: 0xe6edf5
};

export const BALL_CSS_COLORS = {
    brass: '#d4a84b',
    marble: '#ede8e1',
    wood: '#8a5229',
    chrome: '#e2e8f0'
};

export const BALL_DISPLAY_NAMES = {
    brass: 'Brass',
    marble: 'Marble',
    wood: 'Wood',
    chrome: 'Chrome Steel'
};

function generateChromeTextures() {
    if (typeof document === 'undefined' || !document.createElement) {
        return { map: null, roughnessMap: null, metalnessMap: null, emissiveMap: null };
    }

    try {
        const width = 512;
        const height = 256;

        // 1. Color / Diffuse map
        const diffuseCanvas = document.createElement('canvas');
        diffuseCanvas.width = width;
        diffuseCanvas.height = height;
        const ctxD = diffuseCanvas.getContext && diffuseCanvas.getContext('2d');
        if (!ctxD) return { map: null, roughnessMap: null, metalnessMap: null, emissiveMap: null };

        // Chrome body with high specular sheen gradient
        const gradD = ctxD.createLinearGradient(0, 0, 0, height);
        gradD.addColorStop(0.0, '#eaf0f8');
        gradD.addColorStop(0.2, '#f8fafc');
        gradD.addColorStop(0.38, '#cbd5e1');
        gradD.addColorStop(0.42, '#8fa0b5');
        gradD.addColorStop(0.58, '#8fa0b5');
        gradD.addColorStop(0.62, '#cbd5e1');
        gradD.addColorStop(0.8, '#f8fafc');
        gradD.addColorStop(1.0, '#eaf0f8');
        ctxD.fillStyle = gradD;
        ctxD.fillRect(0, 0, width, height);

        // Thin recessed bezel groove lines at equator edges
        ctxD.fillStyle = '#161922';
        ctxD.fillRect(0, 108, width, 3);
        ctxD.fillRect(0, 145, width, 3);

        // Neon purple band around the equator (latitudes 111 to 145)
        const gradBandD = ctxD.createLinearGradient(0, 111, 0, 145);
        gradBandD.addColorStop(0.0, '#7b00b3');
        gradBandD.addColorStop(0.25, '#bf00ff');
        gradBandD.addColorStop(0.5, '#e066ff');
        gradBandD.addColorStop(0.75, '#bf00ff');
        gradBandD.addColorStop(1.0, '#7b00b3');
        ctxD.fillStyle = gradBandD;
        ctxD.fillRect(0, 111, width, 34);

        // 2. Roughness map
        const roughCanvas = document.createElement('canvas');
        roughCanvas.width = width;
        roughCanvas.height = height;
        const ctxR = roughCanvas.getContext('2d');
        // Polished mirror chrome: roughness ~0.08 (#141414)
        ctxR.fillStyle = '#141414';
        ctxR.fillRect(0, 0, width, height);
        // Groove bevels: rougher (#666666)
        ctxR.fillStyle = '#666666';
        ctxR.fillRect(0, 108, width, 3);
        ctxR.fillRect(0, 145, width, 3);
        // Smooth satin neon polymer band: roughness ~0.22 (#383838)
        ctxR.fillStyle = '#383838';
        ctxR.fillRect(0, 111, width, 34);

        // 3. Metalness map
        const metalCanvas = document.createElement('canvas');
        metalCanvas.width = width;
        metalCanvas.height = height;
        const ctxM = metalCanvas.getContext('2d');
        // Chrome steel: 100% metal (#ffffff)
        ctxM.fillStyle = '#ffffff';
        ctxM.fillRect(0, 0, width, height);
        // Groove: #444444
        ctxM.fillStyle = '#444444';
        ctxM.fillRect(0, 108, width, 3);
        ctxM.fillRect(0, 145, width, 3);
        // Neon band: non-metal (#1a1a1a)
        ctxM.fillStyle = '#1a1a1a';
        ctxM.fillRect(0, 111, width, 34);

        // 4. Emissive map
        const emissiveCanvas = document.createElement('canvas');
        emissiveCanvas.width = width;
        emissiveCanvas.height = height;
        const ctxE = emissiveCanvas.getContext('2d');
        // Black for chrome steel (zero emissive)
        ctxE.fillStyle = '#000000';
        ctxE.fillRect(0, 0, width, height);
        // Glowing purple neon band
        const gradE = ctxE.createLinearGradient(0, 111, 0, 145);
        gradE.addColorStop(0.0, 'rgba(160, 0, 240, 0.4)');
        gradE.addColorStop(0.2, 'rgba(210, 30, 255, 0.9)');
        gradE.addColorStop(0.5, 'rgba(255, 120, 255, 1.0)');
        gradE.addColorStop(0.8, 'rgba(210, 30, 255, 0.9)');
        gradE.addColorStop(1.0, 'rgba(160, 0, 240, 0.4)');
        ctxE.fillStyle = gradE;
        ctxE.fillRect(0, 111, width, 34);

        const map = new THREE.CanvasTexture(diffuseCanvas);
        const roughnessMap = new THREE.CanvasTexture(roughCanvas);
        const metalnessMap = new THREE.CanvasTexture(metalCanvas);
        const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);

        map.wrapS = THREE.RepeatWrapping;
        roughnessMap.wrapS = THREE.RepeatWrapping;
        metalnessMap.wrapS = THREE.RepeatWrapping;
        emissiveMap.wrapS = THREE.RepeatWrapping;

        return { map, roughnessMap, metalnessMap, emissiveMap };
    } catch (_) {
        return { map: null, roughnessMap: null, metalnessMap: null, emissiveMap: null };
    }
}

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
        case 'chrome': {
            const tex = generateChromeTextures();
            if (tex.map) {
                material = new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    map: tex.map,
                    roughnessMap: tex.roughnessMap,
                    metalnessMap: tex.metalnessMap,
                    emissiveMap: tex.emissiveMap,
                    emissive: new THREE.Color(1.8, 0.4, 2.5),
                    emissiveIntensity: 1.6,
                    metalness: 1.0,
                    roughness: 1.0,
                    envMapIntensity: 2.4
                });
            } else {
                material = new THREE.MeshStandardMaterial({
                    color: BALL_COLORS.chrome,
                    metalness: 0.96,
                    roughness: 0.10,
                    emissive: new THREE.Color(0.9, 0.2, 1.2),
                    emissiveIntensity: 1.2,
                    envMapIntensity: 2.0
                });
            }
            break;
        }
        default:
            material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    }

    materialCache.set(key, material);
    return material;
}

export function disposeBallMaterials() {
    materialCache.forEach(mat => {
        if (mat.map && mat.map.dispose) mat.map.dispose();
        if (mat.roughnessMap && mat.roughnessMap.dispose) mat.roughnessMap.dispose();
        if (mat.metalnessMap && mat.metalnessMap.dispose) mat.metalnessMap.dispose();
        if (mat.emissiveMap && mat.emissiveMap.dispose) mat.emissiveMap.dispose();
        mat.dispose();
    });
    materialCache.clear();
}
