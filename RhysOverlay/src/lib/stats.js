const si = require('systeminformation');
const FpsSource = require('./fps');

class StatsEngine {
  constructor(fpsConfig = {}) {
    this.fpsSource = new FpsSource(fpsConfig);
    this._lastNet = null;
  }

  async poll() {
    const [cpuLoad, mem, graphics, temps, netStats] = await Promise.all([
      si.currentLoad().catch(() => null),
      si.mem().catch(() => null),
      si.graphics().catch(() => null),
      si.cpuTemperature().catch(() => null),
      si.networkStats().catch(() => null),
    ]);

    const fps = this.fpsSource.read();

    const gpu = graphics && graphics.controllers && graphics.controllers[0]
      ? graphics.controllers[0]
      : null;

    const netTotal = Array.isArray(netStats)
      ? netStats.reduce((sum, n) => sum + (n.rx_sec || 0) + (n.tx_sec || 0), 0)
      : 0;

    return {
      timestamp: Date.now(),
      fps: fps.fps,
      frameTimeMs: fps.frameTimeMs,
      fpsSimulated: !!fps.simulated,
      cpu: {
        usagePct: cpuLoad ? Math.round(cpuLoad.currentLoad) : null,
        tempC: temps && temps.main !== -1 ? temps.main : null,
      },
      gpu: {
        usagePct: gpu && typeof gpu.utilizationGpu === 'number' ? gpu.utilizationGpu : null,
        tempC: gpu && typeof gpu.temperatureGpu === 'number' ? gpu.temperatureGpu : null,
        vramUsedMB: gpu && typeof gpu.memoryUsed === 'number' ? gpu.memoryUsed : null,
        vramTotalMB: gpu && typeof gpu.memoryTotal === 'number' ? gpu.memoryTotal : null,
        model: gpu ? gpu.model : 'Unknown GPU',
      },
      ram: {
        usedGB: mem ? Number((mem.active / 1e9).toFixed(1)) : null,
        totalGB: mem ? Number((mem.total / 1e9).toFixed(1)) : null,
        usagePct: mem ? Math.round((mem.active / mem.total) * 100) : null,
      },
      network: {
        bytesPerSec: Math.round(netTotal),
      },
    };
  }

  stop() {
    this.fpsSource.stop();
  }
}

module.exports = StatsEngine;
