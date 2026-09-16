export const tableCameraController = {
  // Wektor docelowy i bieżąca pozycja do płynnej interpolacji (LERP)
  currentCamPos: { x: 0, y: 1.2, z: 0.8 },
  
  init(camera, initialX, initialZ) {
    // Inicjalizacja pozycji startowej
    this.currentCamPos.x = initialX;
    this.currentCamPos.z = initialZ + 0.7; // lekkie cofnięcie wzdłuż osi Z
  },

  update(camera, ballPx, ballPy, frameTime) {
    // Środek stołu w przestrzeni 3D (dla stołu 0.514 x 1.07 m)
    const tableCenterX = 0.514 / 2; // ~0.257
    const tableCenterZ = 1.07 / 2;  // ~0.535

    // Mapowanie pozycji kulki z fizyki 2D na przestrzeń 3D stołu
    const ball3D_X = ballPx - tableCenterX;
    const ball3D_Z = ballPy - tableCenterZ;

    // Docelowa pozycja kamery: bazuje na środku stołu, ale delikatnie "zagląda" w stronę kulki (współczynnik 0.25),
    // dzięki czemu kamera subtelnie podąża za kulką, ale nigdy nie traci z oczu krawędzi stołu.
    const targetX = tableCenterX - 0.257 + (ball3D_X * 0.25);
    const targetZ = tableCenterZ - 0.535 + 0.8 + (ball3D_Z * 0.25);
    const targetY = 1.2; // Stała wysokość zapewniająca widok całego stołu

    // Płynna interpolacja (LERP) pozycji kamery dla uniknięcia nagłych skoków
    const lerpFactor = Math.min(frameTime * 4.0, 1.0);
    this.currentCamPos.x += (targetX - this.currentCamPos.x) * lerpFactor;
    this.currentCamPos.y += (targetY - this.currentCamPos.y) * lerpFactor;
    this.currentCamPos.z += (targetZ - this.currentCamPos.z) * lerpFactor;

    // Aplikacja pozycji do obiektu kamery Three.js
    camera.position.set(this.currentCamPos.x, this.currentCamPos.y, this.currentCamPos.z);
    
    // Kamera stale patrzy na środek stołu, zapewniając stabilne sterowanie klawiszami WASD/Strzałki
    camera.lookAt(tableCenterX - 0.257, 0, tableCenterZ - 0.535);
  }
};