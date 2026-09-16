export const colourGLSL = `
vec3 adjustSaturation(vec3 color, float amount) {
    const vec3 luminanceWeighting = vec3(0.2126, 0.7152, 0.0722);
    float luminance = dot(color, luminanceWeighting);
    return mix(vec3(luminance), color, amount);
}

vec3 adjustContrast(vec3 color, float amount) {
    return 0.5 + (amount * (color - 0.5));
}

vec3 gradientMap(float t, vec3 colorA, vec3 colorB) {
    return mix(colorA, colorB, clamp(t, 0.0, 1.0));
}
`;
