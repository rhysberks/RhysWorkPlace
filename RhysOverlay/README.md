# Rhys Overlay

An in-game overlay FPS, CPU/GPU/RAM/VRAM/temps (per process) customizable with
A bottleneck advisor, and a common app with a local Ollama chat (or

OpenAI/Anthropic through API key), Manage Models, & Theme-able Overlay

control panel.

If you ran an earlier version

Two real bugs, both fixed at the root this time:

The CPU/frame-drop bug. In this case, the overlay window was used at the most
aggressive alwaysOnTop level ('screen-saver') combined with
Blur() backdrop-filter on clear, clickthrough window update
Clicks every second. On many GPU/driver combinations that specific combo makes.
Chromium's compositing battle with the OS window manager - 100% CPU and more.
Windows freezing until refocus the classic symptom fixed by `floating''
Interval, and clearing blur throughout overlay (solid/rgba().
Backgrounds + box-shadow glow instead).

2. "Only the title appears, not the CPU/RAM, so dragging is pointless." This
version added new config keys (overlay.themes, overlay.activeTheme,
Other knowledge (e.g. The chat section, etc).electron's config store is just setting defaults
For a file that doesn't exist yet - it will not add to it retroactively.
Keys to a config you already have saved on disk from an earlier run. So the
Overlay script hit undefined reading overlay.themes, throw, and, and, and, and, and.
Line of JS after that (building the widget rows, wiring up drag-to-reposition)
Failed to run. You don't have to do anything - this one self heals your.
Present in your version of config at launch (selects only those missed out of and retains everything)
Customization you already made). If you ever want a fully clean slate
Anyway, the config file lives at your OS's standard app-data path here:
rhysoverlay-config.json.

What's new in this version

- Config self-heal - see above - fixes themes/widgets/dragging silently
 breaking on upgrade.
- Live-applying effects - altering a theme, switching a widget, or
Dragging the refresh-rate slider updates the overlay now, no
Restart needed (formerly overlay only read config once at start).
- Page transitions - Chat/Overlay/Settings cross fade instead of Page transitions - Chat/Overlay/Settings crossfade instead of
Snap, while the transition to the splash app is a fade out instead of a cut out.
- Animated buttons - hover/press states on every button and theme card
Animate it now (lift on hover, settle on click) rather than switching it instantly.
- Persistent animated background - the drifting purple/blue gradient
Er, again, from the splash now continues (muted) behind the sidebar/for example once
You're in the app, rather than the app going completely solid black.
- Overlay page - toggle each widget on/off, drag-to-move (click
Change position: Drag the title bar of the overlay to any point on the screen. Click on.
"Lock position" when completed), slider for refresh rate and a theme gallery:

Minimal Dark, Borderless, Black, White, Purple Glow, and Animated Border

(a rotating gradient ring - cheap, transform-only, no blur).

Project layout

`

Rhys Overlay/

Main.js Electron main: app window, overlay window, tray, hotkeys, all IPC
Preload.js Secure bridge available to renderers as window.rhys
 config/default-config.json Widgets, themes, hotkeys, provider settings

src/

lib/

Stats.js polls systeminformation on every tick
 fps.js Present Mon wrapper + simulated fallback
 bottleneck.js Rolling-average heuristics -> verdict + suggestion
Ollama.js Listaa asennetut mallit, vedä uusia (CLI, striimattu edistyminen)

Chat Providers.js All-in-one streaming chat: Ollama / OpenAI / Anthropic

secureStore.js API key storage via Electron safeStorage
 specs.js One-time static hardware detection (CPU/RAM/GPU/VRAM)
Recommend.js Maps of detected specs -> recommended local models
 overlay/ The in-game HUD (transparent, click-through, themeable)
App/ The primary window: splash + Chat/Overlay/Settings pages

`

Getting started

`bash

npm install

npm start

`

Default hotkeys (config/default-config.json overlay.hotkeys):

- Alt+O – display/hide overlay
- Alt+L - enable or disable clickthrough
- Alt+C - Bring main app window to front
- Alt+P - switch overlay to „adjust position" mode

Local chat use

1. Install Ollama and run ollama serve (or run the

Ollama desktop app).

2. Open the app Chat page "Get more models" shows recommendations based

On your detected RAM/VRAM, or enter in any model name to search for it directly.
3. Select the model from the dropdown and chat - responses stream in.

OpenAI/Anthropic - Instead of Github Settings page Paste your API key

Add a cancel button to switch providers on the Chat page.

Known limitations (still true, still being honest about it)

- FPS is simulated until a Present Mon binary is wired up - see the
 comment block at the top of src/lib/fps.js.
- GPU utilization/VRAM via systeminformation – may be best effort and
Is null always on Windows. The next step if it's always null`
Is a small Libre Hardware Monitor C# sidecar dumping JSON that Node
Reads – the same methodology as most Windows monitoring tools.
- Overlay works through window layering.## Renders on top of.
 Borderless/windowed games correctly. True exclusive-fullscreen DirectX
I'll figure it out on games that require a DXGI/present hook, no native bigger activity, good v2
 milestone.
- API keys are encrypted at rest, but this is
Still a desktop app storing your local secrets – just treat it like any other
 local credential store.

Suggested next milestones

1. Wire up an actual Present Mon binary and verify live FPS numbers.
2. Add Libre Hardware Monitor sidecar for accurate GPU stats/temps.
3. Distribute with electron-builder (npm run dist)
 Windows installer.

4. Build + release on push tag (GitHub Actions workflow)
   
