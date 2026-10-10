/**
 * Provider-agnostic streaming chat client. The renderer never talks to any
 * of these APIs directly - it sends { provider, messages, model } over IPC
 * and gets { text } / { error } chunks streamed back, so API keys never
 * leave the main process.
 */

class ChatProviders {
  constructor({ ollamaBaseUrl, secureStore }) {
    this.ollamaBaseUrl = ollamaBaseUrl || 'http://localhost:11434';
    this.secureStore = secureStore;
  }

  async streamChat({ provider, messages, model }, onChunk) {
    try {
      if (provider === 'openai') return await this._streamOpenAI(messages, model, onChunk);
      if (provider === 'anthropic') return await this._streamAnthropic(messages, model, onChunk);
      return await this._streamOllama(messages, model, onChunk);
    } catch (err) {
      onChunk({ error: err.message });
    }
  }

  async _streamOllama(messages, model, onChunk) {
    let res;
    try {
      res = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true }),
      });
    } catch (err) {
      onChunk({ error: `Could not reach Ollama at ${this.ollamaBaseUrl}. Is it running? (${err.message})` });
      return;
    }
    if (!res.ok || !res.body) {
      onChunk({ error: `Ollama responded with status ${res.status}` });
      return;
    }
    await this._pumpNdjson(res.body, (obj) => {
      if (obj.message && obj.message.content) onChunk({ text: obj.message.content });
    });
  }

  async _streamOpenAI(messages, model, onChunk) {
    const key = this.secureStore.getKey('openai');
    if (!key) {
      onChunk({ error: 'No OpenAI API key set. Add one in Settings → API Keys.' });
      return;
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model: model || 'gpt-4o-mini', messages, stream: true }),
    });
    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      onChunk({ error: `OpenAI responded with status ${res.status}. ${errText.slice(0, 200)}` });
      return;
    }
    await this._pumpSse(res.body, (data) => {
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
        if (delta && delta.content) onChunk({ text: delta.content });
      } catch {
        // ignore malformed partial chunk
      }
    });
  }

  async _streamAnthropic(messages, model, onChunk) {
    const key = this.secureStore.getKey('anthropic');
    if (!key) {
      onChunk({ error: 'No Anthropic API key set. Add one in Settings → API Keys.' });
      return;
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      onChunk({ error: `Anthropic responded with status ${res.status}. ${errText.slice(0, 200)}` });
      return;
    }
    await this._pumpSse(res.body, (data) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
          onChunk({ text: parsed.delta.text });
        }
      } catch {
        // ignore malformed partial chunk
      }
    });
  }

  async _pumpNdjson(body, handleObj) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try { handleObj(JSON.parse(line)); } catch { /* partial line, ignore */ }
      }
    }
  }

  async _pumpSse(body, handleData) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line.startsWith('data:')) handleData(line.slice(5).trim());
      }
    }
  }
}

module.exports = ChatProviders;
