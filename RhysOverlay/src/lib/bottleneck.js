/**
 * Heuristic bottleneck detector.
 *
 * Keeps a short rolling window of stats snapshots and classifies whether the
 * system is currently CPU-bound, GPU-bound, RAM-constrained, or balanced -
 * then attaches a plain-language upgrade suggestion. This is intentionally
 * simple and transparent (not a black box) so thresholds in config can be
 * tuned per-user or per-game later.
 */

class BottleneckEngine {
  constructor(config = {}) {
    this.config = {
      sampleWindowSeconds: 10,
      gpuBoundThreshold: 90,
      cpuBoundThreshold: 85,
      ramPressureThreshold: 85,
      lowUtilizationThreshold: 40,
      ...config,
    };
    this.window = [];
  }

  _pushSample(snapshot) {
    this.window.push(snapshot);
    const maxSamples = Math.max(1, this.config.sampleWindowSeconds);
    if (this.window.length > maxSamples) this.window.shift();
  }

  _average(key) {
    const values = this.window
      .map((s) => key(s))
      .filter((v) => typeof v === 'number' && !Number.isNaN(v));
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  analyze(snapshot) {
    this._pushSample(snapshot);

    const avgCpu = this._average((s) => s.cpu.usagePct);
    const avgGpu = this._average((s) => s.gpu.usagePct);
    const avgRam = this._average((s) => s.ram.usagePct);

    const { gpuBoundThreshold, cpuBoundThreshold, ramPressureThreshold, lowUtilizationThreshold } = this.config;

    let verdict = 'balanced';
    let confidencePct = 50;
    let suggestion = 'Your CPU, GPU, and RAM usage look balanced right now - no clear bottleneck.';

    if (avgGpu !== null && avgCpu !== null) {
      if (avgGpu >= gpuBoundThreshold && avgCpu < cpuBoundThreshold) {
        verdict = 'gpu-bound';
        confidencePct = Math.min(99, Math.round(avgGpu));
        suggestion = 'Your GPU is the limiting factor. Lowering in-game settings (resolution, shadows, ray tracing) or upgrading your GPU would give the biggest FPS gain.';
      } else if (avgCpu >= cpuBoundThreshold && avgGpu < gpuBoundThreshold) {
        verdict = 'cpu-bound';
        confidencePct = Math.min(99, Math.round(avgCpu));
        suggestion = 'Your CPU is the limiting factor. Lowering CPU-heavy settings (draw distance, physics, background apps) or upgrading your CPU/RAM speed would help most.';
      } else if (avgGpu >= gpuBoundThreshold && avgCpu >= cpuBoundThreshold) {
        verdict = 'both-maxed';
        confidencePct = Math.round((avgGpu + avgCpu) / 2);
        suggestion = 'Both CPU and GPU are heavily loaded. A well-balanced upgrade (or lowering overall settings) will help more than upgrading just one part.';
      } else if (avgGpu < lowUtilizationThreshold && avgCpu < lowUtilizationThreshold) {
        verdict = 'underutilized';
        confidencePct = 60;
        suggestion = 'Both CPU and GPU are lightly loaded - the game itself may be capping FPS, or something else (storage, background process) may be limiting performance.';
      }
    }

    if (avgRam !== null && avgRam >= ramPressureThreshold) {
      verdict = verdict === 'balanced' ? 'ram-pressure' : `${verdict}+ram-pressure`;
      suggestion += ' RAM usage is also high - closing background apps or adding more RAM could reduce stutter.';
    }

    return {
      verdict,
      confidencePct,
      suggestion,
      averages: {
        cpuPct: avgCpu !== null ? Math.round(avgCpu) : null,
        gpuPct: avgGpu !== null ? Math.round(avgGpu) : null,
        ramPct: avgRam !== null ? Math.round(avgRam) : null,
      },
      sampleCount: this.window.length,
    };
  }
}

module.exports = BottleneckEngine;
