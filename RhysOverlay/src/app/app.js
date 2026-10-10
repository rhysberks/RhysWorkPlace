(async function initApp() {
  let config = await window.rhys.getConfig();
  const history = [];

  // ---------------------------------------------------------------------
  // Splash -> App shell (smooth crossfade, not an instant display swap)
  // ---------------------------------------------------------------------
  const splash = document.getElementById('view-splash');
  const appView = document.getElementById('view-app');

  function enterApp() {
    appView.classList.remove('hidden');
    appView.classList.add('view-fade-out'); // start transparent, then fade in
    // eslint-disable-next-line no-unused-expressions
    appView.offsetHeight; // force reflow so the transition actually plays
    appView.classList.remove('view-fade-out');
    splash.classList.add('view-fade-out');
    setTimeout(() => splash.classList.add('hidden'), 380);
  }

  document.getElementById('enter-app-btn').addEventListener('click', () => {
    enterApp();
    if (!config.onboarded) window.rhys.setConfig({ onboarded: true });
  });
  if (config.onboarded) {
    splash.classList.add('hidden');
    appView.classList.remove('hidden');
  }

  // Keep the local config snapshot in sync if it changes elsewhere (e.g. a
  // global hotkey toggling click-through directly in the main process).
  window.rhys.onConfigUpdated((fullConfig) => { config = fullConfig; });

  // ---------------------------------------------------------------------
  // Sidebar navigation
  // ---------------------------------------------------------------------
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`page-${btn.dataset.page}`).classList.add('active');
    });
  });

  // ---------------------------------------------------------------------
  // Specs + recommendations
  // ---------------------------------------------------------------------
  const specs = await window.rhys.getSpecs();
  document.getElementById('specs-summary').textContent =
    `${specs.cpuModel} · ${specs.ramGB ?? '?'}GB RAM · ${specs.gpuModel}`;

  const specsListEl = document.getElementById('specs-list');
  specsListEl.innerHTML = `
    <li><span>CPU</span><span>${specs.cpuModel} (${specs.cpuCores ?? '?'} cores)</span></li>
    <li><span>RAM</span><span>${specs.ramGB ?? '?'} GB</span></li>
    <li><span>GPU</span><span>${specs.gpuModel}</span></li>
    <li><span>VRAM</span><span>${specs.vramGB ? specs.vramGB + ' GB' : 'Unknown'}</span></li>
  `;

  const recs = await window.rhys.getRecommendations();
  const recommendBanner = document.getElementById('recommend-banner');
  recommendBanner.textContent = `Recommended for your PC (${recs.basedOn}): ${recs.models.map((m) => m.name).join(', ')}`;
  recommendBanner.classList.remove('hidden');

  // ---------------------------------------------------------------------
  // Chat page
  // ---------------------------------------------------------------------
  const providerSelect = document.getElementById('provider-select');
  const modelSelect = document.getElementById('model-select');
  const modelCustom = document.getElementById('model-custom');
  const messagesEl = document.getElementById('messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  providerSelect.value = config.chat.provider;

  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  async function refreshModelChoices() {
    const provider = providerSelect.value;
    modelSelect.innerHTML = '';
    modelCustom.classList.add('hidden');
    modelSelect.classList.remove('hidden');

    if (provider === 'ollama') {
      const running = await window.rhys.ollamaIsRunning();
      if (!running) {
        addMessage('system', 'Ollama does not seem to be running. Start it (or the Ollama desktop app) to chat locally.');
      }
      const models = await window.rhys.listModels();
      if (!models.length) {
        addMessage('system', 'No local models installed yet. Click "Get more models" to install one.');
      }
      models.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.name;
        modelSelect.appendChild(opt);
      });
    } else if (provider === 'anthropic') {
      [
        ['claude-sonnet-5', 'Claude Sonnet 5'],
        ['claude-opus-5', 'Claude Opus 5'],
        ['claude-haiku-4-5-20251001', 'Claude Haiku 4.5'],
      ].forEach(([value, label]) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        modelSelect.appendChild(opt);
      });
      const hasKey = await window.rhys.hasApiKey('anthropic');
      if (!hasKey) addMessage('system', 'No Anthropic API key set yet. Add one in Settings.');
    } else if (provider === 'openai') {
      modelSelect.classList.add('hidden');
      modelCustom.classList.remove('hidden');
      modelCustom.value = config.chat.openai.model || 'gpt-4o-mini';
      const hasKey = await window.rhys.hasApiKey('openai');
      if (!hasKey) addMessage('system', 'No OpenAI API key set yet. Add one in Settings.');
    }
  }

  providerSelect.addEventListener('change', () => {
    window.rhys.setConfig({ 'chat.provider': providerSelect.value });
    refreshModelChoices();
  });

  await refreshModelChoices();

  let removeChunk = null;
  let removeDone = null;

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';

    addMessage('user', text);
    history.push({ role: 'user', content: text });

    const bubble = addMessage('assistant', '');
    let assistantText = '';

    if (removeChunk) removeChunk();
    if (removeDone) removeDone();

    removeChunk = window.rhys.onChatChunk((chunk) => {
      if (chunk.error) { bubble.textContent = `⚠ ${chunk.error}`; return; }
      assistantText += chunk.text;
      bubble.textContent = assistantText;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
    removeDone = window.rhys.onChatDone(() => {
      history.push({ role: 'assistant', content: assistantText });
    });

    const provider = providerSelect.value;
    const model = provider === 'openai' ? modelCustom.value.trim() : modelSelect.value;
    window.rhys.sendChat(provider, history, model);
  });

  // ---------------------------------------------------------------------
  // Model picker modal ("Get more models")
  // ---------------------------------------------------------------------
  const modelModal = document.getElementById('model-modal');
  const modelModalBody = document.getElementById('model-modal-body');

  document.getElementById('get-more-models-btn').addEventListener('click', async () => {
    modelModal.classList.remove('hidden');
    modelModalBody.innerHTML = '<p class="hint">Loading recommendations...</p>';
    const r = await window.rhys.getRecommendations();
    modelModalBody.innerHTML = `
      <div class="model-tier">
        <div class="model-tier-label">${r.tierLabel} — based on ${r.basedOn}</div>
        ${r.models.map((m) => modelRowHtml(m)).join('')}
      </div>
      <div class="model-tier">
        <div class="model-tier-label">Or install a specific model by name</div>
        <div class="model-row">
          <input type="text" id="custom-model-name" placeholder="e.g. deepseek-coder:6.7b" style="flex:1;background:#111;border:1px solid #333;color:#eee;border-radius:6px;padding:6px 8px;" />
          <button class="ghost-btn" id="custom-pull-btn">Pull</button>
        </div>
      </div>
    `;
    modelModalBody.querySelectorAll('.pull-btn').forEach((btn) => {
      btn.addEventListener('click', () => startPull(btn.dataset.model, btn));
    });
    document.getElementById('custom-pull-btn').addEventListener('click', () => {
      const name = document.getElementById('custom-model-name').value.trim();
      if (name) startPull(name, document.getElementById('custom-pull-btn'));
    });
  });

  document.getElementById('close-model-modal').addEventListener('click', () => {
    modelModal.classList.add('hidden');
  });

  function modelRowHtml(m) {
    return `
      <div class="model-row" id="row-${cssSafe(m.name)}">
        <div>
          <div>${m.name}</div>
          <span class="note">${m.note}</span>
          <div class="pull-progress" id="progress-${cssSafe(m.name)}"></div>
        </div>
        <button class="ghost-btn pull-btn" data-model="${m.name}">Pull</button>
      </div>
    `;
  }

  function cssSafe(s) { return s.replace(/[^a-zA-Z0-9]/g, '-'); }

  function startPull(modelName, triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = 'Pulling...';
    window.rhys.pullModel(modelName);
  }

  window.rhys.onPullProgress(({ model, status, percent }) => {
    const el = document.getElementById(`progress-${cssSafe(model)}`);
    if (el) el.textContent = percent !== null ? `${status} (${percent}%)` : status;
  });
  window.rhys.onPullDone(async ({ model }) => {
    const el = document.getElementById(`progress-${cssSafe(model)}`);
    if (el) el.textContent = 'Installed ✓';
    await refreshModelChoices();
  });
  window.rhys.onPullError(({ model, error }) => {
    const el = document.getElementById(`progress-${cssSafe(model)}`);
    if (el) el.textContent = `Failed: ${error}`;
  });

  // ---------------------------------------------------------------------
  // Overlay page
  // ---------------------------------------------------------------------
  const widgetListEl = document.getElementById('widget-toggle-list');
  const widgets = [...config.overlay.widgets].sort((a, b) => a.order - b.order);
  widgets.forEach((w) => {
    const row = document.createElement('div');
    row.className = 'widget-toggle';
    row.innerHTML = `<input type="checkbox" id="w-${w.id}" ${w.enabled ? 'checked' : ''} />
                      <label for="w-${w.id}">${w.label}</label>`;
    row.querySelector('input').addEventListener('change', (e) => {
      // Mutate the shared `widgets` array in place (not a fresh .map() off
      // a stale reference) so toggling several widgets in the same session
      // accumulates correctly instead of each change reverting the last.
      const target = widgets.find((x) => x.id === w.id);
      if (target) target.enabled = e.target.checked;
      window.rhys.setConfig({ 'overlay.widgets': widgets });
    });
    widgetListEl.appendChild(row);
  });

  let editing = false;
  const adjustBtn = document.getElementById('adjust-position-btn');
  adjustBtn.addEventListener('click', () => {
    editing = !editing;
    if (editing) window.rhys.showOverlay();
    window.rhys.setOverlayEditMode(editing);
    adjustBtn.textContent = editing ? 'Lock position' : 'Adjust position';
  });

  const refreshSlider = document.getElementById('refresh-rate');
  const refreshLabel = document.getElementById('refresh-rate-label');
  refreshSlider.value = config.overlay.refreshRateMs;
  refreshLabel.textContent = `${config.overlay.refreshRateMs} ms`;
  refreshSlider.addEventListener('input', () => {
    refreshLabel.textContent = `${refreshSlider.value} ms`;
  });
  refreshSlider.addEventListener('change', () => {
    window.rhys.setConfig({ 'overlay.refreshRateMs': parseInt(refreshSlider.value, 10) });
  });

  const themeGallery = document.getElementById('theme-gallery');
  config.overlay.themes.forEach((theme) => {
    const card = document.createElement('div');
    card.className = 'theme-card' + (theme.id === config.overlay.activeTheme ? ' selected' : '');
    card.innerHTML = `
      <div class="theme-swatch" style="background:${theme.background === 'transparent' ? '#222' : theme.background}; border:1px solid ${theme.accent};"></div>
      ${theme.name}
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('.theme-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      window.rhys.setConfig({ 'overlay.activeTheme': theme.id });
    });
    themeGallery.appendChild(card);
  });

  // ---------------------------------------------------------------------
  // Settings page
  // ---------------------------------------------------------------------
  async function refreshKeyStatus(provider, statusEl) {
    const has = await window.rhys.hasApiKey(provider);
    statusEl.textContent = has ? 'Key saved ✓' : '';
  }
  const openaiStatus = document.getElementById('openai-key-status');
  const anthropicStatus = document.getElementById('anthropic-key-status');
  refreshKeyStatus('openai', openaiStatus);
  refreshKeyStatus('anthropic', anthropicStatus);

  document.getElementById('save-openai-key').addEventListener('click', async () => {
    const val = document.getElementById('openai-key').value.trim();
    await window.rhys.setApiKey('openai', val);
    document.getElementById('openai-key').value = '';
    refreshKeyStatus('openai', openaiStatus);
  });
  document.getElementById('save-anthropic-key').addEventListener('click', async () => {
    const val = document.getElementById('anthropic-key').value.trim();
    await window.rhys.setApiKey('anthropic', val);
    document.getElementById('anthropic-key').value = '';
    refreshKeyStatus('anthropic', anthropicStatus);
  });

  const hotkeyListEl = document.getElementById('hotkey-list');
  const hk = config.overlay.hotkeys;
  hotkeyListEl.innerHTML = `
    <li><span>Toggle overlay</span><kbd>${hk.toggleOverlay}</kbd></li>
    <li><span>Toggle click-through</span><kbd>${hk.toggleClickThrough}</kbd></li>
    <li><span>Show this app</span><kbd>${hk.toggleApp}</kbd></li>
    <li><span>Adjust overlay position</span><kbd>${hk.adjustPosition}</kbd></li>
  `;
})();
