import * as THREE from 'three';
import { getJellyEnvironmentMap } from './jellyMaterials.js';

export const TILE_COLORS = {
    // Checkerboard palette (matching user confectionery reference image)
    defaultPink: 0xf2bbd7,      // Soft pastel confection pink frosting
    defaultPurple: 0xb481e6,    // Sweet candy lavender-violet glaze
    default: 0xf2bbd7,          // Default alias

    // Conquered / discovered state: UNIFORM RED for all conquered tiles
    conqueredPink: 0xb81b6c,    // Rich glazed raspberry-red
    conqueredPurple: 0xb81b6c,  // Exact same uniform red for conquered purple tiles
    conquered: 0xb81b6c,        // Conquered alias

    // Intense HDR radiant flash pop upon tile discovery
    flash: new THREE.Color(4.8, 4.5, 3.2),
    highlight: 0x00ffcc,
    obstacle: 0x3d314a
};

let _tileMaterialPinkCache = null;
let _tileMaterialPurpleCache = null;
let _imperfectionsTextureCache = null;
let _cachedEnvMap = null;

/**
 * Loads and configures the surface imperfections texture.
 * Applies repeat (2.0, 2.0) and repeat wrapping so that fine micro-scratches and smudges
 * catch the light across the checkerboard.
 */
export function loadImperfectionsTexture(textureLoader) {
    if (_imperfectionsTextureCache) return _imperfectionsTextureCache;
    if (!textureLoader) return null;

    const texturePaths = [
        'src/512white_mperfections02.png',
        '512white_mperfections02.png',
        './src/512white_mperfections02.png',
        './512white_mperfections02.png',
        'src/maps/512_mperfections.png'
    ];

    let tex = null;
    try {
        tex = textureLoader.load(texturePaths[0]);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2.0, 2.0);
        _imperfectionsTextureCache = tex;
    } catch (_) {}

    return tex;
}

/**
 * Configures the custom shader onBeforeCompile for a tile material:
 * 1. World-space XZ UV projection for the imperfections roughness/bump map.
 * 2. Emissive HDR radiance calculation from instanceColor (> 1.0) for radiant pop.
 */
function applyTileShaderHook(material) {
    material.onBeforeCompile = (shader) => {
        material.userData.shader = shader;

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

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `
            #include <emissivemap_fragment>
            #if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )
                // Any instance color luminance exceeding 1.0 radiates directly as emissive bloom light
                vec3 flashGlow = max(vec3(0.0), vColor.rgb - vec3(1.0));
                totalEmissiveRadiance += flashGlow * 1.6;
            #endif
            `
        );
    };
}

/**
 * Creates or retrieves the paired checkerboard tile materials (pink frosting & lavender-violet glaze),
 * each equipped with the surface imperfections map, clearcoat, confection sheen, and world UV projection.
 */
export function createCheckerboardTileMaterials(textureLoader = null, envMap = null) {
    const resolvedEnvMap = envMap || _cachedEnvMap || (getJellyEnvironmentMap ? getJellyEnvironmentMap() : null);
    const roughnessBumpMap = loadImperfectionsTexture(textureLoader);

    if (!_tileMaterialPinkCache) {
        _tileMaterialPinkCache = new THREE.MeshPhysicalMaterial({
            color: TILE_COLORS.defaultPink,
            metalness: 0.02,
            roughness: 0.18,
            clearcoat: 0.95,
            clearcoatRoughness: 0.10,
            sheen: 0.50,
            sheenColor: new THREE.Color(0xffd8e8),
            sheenRoughness: 0.25,
            roughnessMap: roughnessBumpMap,
            bumpMap: roughnessBumpMap,
            bumpScale: 0.060,
            envMap: resolvedEnvMap,
            envMapIntensity: 1.3
        });
        applyTileShaderHook(_tileMaterialPinkCache);
    }

    if (!_tileMaterialPurpleCache) {
        _tileMaterialPurpleCache = new THREE.MeshPhysicalMaterial({
            color: TILE_COLORS.defaultPurple,
            metalness: 0.02,
            roughness: 0.18,
            clearcoat: 0.95,
            clearcoatRoughness: 0.10,
            sheen: 0.50,
            sheenColor: new THREE.Color(0xd8b4fe),
            sheenRoughness: 0.25,
            roughnessMap: roughnessBumpMap,
            bumpMap: roughnessBumpMap,
            bumpScale: 0.060,
            envMap: resolvedEnvMap,
            envMapIntensity: 1.3
        });
        applyTileShaderHook(_tileMaterialPurpleCache);
    }

    return {
        pink: _tileMaterialPinkCache,
        purple: _tileMaterialPurpleCache
    };
}

/**
 * Backward compatibility alias returning the primary pink tile material.
 */
export function createTileMaterial(textureLoader = null, envMap = null) {
    const materials = createCheckerboardTileMaterials(textureLoader, envMap);
    return materials.pink;
}

/**
 * Updates environment map on both checkerboard materials when loaded.
 */
export function setTileEnvironmentMap(texture) {
    if (!texture) return;
    _cachedEnvMap = texture;
    if (_tileMaterialPinkCache) {
        _tileMaterialPinkCache.envMap = texture;
        _tileMaterialPinkCache.needsUpdate = true;
    }
    if (_tileMaterialPurpleCache) {
        _tileMaterialPurpleCache.envMap = texture;
        _tileMaterialPurpleCache.needsUpdate = true;
    }
}

export function disposeTileMaterials() {
    if (_tileMaterialPinkCache) {
        _tileMaterialPinkCache.dispose();
        _tileMaterialPinkCache = null;
    }
    if (_tileMaterialPurpleCache) {
        _tileMaterialPurpleCache.dispose();
        _tileMaterialPurpleCache = null;
    }
    if (_imperfectionsTextureCache) {
        _imperfectionsTextureCache.dispose();
        _imperfectionsTextureCache = null;
    }
}
