// Embedded fallback so the overlay NEVER goes fully blank (only a header,
// no CPU/RAM) just because the persisted config on disk predates a key this
// build expects. If config.overlay.themes/widgets is missing or malformed,
// these are used instead of throwing.
const FALLBACK_THEME = {
  id: 'minimal-dark', name: 'Minimal Dark',
  background: 'rgba(13,13,13,0.82)', accent: '#7c5cff', text: '#ffffff',
  border: '1px solid rgba(255,255,255,0.08)', cornerRadius: 10, animatedBorder: false,
};
const FALLBACK_WIDGETS = [
  { id: 'fps', label: 'FPS', enabled: true, order: 0 },
  { id: 'cpu', label: 'CPU', enabled: true, order: 1 },
  { id: 'gpu', label: 'GPU', enabled: true, order: 2 },
  { id: 'ram', label: 'RAM', enabled: true, order: 3 },
  { id: 'bottleneck', label: 'Bottleneck', enabled: true, order: 4 },
];

(async function initOverlay() {
  const widgetsEl = document.getElementById('widgets');
  let rowEls = {};
  let bottleneckBox = null;

  // -------------------------------------------------------------------
  // Register listeners FIRST, before any rendering that touches config -
  // if rendering throws (bad/missing config), edit-mode and stats
  // updates still keep working instead of silently going dead.
  // -------------------------------------------------------------------
  window.rhys.onOverlayEditMode((enabled) => {
    document.body.classList.toggle('edit-mode', enabled);
  });

  window.rhys.onStatsUpdate((snapshot) => {
    applyStats(snapshot);
  });

  window.rhys.onConfigUpdated((fullConfig) => {
    render(fullConfig);
  });

  function levelFor(pct) {
    if (pct === null || pct === undefined) return null;
    if (pct >= 90) return 'crit';
    if (pct >= 75) return 'warn';
    return null;
  }

  function setValue(id, text, level) {
    const el = rowEls[id];
    if (!el) return;
    el.textContent = text;
    el.classList.remove('warn', 'crit');
    if (level) el.classList.add(level);
  }

  function applyStats(snapshot) {
    if (rowEls.fps) setValue('fps', `${snapshot.fps}${snapshot.fpsSimulated ? '*' : ''}`, snapshot.fps < 45 ? 'warn' : null);
    if (rowEls.frametime) setValue('frametime', `${snapshot.frameTimeMs} ms`);
    if (rowEls.cpu) setValue('cpu', `${snapshot.cpu.usagePct ?? '--'}%`, levelFor(snapshot.cpu.usagePct));
    if (rowEls.gpu) setValue('gpu', `${snapshot.gpu.usagePct ?? '--'}%`, levelFor(snapshot.gpu.usagePct));
    if (rowEls.ram) setValue('ram', `${snapshot.ram.usagePct ?? '--'}%`, levelFor(snapshot.ram.usagePct));
    if (rowEls.vram && snapshot.gpu.vramTotalMB) {
      const pct = Math.round((snapshot.gpu.vramUsedMB / snapshot.gpu.vramTotalMB) * 100);
      setValue('vram', `${snapshot.gpu.vramUsedMB}MB (${pct}%)`, levelFor(pct));
    }
    if (rowEls.temp_cpu) setValue('temp_cpu', snapshot.cpu.tempC ? `${snapshot.cpu.tempC}°C` : 'n/a');
    if (rowEls.temp_gpu) setValue('temp_gpu', snapshot.gpu.tempC ? `${snapshot.gpu.tempC}°C` : 'n/a');
    if (rowEls.net) setValue('net', `${(snapshot.network.bytesPerSec / 1024).toFixed(0)} KB/s`);
    if (bottleneckBox && snapshot.bottleneck) {
      bottleneckBox.textContent = `${snapshot.bottleneck.verdict.toUpperCase()} (${snapshot.bottleneck.confidencePct}%) - ${snapshot.bottleneck.suggestion}`;
    }
  }

  function applyTheme(themes, activeId) {
    const list = Array.isArray(themes) && themes.length ? themes : [FALLBACK_THEME];
    const theme = list.find((t) => t.id === activeId) || list[0];
    const root = document.documentElement.style;
    root.setProperty('--bg', theme.background);
    root.setProperty('--accent', theme.accent);
    root.setProperty('--text', theme.text);
    root.setProperty('--radius', `${theme.cornerRadius}px`);
    root.setProperty('--border', theme.border || 'none');
    root.setProperty('--glow', theme.glow || 'none');
    root.setProperty('--text-shadow', theme.textShadow || 'none');
    document.body.classList.toggle('theme-animated-border', !!theme.animatedBorder);
  }

  function buildWidgets(widgetConfig) {
    const list = Array.isArray(widgetConfig) && widgetConfig.length ? widgetConfig : FALLBACK_WIDGETS;
    widgetsEl.innerHTML = '';
    rowEls = {};
    bottleneckBox = null;

    const enabled = [...list].filter((w) => w.enabled).sort((a, b) => a.order - b.order);
    enabled.forEach((w) => {
      if (w.id === 'bottleneck') return;
      const row = document.createElement('div');
      row.className = 'widget-row';
      row.innerHTML = `<span class="label">${w.label}</span><span class="value" id="val-${w.id}">--</span>`;
      widgetsEl.appendChild(row);
      rowEls[w.id] = row.querySelector('.value');
    });

    if (enabled.some((w) => w.id === 'bottleneck')) {
      bottleneckBox = document.createElement('div');
      bottleneckBox.className = 'bottleneck-box';
      bottleneckBox.textContent = 'Gathering data...';
      widgetsEl.appendChild(bottleneckBox);
    }
  }

  function render(config) {
    const overlayCfg = (config && config.overlay) || {};
    try {
      applyTheme(overlayCfg.themes, overlayCfg.activeTheme);
    } catch (err) {
      console.error('[overlay] theme render failed, using fallback:', err);
      applyTheme([FALLBACK_THEME], FALLBACK_THEME.id);
    }
    try {
      buildWidgets(overlayCfg.widgets);
    } catch (err) {
      console.error('[overlay] widget render failed, using fallback:', err);
      buildWidgets(FALLBACK_WIDGETS);
    }
  }

  const config = await window.rhys.getConfig();
  render(config);
})();
