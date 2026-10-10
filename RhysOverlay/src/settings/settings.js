(async function initSettings() {
  const widgetListEl = document.getElementById('widget-list');
  const accentColor = document.getElementById('accent-color');
  const opacity = document.getElementById('opacity');
  const fontSize = document.getElementById('font-size');
  const refreshRate = document.getElementById('refresh-rate');
  const saveBtn = document.getElementById('save');
  const status = document.getElementById('status');

  const config = await window.rhys.getConfig();
  const widgets = [...config.overlay.widgets].sort((a, b) => a.order - b.order);

  widgets.forEach((w) => {
    const row = document.createElement('div');
    row.className = 'widget-toggle';
    row.innerHTML = `
      <input type="checkbox" id="w-${w.id}" ${w.enabled ? 'checked' : ''} />
      <label for="w-${w.id}">${w.label}</label>
    `;
    widgetListEl.appendChild(row);
  });

  accentColor.value = config.overlay.theme.accent;
  opacity.value = config.overlay.opacity;
  fontSize.value = config.overlay.theme.fontSize;
  refreshRate.value = config.overlay.refreshRateMs;

  saveBtn.addEventListener('click', async () => {
    const updatedWidgets = widgets.map((w) => ({
      ...w,
      enabled: document.getElementById(`w-${w.id}`).checked,
    }));

    await window.rhys.setConfig({
      'overlay.widgets': updatedWidgets,
      'overlay.opacity': parseFloat(opacity.value),
      'overlay.theme.accent': accentColor.value,
      'overlay.theme.fontSize': parseInt(fontSize.value, 10),
      'overlay.refreshRateMs': parseInt(refreshRate.value, 10),
    });

    status.textContent = 'Saved. Restart RhysOverlay for widget/refresh-rate changes to fully apply.';
    setTimeout(() => { status.textContent = ''; }, 4000);
  });
})();
