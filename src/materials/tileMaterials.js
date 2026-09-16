import * as THREE from 'three';

export const TILE_COLORS = {
    default: 0xdddddd,
    conquered: 0xb87333,
    flash: new THREE.Color(1.5, 1.2, 1.5),
    highlight: 0x00ffcc,
    obstacle: 0x444455
};

let tileMaterialCache = null;

export function createTileMaterial(textureLoader) {
    if (tileMaterialCache) return tileMaterialCache;

    const roughnessBumpMap = textureLoader.load('src/512white_mperfections02.png');
    roughnessBumpMap.wrapS = THREE.RepeatWrapping;
    roughnessBumpMap.wrapT = THREE.RepeatWrapping;
    roughnessBumpMap.repeat.set(2.0, 2.0);

    const mat = new THREE.MeshStandardMaterial({
        color: TILE_COLORS.default,
        metalness: 0.15,
        roughness: 0.40,
        roughnessMap: roughnessBumpMap,
        bumpMap: roughnessBumpMap,
        bumpScale: 0.060
    });

    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            `
            #include <project_vertex>
            
            vec4 globalPosition;
            #ifdef USE_INSTANCING
                globalPosition = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
            #else
                globalPosition = modelMatrix * vec4(transformed, 1.0);
            #endif

            vec2 globalUv = globalPosition.xz;

            #ifdef USE_UV
                vUv = globalUv;
            #endif
            #ifdef USE_ROUGHNESSMAP
                vRoughnessMapUv = ( roughnessMapTransform * vec3( globalUv, 1 ) ).xy;
            #endif
            #ifdef USE_BUMPMAP
                vBumpMapUv = ( bumpMapTransform * vec3( globalUv, 1 ) ).xy;
            #endif
            `
        );
    };

    tileMaterialCache = mat;
    return mat;
}

export function disposeTileMaterials() {
    if (tileMaterialCache) {
        tileMaterialCache.dispose();
        if (tileMaterialCache.roughnessMap) tileMaterialCache.roughnessMap.dispose();
        tileMaterialCache = null;
    }
}
