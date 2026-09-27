import * as THREE from 'three';

/**
 * ============================================================================
 * JELLY MATERIALS SYSTEM - Premium Candy Jelly (Three.js MeshPhysicalMaterial)
 * ============================================================================
 * 
 * Specjalistyczny moduł fizycznych materiałów typu "Premium Candy Jelly",
 * symulujący gęste, nasycone, soczyste żelki z miękkim przejściem światła,
 * szklano-cukrową powłoką clearcoat i wewnętrzną poświatą.
 * 
 * Odbicia i oświetlenie IBL kalkulowane są wyłącznie z załadowanej mapy .exr
 * (OPT_EXR_AmbientLight001.exr), eliminując kosztowne odbicia i refrakcje
 * dynamicznej sceny (transmissionRenderTarget).
 */

/**
 * Predefiniowane palety kolorystyczne dla wariantów żelek:
 * - baseColor: barwa powierzchniowa i rozproszenia światła
 * - emissiveColor: kolor wewnętrznego podświetlenia (subsurface light core)
 * - sheenColor: aksamitny, cukierkowy blask na krawędziach przy kątach stycznych
 * - attenuationColor: barwa pochłaniania wewnątrz objętości (volume absorption)
 */
export const JELLY_COLOR_PRESETS = Object.freeze({
  cyan: {
    baseColor: '#00DFF2',
    emissiveColor: '#00BFD8',
    sheenColor: '#8FFFFF',
    attenuationColor: '#00AFC9'
  },
  pink: {
    baseColor: '#F018D5',
    emissiveColor: '#D600B8',
    sheenColor: '#FF91F1',
    attenuationColor: '#C400A7'
  },
  purple: {
    baseColor: '#7B32E8',
    emissiveColor: '#5620C8',
    sheenColor: '#C59BFF',
    attenuationColor: '#4E18B5'
  }
});

/**
 * Bazowa konfiguracja parametrów fizycznych dla materiału żelki:
 * - metalness: 0.0 -> materiał ściśle dielektryczny, bez cech metalu
 * - roughness: 0.12 -> gładka, delikatnie satynowa baza pod glazurą
 * - transmission: 0.0 -> odbicia i światło obliczane z mapy .exr, bez renderowania odbić ze sceny
 * - opacity: 0.90 -> gęste, nasycone zabarwienie dające soczystą żelkę
 * - ior: 1.42 -> współczynnik załamania światła żelatyny/syropu cukrowego
 * - thickness: 1.2 -> grubość optyczna objętości
 * - attenuationDistance: 0.95 -> dystans zanikania światła dający głębię koloru
 * - clearcoat: 1.0 -> szklista powłoka zewnętrzna (candy glaze)
 * - clearcoatRoughness: 0.08 -> lśniące, ostre odbicia światła z mapy .exr na zaokrągleniach
 * - sheen: 0.7 -> miękki aksamitny refleks krawędziowy (sugar rim)
 * - sheenRoughness: 0.25 -> rozmycie blasku sheen
 * - emissiveIntensity: 0.18 -> delikatna wewnętrzna luminescencja aktywująca Bloom
 * - envMapIntensity: 1.6 -> nasycenie odbić środowiskowych z mapy .exr
 * - transparent: true -> przezroczystość żelkowej powłoki
 * - depthWrite: true -> stabilne buforowanie głębokości bez artefaktów sortowania
 * - side: THREE.FrontSide
 */
export const DEFAULT_JELLY_CONFIG = Object.freeze({
  metalness: 0.0,
  roughness: 0.12,
  transmission: 0.0,
  opacity: 0.90,
  ior: 1.42,
  thickness: 1.2,
  attenuationDistance: 0.95,
  clearcoat: 1.0,
  clearcoatRoughness: 0.08,
  sheen: 0.7,
  sheenRoughness: 0.25,
  emissiveIntensity: 0.18,
  envMapIntensity: 1.6,
  transparent: true,
  depthWrite: true,
  side: THREE.FrontSide,
  envMap: null
});

// Cache dla załadowanej tekstury środowiskowej .exr
let _cachedExrTexture = null;
let _exrLoadPromise = null;
const _registeredJellyMaterials = new Set();

/**
 * Ładuje mapę otoczenia .exr dedykowaną dla odbić materiałów żelek.
 * Po załadowaniu automatycznie podpina teksturę pod wszystkie aktywne materiały żelek.
 * 
 * @param {string[]} [candidatePaths] - Ścieżki do pliku .exr
 * @returns {Promise<THREE.Texture|null>}
 */
export async function loadJellyExrMap(candidatePaths = [
  'src/exr/OPT_EXR_AmbientLight001.exr',
  'exr/OPT_EXR_AmbientLight001.exr',
  './src/exr/OPT_EXR_AmbientLight001.exr',
  './exr/OPT_EXR_AmbientLight001.exr'
]) {
  if (_cachedExrTexture) return _cachedExrTexture;
  if (_exrLoadPromise) return _exrLoadPromise;

  _exrLoadPromise = (async () => {
    try {
      let loader = null;
      try {
        const mod = await import('three/addons/loaders/EXRLoader.js');
        if (mod && mod.EXRLoader) {
          loader = new mod.EXRLoader();
        }
      } catch (_) {
        // Środowisko bez three/addons
      }

      if (!loader) return null;

      for (const p of candidatePaths) {
        try {
          const texture = await new Promise((resolve, reject) => {
            loader.load(p, resolve, undefined, reject);
          });
          if (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            setJellyEnvironmentMap(texture);
            return texture;
          }
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  })();

  return _exrLoadPromise;
}

/**
 * Ustawia mapę środowiskową .exr dla wszystkich materiałów żelkowych,
 * gwarantując że odbicia pochodzą wyłącznie z tej mapy, a nie ze sceny.
 * 
 * @param {THREE.Texture} texture - Załadowana tekstura HDR/EXR
 */
export function setJellyEnvironmentMap(texture) {
  if (!texture) return;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  _cachedExrTexture = texture;

  for (const mat of _registeredJellyMaterials) {
    if (mat && mat.isMeshPhysicalMaterial) {
      mat.envMap = texture;
      mat.needsUpdate = true;
    }
  }
}

/**
 * Zwraca aktualnie zbuforowaną teksturę otoczenia .exr lub null.
 * @returns {THREE.Texture|null}
 */
export function getJellyEnvironmentMap() {
  return _cachedExrTexture;
}

/**
 * Pomocnicza funkcja normalizująca parametry i tworząca unikalną instancję MeshPhysicalMaterial.
 * 
 * @param {string|object} variantOrOptions - Nazwa wariantu ('cyan', 'pink', 'purple') lub bezpośredni obiekt opcji
 * @param {object} [customOptions={}] - Opcjonalne nadpisania parametrów fizycznych lub kolorów
 * @returns {THREE.MeshPhysicalMaterial} Nowa instancja materiału
 */
export function createJellyMaterial(variantOrOptions = 'cyan', customOptions = {}) {
  let presetKey = 'cyan';
  let overrides = {};

  if (typeof variantOrOptions === 'string') {
    presetKey = variantOrOptions.toLowerCase();
    overrides = customOptions;
  } else if (typeof variantOrOptions === 'object' && variantOrOptions !== null) {
    if (variantOrOptions.variant && typeof variantOrOptions.variant === 'string') {
      presetKey = variantOrOptions.variant.toLowerCase();
    }
    overrides = { ...variantOrOptions, ...customOptions };
  }

  // Pobranie domyślnego presetu kolorystycznego lub fallback do cyanu
  const preset = JELLY_COLOR_PRESETS[presetKey] || JELLY_COLOR_PRESETS.cyan;

  // Rozwiązanie kolorów z uwzględnieniem poprawności sRGB Color Management
  const baseColor = new THREE.Color(overrides.baseColor ?? preset.baseColor);
  const emissiveColor = new THREE.Color(overrides.emissiveColor ?? preset.emissiveColor);
  const sheenColor = new THREE.Color(overrides.sheenColor ?? preset.sheenColor);
  const attenuationColor = new THREE.Color(overrides.attenuationColor ?? preset.attenuationColor);

  // Scalenie domyślnych parametrów z ewentualnymi modyfikacjami
  const config = {
    ...DEFAULT_JELLY_CONFIG,
    ...overrides
  };

  const assignedEnvMap = overrides.envMap !== undefined ? overrides.envMap : (_cachedExrTexture || config.envMap || null);

  // Utworzenie nowej instancji materiału MeshPhysicalMaterial
  const material = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    emissive: emissiveColor,
    emissiveIntensity: config.emissiveIntensity,
    sheen: config.sheen,
    sheenColor: sheenColor,
    sheenRoughness: config.sheenRoughness,
    transmission: config.transmission,
    thickness: config.thickness,
    attenuationColor: attenuationColor,
    attenuationDistance: config.attenuationDistance,
    roughness: config.roughness,
    metalness: config.metalness,
    ior: config.ior,
    clearcoat: config.clearcoat,
    clearcoatRoughness: config.clearcoatRoughness,
    opacity: config.opacity,
    transparent: config.transparent,
    depthWrite: config.depthWrite,
    side: config.side,
    envMap: assignedEnvMap,
    envMapIntensity: config.envMapIntensity
  });

  // Vertical Gradient Shader Hook:
  // - Na dole u podstawy: mniej przezroczysty (gęsty opacity ~0.98) i bardziej fioletowy (#3E087D)
  // - Ku górze: płynne przejście w soczysty kolor wariantu (Cyan, Pink, Purple) z wyższą przezroczystością (opacity ~0.85)
  material.onBeforeCompile = (shader) => {
    material.userData.shader = shader;

    // 1. Przekazanie wysokości wierzchołka do shadera fragmentów
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_pars_vertex>',
      `
      #include <uv_pars_vertex>
      varying float vJellyHeight;
      `
    );

    // 2. Normalizacja wysokości [0.0 = podstawa, 1.0 = wierzchołek]
    // cellColumn.glb posiada Y w przedziale [0, 0.072]; fallback BoxGeometry posiada Y w [-0.03, 0.03]
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      float localY = position.y;
      vJellyHeight = localY >= -0.001 ? clamp(localY / 0.072, 0.0, 1.0) : clamp((localY + 0.03) / 0.06, 0.0, 1.0);
      `
    );

    // 3. Deklaracja varying w shaderze fragmentów
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <uv_pars_fragment>',
      `
      #include <uv_pars_fragment>
      varying float vJellyHeight;
      `
    );

    // 4. Mieszanie koloru bazowego i przezroczystości wzdłuż wysokości
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>

      // Gradient pionowy żelki:
      // U podstawy (h = 0.0): mniej przezroczysty (opacity 0.98) i głęboki fiolet (#3E087D)
      // Na wierzchołku (h = 1.0): soczysty kolor wariantu (cyan, pink, purple) oraz większa przezroczystość (0.85)
      float jellyH = clamp(vJellyHeight, 0.0, 1.0);
      float jellyGradient = smoothstep(0.0, 0.92, jellyH);

      // Głęboki fiolet żelkowy u podstawy (deep grape-violet)
      vec3 jellyBaseViolet = vec3(0.243, 0.031, 0.490);

      // Płynne przejście koloru rozproszenia (diffuse)
      diffuseColor.rgb = mix(jellyBaseViolet, diffuseColor.rgb, jellyGradient);

      // Gradient przezroczystości: mniej przezroczysty na dole, bardziej przezroczysty u góry
      float baseOpacity = 0.98;
      float topOpacity = 0.85;
      diffuseColor.a = mix(baseOpacity, topOpacity, jellyGradient);
      `
    );

    // 5. Mieszanie wewnętrznej luminescencji (emissive)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `
      #include <emissivemap_fragment>
      vec3 jellyBaseVioletEmissive = vec3(0.19, 0.02, 0.44);
      totalEmissiveRadiance = mix(jellyBaseVioletEmissive * 0.75, totalEmissiveRadiance, jellyGradient);
      `
    );
  };

  material.customProgramCacheKey = () => 'PremiumCandyJellyGradient_' + presetKey;

  // Rejestracja materiału do automatycznej aktualizacji po załadowaniu EXR
  _registeredJellyMaterials.add(material);

  // Auto-odpalenie asynchronicznego ładowania mapy EXR jeśli jeszcze nie ma jej w pamięci
  if (!_cachedExrTexture && !_exrLoadPromise) {
    loadJellyExrMap().catch(() => {});
  }

  // Zapis wartości bazowych w userData do późniejszej bezpiecznej modulacji intensywności
  material.userData = {
    isJellyMaterial: true,
    variant: presetKey,
    baseline: {
      emissiveIntensity: config.emissiveIntensity,
      envMapIntensity: config.envMapIntensity,
      opacity: config.opacity,
      transmission: config.transmission
    }
  };

  // Obsługa odpinania z rejestru przy zniszczeniu materiału
  if (typeof material.dispose === 'function') {
    const originalDispose = material.dispose.bind(material);
    material.dispose = () => {
      _registeredJellyMaterials.delete(material);
      originalDispose();
    };
  }

  return material;
}

/**
 * Fabryka materiału żelki w wariancie CYAN (słodki, chłodny turkus/błękit).
 * @param {object} [options={}] - Dodatkowe opcje nadpisujące parametry domyślne
 * @returns {THREE.MeshPhysicalMaterial}
 */
export function createCyanJellyMaterial(options = {}) {
  return createJellyMaterial('cyan', options);
}

/**
 * Fabryka materiału żelki w wariancie PINK (intensywna, soczysta guma balonowa/malina).
 * @param {object} [options={}] - Dodatkowe opcje nadpisujące parametry domyślne
 * @returns {THREE.MeshPhysicalMaterial}
 */
export function createPinkJellyMaterial(options = {}) {
  return createJellyMaterial('pink', options);
}

/**
 * Fabryka materiału żelki w wariancie PURPLE (głęboki, żelkowy fiolet/jagoda).
 * @param {object} [options={}] - Dodatkowe opcje nadpisujące parametry domyślne
 * @returns {THREE.MeshPhysicalMaterial}
 */
export function createPurpleJellyMaterial(options = {}) {
  return createJellyMaterial('purple', options);
}

/**
 * Tworzy kompletny zestaw trzech świeżych, unikalnych instancji materiałów (cyan, pink, purple).
 * Żadne instancje nie są współdzielone.
 * 
 * @param {object} [options={}] - Wspólne opcje nadpisujące przekazywane do każdego materiału
 * @returns {{ cyan: THREE.MeshPhysicalMaterial, pink: THREE.MeshPhysicalMaterial, purple: THREE.MeshPhysicalMaterial }}
 */
export function createJellyMaterialSet(options = {}) {
  return {
    cyan: createCyanJellyMaterial(options),
    pink: createPinkJellyMaterial(options),
    purple: createPurpleJellyMaterial(options)
  };
}

/**
 * Dynamicznie aktualizuje intensywność materiału żelki bez alokowania nowej instancji.
 * Reguluje wewnętrzny rozbłysk (emissiveIntensity), odbicia otoczenia (envMapIntensity) oraz krycie (opacity).
 * 
 * @param {THREE.MeshPhysicalMaterial} material - Docelowy materiał żelki do zaktualizowania
 * @param {number} [intensity=1.0] - Współczynnik intensywności (np. 1.0 = domyślny, 2.0 = intensywny rozbłysk, 0.5 = przygaszony)
 */
export function updateJellyMaterialIntensity(material, intensity = 1.0) {
  if (!material || !material.isMeshPhysicalMaterial) return;

  const validIntensity = Math.max(0.0, Number.isFinite(intensity) ? intensity : 1.0);
  const baseline = material.userData?.baseline || {
    emissiveIntensity: DEFAULT_JELLY_CONFIG.emissiveIntensity,
    envMapIntensity: DEFAULT_JELLY_CONFIG.envMapIntensity,
    opacity: DEFAULT_JELLY_CONFIG.opacity
  };

  // 1. Emissive Intensity: skaluje wewnętrzne światło żelki (kluczowe dla post-processingu UnrealBloomPass)
  material.emissiveIntensity = baseline.emissiveIntensity * validIntensity;

  // 2. EnvMap Intensity: nasyca refleksy powierzchniowe glazury
  material.envMapIntensity = baseline.envMapIntensity * Math.min(2.5, Math.max(0.2, validIntensity * 0.8 + 0.2));

  // 3. Opacity: subtelnie nasyca gęstość materiału przy wyższej intensywności
  const opacityMultiplier = Math.min(1.15, Math.max(0.7, 0.9 + (validIntensity - 1.0) * 0.1));
  material.opacity = Math.min(1.0, baseline.opacity * opacityMultiplier);

  material.needsUpdate = false;
}
