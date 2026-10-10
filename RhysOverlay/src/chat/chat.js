(async function initChat() {
  const messagesEl = document.getElementById('messages');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');
  const modelSelect = document.getElementById('model-select');

  const history = [];

  const models = await window.rhys.listModels();
  if (models.length) {
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      modelSelect.appendChild(opt);
    });
  } else {
    addSystemMessage('No local Ollama models found. Make sure Ollama is running (ollama serve) and you have pulled a model (e.g. "ollama pull llama3.1").');
  }

  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function addSystemMessage(text) {
    addMessage('system', text);
  }

  let removeChunkListener = null;
  let removeDoneListener = null;

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';

    addMessage('user', text);
    history.push({ role: 'user', content: text });

    const assistantBubble = addMessage('assistant', '');
    let assistantText = '';

    if (removeChunkListener) removeChunkListener();
    if (removeDoneListener) removeDoneListener();

    removeChunkListener = window.rhys.onChatChunk((chunk) => {
      if (chunk.error) {
        assistantBubble.textContent = `⚠ ${chunk.error}`;
        return;
      }
      assistantText += chunk.text;
      assistantBubble.textContent = assistantText;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });

    removeDoneListener = window.rhys.onChatDone(() => {
      history.push({ role: 'assistant', content: assistantText });
    });

    window.rhys.sendChat(history, modelSelect.value || undefined);
  });
})();
