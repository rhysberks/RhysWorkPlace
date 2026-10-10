const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rhys', {
  // config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  onConfigUpdated: (callback) => {
    const listener = (_e, fullConfig) => callback(fullConfig);
    ipcRenderer.on('config:updated', listener);
    return () => ipcRenderer.removeListener('config:updated', listener);
  },

  // live stats (pushed to both overlay and main window)
  onStatsUpdate: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on('stats-update', listener);
    return () => ipcRenderer.removeListener('stats-update', listener);
  },

  // overlay control
  setOverlayEditMode: (enabled) => ipcRenderer.invoke('overlay:set-edit-mode', enabled),
  showOverlay: () => ipcRenderer.invoke('overlay:show'),
  hideOverlay: () => ipcRenderer.invoke('overlay:hide'),
  onOverlayEditMode: (callback) => {
    const listener = (_e, enabled) => callback(enabled);
    ipcRenderer.on('overlay:edit-mode', listener);
    return () => ipcRenderer.removeListener('overlay:edit-mode', listener);
  },

  // specs + recommendations
  getSpecs: () => ipcRenderer.invoke('system:get-specs'),
  getRecommendations: () => ipcRenderer.invoke('system:get-recommendations'),

  // ollama model management
  ollamaIsRunning: () => ipcRenderer.invoke('ollama:is-running'),
  listModels: () => ipcRenderer.invoke('ollama:list-models'),
  pullModel: (modelName) => ipcRenderer.send('ollama:pull-model', modelName),
  onPullProgress: (callback) => {
    const listener = (_e, data) => callback(data);
    ipcRenderer.on('ollama:pull-progress', listener);
    return () => ipcRenderer.removeListener('ollama:pull-progress', listener);
  },
  onPullDone: (callback) => {
    const listener = (_e, data) => callback(data);
    ipcRenderer.on('ollama:pull-done', listener);
    return () => ipcRenderer.removeListener('ollama:pull-done', listener);
  },
  onPullError: (callback) => {
    const listener = (_e, data) => callback(data);
    ipcRenderer.on('ollama:pull-error', listener);
    return () => ipcRenderer.removeListener('ollama:pull-error', listener);
  },

  // API keys (set-only from renderer; "has" tells you if one exists)
  setApiKey: (provider, key) => ipcRenderer.invoke('apikeys:set', { provider, key }),
  hasApiKey: (provider) => ipcRenderer.invoke('apikeys:has', provider),

  // unified chat
  sendChat: (provider, messages, model) => ipcRenderer.send('chat:send', { provider, messages, model }),
  onChatChunk: (callback) => {
    const listener = (_e, chunk) => callback(chunk);
    ipcRenderer.on('chat:chunk', listener);
    return () => ipcRenderer.removeListener('chat:chunk', listener);
  },
  onChatDone: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('chat:done', listener);
    return () => ipcRenderer.removeListener('chat:done', listener);
  },
});
