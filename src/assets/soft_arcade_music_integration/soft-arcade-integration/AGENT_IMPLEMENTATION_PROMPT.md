# Agent implementation prompt

Implement the supplied procedural background music module into the existing JavaScript game.

## Supplied files
- `SoftArcadeMusic.js`: reusable Web Audio music class.
- `integration-example.js`: reference integration only. Adapt it to the existing architecture rather than copying selectors blindly.

## Objective
Integrate the easygoing, minimalist 60-second arcade composition as the game's background music and keep it looping seamlessly during gameplay.

## Required work
1. Analyse the project structure and identify:
   - the main application/game initialisation entry point;
   - the existing audio manager, settings store and UI controls, if present;
   - the Start Game/Continue user gesture;
   - pause, resume, game-over, scene-transition and visibility handlers.
2. Place `SoftArcadeMusic.js` in the most appropriate existing audio/music/effects module location. Preserve the project's naming conventions and module format.
3. Instantiate exactly one long-lived `SoftArcadeMusic` instance. Do not recreate it on every frame, level, scene or UI render.
4. Start the music only from an explicit user interaction because browsers may block audio before a user gesture.
5. Preserve seamless looping through the module's Web Audio look-ahead scheduler. Do not replace it with `setTimeout`-based note timing and do not restart the music at the 60-second boundary.
6. Connect the music to existing settings where available:
   - music enabled/disabled;
   - music volume;
   - master mute;
   - saved preferences.
7. Add click-safe control methods for start, stop with fade, and volume. Repeated calls must not create overlapping music instances.
8. Match existing game lifecycle behaviour:
   - Start/Continue: start or resume the music.
   - Music disabled: fade and stop it.
   - Game pause: follow the existing project convention; either duck volume or suspend if all game audio pauses.
   - Game over/menu: keep, duck or fade according to the existing audio design.
   - Hidden browser tab: apply the project's existing visibility/audio policy.
9. Keep sound effects independent. Do not route collision, reward, particle or UI effects through the music instance.
10. Do not alter unrelated game logic, animation timing, rendering, scoring or balance.

## Seamless-loop acceptance criteria
- One musical cycle is exactly 60 seconds: 24 bars at 96 BPM in 4/4.
- The next cycle is scheduled in advance on the same `AudioContext` timeline.
- There is no stop/start operation at the loop boundary.
- No audible gap, duplicate downbeat or accumulating drift appears after at least five complete cycles.
- Toggling music repeatedly never produces stacked playback.
- Volume changes are smoothed to avoid clicks.

## Validation
- Run the project using its normal development command.
- Check the browser console for errors and Web Audio autoplay warnings.
- Test Start, Pause, Continue, Game Over, music toggle, volume, tab hide/show and scene changes.
- Let the loop run for at least five cycles and confirm that boundaries are inaudible and timing remains stable.

## Delivery
Return:
1. a concise summary of the integration;
2. a file tree showing added and modified files;
3. the full final content of every added file;
4. focused diffs or clearly marked changed sections for existing files;
5. any assumptions made about lifecycle or settings behaviour.
