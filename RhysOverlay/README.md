# RhysOverlay

A customizable in-game performance overlay (FPS, CPU/GPU/RAM/VRAM/temps) with
a bottleneck advisor, plus a unified app with a local Ollama chat (or
OpenAI/Anthropic via API key), model management, and a theme-able overlay
control panel.

## ⚠ If you ran an earlier version

Two real bugs, both fixed at the root this time:

**1. The CPU/frame-drop bug.** The overlay window was using the most
aggressive `alwaysOnTop` level (`'screen-saver'`) combined with
`backdrop-filter: blur()` on a transparent, click-through window updating
every second. On many GPU/driver combinations that exact combination makes
Chromium's compositor fight with the OS window manager — 100% CPU and other
windows freezing until refocus is the classic symptom. Fixed via `'floating'`
level and removing blur everywhere in the overlay (solid/`rgba()`
backgrounds + `box-shadow` glow instead).

**2. "Only the title shows, no CPU/RAM, dragging does nothing."** This
version added new config keys (`overlay.themes`, `overlay.activeTheme`,
the `chat` section, etc). Electron's config store only fills in defaults
for a file that doesn't exist yet — it does **not** retroactively add new
keys to a config you already have saved on disk from an earlier run. So the
overlay script hit `undefined` reading `overlay.themes`, threw, and every
line of JS after that (building the widget rows, wiring up drag-to-reposition)
never ran. **You don't need to do anything** — this version self-heals your
existing config on launch (fills in only what's missing, keeps every
customization you already made). If you ever want a fully clean slate
anyway, the config file lives at your OS's standard app-data path under
`rhysoverlay-config.json`.

## What's new in this version

- **Config self-heal** — see above; fixes themes/widgets/dragging silently
  breaking on upgrade.
- **Live-applying settings** — changing a theme, toggling a widget, or
  dragging the refresh-rate slider now updates the overlay immediately, no
  restart needed (previously the overlay only read config once at launch).
- **Smooth page transitions** — Chat/Overlay/Settings crossfade instead of
  snapping, and the splash → app transition fades instead of cutting.
- **Smooth buttons** — hover/press states on every button and theme card
  now animate (lift on hover, settle on click) instead of switching instantly.
- **Persistent animated background** — the drifting purple/blue gradient
  from the splash now continues (muted) behind the sidebar/content once
  you're in the app, instead of the app going flat solid-black.
- **Overlay page** — toggle each widget on/off, drag-to-reposition (click
  "Adjust position", drag the overlay's title bar anywhere on screen, click
  "Lock position" when done), refresh rate slider, and a theme gallery:
  Minimal Dark, Borderless, Black, White, Purple Glow, and Animated Border
  (a rotating gradient ring — cheap, transform-only, no blur).

## Project layout

```
RhysOverlay/
  main.js                    Electron main: app window, overlay window, tray, hotkeys, all IPC
  preload.js                 Safe bridge exposed to renderers as window.rhys
  config/default-config.json Widgets, themes, hotkeys, provider settings
  src/
    lib/
      stats.js               Polls systeminformation each tick
      fps.js                 PresentMon wrapper + simulated fallback
      bottleneck.js          Rolling-average heuristics -> verdict + suggestion
      ollama.js              List installed models, pull new ones (CLI, streamed progress)
      chatProviders.js       Unified streaming chat: Ollama / OpenAI / Anthropic
      secureStore.js         API key storage via Electron safeStorage
      specs.js               One-time static hardware detection (CPU/RAM/GPU/VRAM)
      recommend.js           Maps detected specs -> suggested local models
    overlay/                 The in-game HUD (transparent, click-through, themeable)
    app/                     The main window: splash + Chat/Overlay/Settings pages
```

## Getting started

```bash
npm install
npm start
```

Default hotkeys (`config/default-config.json` → `overlay.hotkeys`):
- `Alt+O` — show/hide overlay
- `Alt+L` — toggle click-through
- `Alt+C` — bring the main app window to front
- `Alt+P` — toggle "adjust position" mode on the overlay

## Using local chat

1. Install [Ollama](https://ollama.com) and run `ollama serve` (or run the
   Ollama desktop app).
2. Open the app → Chat page → "Get more models" shows recommendations based
   on your detected RAM/VRAM, or type any model name to pull it directly.
3. Pick the model from the dropdown and chat — responses stream in.

To use OpenAI or Anthropic instead: Settings page → paste your API key →
switch the provider dropdown on the Chat page.

## Known limitations (still true, being honest about it)

- **FPS is simulated** until a PresentMon binary is wired up — see the
  comment block at the top of `src/lib/fps.js`.
- **GPU usage/VRAM via `systeminformation`** is best-effort and
  vendor-dependent on Windows. If it's consistently `null`, the next step
  is a small **LibreHardwareMonitor** C# sidecar dumping JSON that Node
  reads — the same approach most Windows monitoring tools use.
- **Overlay works via window layering**, so it renders over
  borderless/windowed games correctly. True exclusive-fullscreen DirectX
  games need a DXGI/present hook — a bigger native undertaking, good v2
  milestone.
- API keys are encrypted at rest when your OS supports it, but this is
  still a desktop app storing local secrets — treat it like any other
  local credential store.

## Suggested next milestones

1. Wire a real PresentMon binary and confirm live FPS numbers.
2. Add the LibreHardwareMonitor sidecar for accurate GPU stats/temps.
3. Package with `electron-builder` (`npm run dist`) for a distributable
   Windows installer.
4. GitHub Actions workflow for build + release on tag push.
