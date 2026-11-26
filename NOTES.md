# Pomodoro

Open `index.html` in your browser (double-click it, or `xdg-open index.html`). No install, no build, no server.

- `index.html` (markup), `style.css` (themes and layout), `app.js` (timer, settings, sound, notifications), `scenes.js` (pixel-art progress scenes drawn on a canvas, no image files).
- Settings (gear icon): focus/break length; scene (Miner, Campfire, Plant, Mountain); font; appearance (Light, Dark, System); sound alarm; desktop notification; auto-start breaks; auto-start focus.
- The sun/moon icon switches between light and dark quickly. Space starts and pauses the timer.
- Drag or click the progress bar under the scene to jump within a session (handy for testing). When it has focus, the arrow keys and Home/End move it too.
- Focus end plays slow falling notes; break end plays quick rising notes. You can preview both in settings.
- Fonts (Settings → Font): Pixel = Pixelify Sans, Rounded = Nunito, Clean = Hanken Grotesk. All are SIL Open Font License (`fonts/*-OFL.txt`) and embedded in `fonts/*.css` so they work from file://.
- Settings and today's count are saved in the browser's localStorage, separately for each browser.

## Removed: super-productivity

I had cloned this into `external/super-productivity` (~290MB) and then deleted it to save space.

- Repo: https://github.com/super-productivity/super-productivity
- Cloned commit: `4225db13964216ca7eebf4083a17c368b342a456` (2026-11-24)
- To get it back without the full history (much smaller):
  `git clone --depth 1 https://github.com/super-productivity/super-productivity.git`
