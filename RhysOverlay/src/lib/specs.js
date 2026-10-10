const si = require('systeminformation');

async function getSpecs() {
  const [cpu, mem, graphics] = await Promise.all([
    si.cpu().catch(() => null),
    si.mem().catch(() => null),
    si.graphics().catch(() => null),
  ]);

  const gpu = graphics && graphics.controllers && graphics.controllers[0]
    ? graphics.controllers[0]
    : null;

  return {
    cpuModel: cpu ? `${cpu.manufacturer} ${cpu.brand}`.trim() : 'Unknown CPU',
    cpuCores: cpu ? cpu.cores : null,
    ramGB: mem ? Math.round(mem.total / 1e9) : null,
    gpuModel: gpu ? gpu.model : 'Unknown / no discrete GPU detected',
    vramGB: gpu && gpu.vram ? Number((gpu.vram / 1024).toFixed(1)) : null,
  };
}

module.exports = { getSpecs };
