export const fresnelGLSL = `
float fresnelEffect(vec3 worldNormal, vec3 viewDir, float power) {
    float f = max(0.0, 1.0 - dot(normalize(worldNormal), normalize(viewDir)));
    return pow(f, power);
}
`;
