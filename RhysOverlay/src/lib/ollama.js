const { spawn } = require('child_process');

class OllamaManager {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  async isRunning() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
      const data = await res.json();
      return (data.models || []).map((m) => ({ name: m.name, sizeBytes: m.size || 0 }));
    } catch (err) {
      console.error('[ollama] listModels failed:', err.message);
      return [];
    }
  }

  /**
   * Pulls a model via the `ollama` CLI, streaming progress lines back through
   * onProgress({ status, percent }). Requires the Ollama CLI to be on PATH
   * (true for any standard Ollama install).
   */
  pullModel(modelName, onProgress, onDone, onError) {
    let proc;
    try {
      proc = spawn('ollama', ['pull', modelName]);
    } catch (err) {
      onError(`Could not launch "ollama" - is it installed and on your PATH? (${err.message})`);
      return null;
    }

    proc.stdout.on('data', (buf) => this._parseProgress(buf.toString(), onProgress));
    proc.stderr.on('data', (buf) => this._parseProgress(buf.toString(), onProgress));

    proc.on('close', (code) => {
      if (code === 0) onDone();
      else onError(`ollama pull exited with code ${code}`);
    });

    proc.on('error', (err) => onError(err.message));

    return proc;
  }

  _parseProgress(text, onProgress) {
    // Ollama CLI prints lines like: "pulling manifest" / "verifying sha256... 43%"
    const pctMatch = text.match(/(\d+)%/);
    const lastLine = text.trim().split('\n').pop() || text.trim();
    onProgress({
      status: lastLine,
      percent: pctMatch ? parseInt(pctMatch[1], 10) : null,
    });
  }
}

module.exports = OllamaManager;
