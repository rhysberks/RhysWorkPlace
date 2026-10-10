/**
 * FPS capture module.
 *
 * True in-game FPS requires reading frame-present events, which Electron/Node
 * cannot do on their own. The standard open-source way tools like CapFrameX
 * and RTSS get this data is via Intel's PresentMon, a small command-line
 * capture tool that logs frame times to CSV/stdout without needing a full
 * DirectX hook of your own.
 *
 * This module spawns PresentMon (if a path is configured and it exists),
 * parses its streaming output, and reports fps + frame time. If PresentMon
 * isn't configured/available, it falls back to a simulated value so the rest
 * of the app (layout, bottleneck logic, UI) can be built and tested without
 * needing PresentMon set up yet.
 *
 * Swap this module out later for a real hook (e.g. a small native addon or
 * a bundled PresentMon binary) without touching the rest of the app - every
 * consumer just calls fps.read().
 */

const { spawn } = require('child_process');
const fs = require('fs');

class FpsSource {
  constructor(config = {}) {
    this.config = config;
    this.latest = { fps: 0, frameTimeMs: 0, simulated: true };
    this.proc = null;

    if (config.source === 'presentmon' && config.presentMonPath && fs.existsSync(config.presentMonPath)) {
      this._startPresentMon(config.presentMonPath);
    }
  }

  _startPresentMon(binPath) {
    try {
      // Example invocation; adjust flags to the PresentMon version you bundle.
      // PresentMon.exe -output_stdout -terminate_on_proc_exit
      this.proc = spawn(binPath, ['-output_stdout']);
      this.proc.stdout.on('data', (buf) => this._parseLine(buf.toString()));
      this.proc.on('exit', () => { this.proc = null; });
    } catch (err) {
      console.error('[fps] Failed to start PresentMon, falling back to simulated FPS:', err.message);
      this.proc = null;
    }
  }

  _parseLine(line) {
    // PresentMon CSV columns include MsBetweenPresents - real parsing depends
    // on the exact PresentMon build/version you ship. This is a placeholder
    // that should be adapted to the actual column layout you configure.
    const match = line.match(/MsBetweenPresents,([0-9.]+)/);
    if (match) {
      const frameTimeMs = parseFloat(match[1]);
      this.latest = {
        fps: frameTimeMs > 0 ? Math.round(1000 / frameTimeMs) : 0,
        frameTimeMs: Number(frameTimeMs.toFixed(2)),
        simulated: false,
      };
    }
  }

  read() {
    if (this.proc) return this.latest;

    if (this.config.simulateIfUnavailable) {
      // Gentle simulated wander so the UI has something believable to render
      // during development on machines without PresentMon configured.
      const base = 90;
      const noise = Math.round((Math.random() - 0.5) * 20);
      const fps = Math.max(30, base + noise);
      return { fps, frameTimeMs: Number((1000 / fps).toFixed(2)), simulated: true };
    }

    return { fps: 0, frameTimeMs: 0, simulated: true, unavailable: true };
  }

  stop() {
    if (this.proc) this.proc.kill();
  }
}

module.exports = FpsSource;
