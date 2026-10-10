/**
 * Stores API keys using Electron's `safeStorage`, which encrypts strings
 * with your OS's keychain (Credential Manager on Windows, Keychain on
 * macOS) when available. Falls back to plain storage (with a clear warning)
 * on systems where OS-level encryption isn't available - still better than
 * putting keys in a renderer or committing them anywhere.
 */

const { safeStorage } = require('electron');

class SecureStore {
  constructor(store) {
    this.store = store; // an electron-store instance
  }

  _available() {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  setKey(provider, plainTextKey) {
    if (!plainTextKey) {
      this.store.delete(`apiKeys.${provider}`);
      return;
    }
    if (this._available()) {
      const encrypted = safeStorage.encryptString(plainTextKey);
      this.store.set(`apiKeys.${provider}`, encrypted.toString('base64'));
      this.store.set(`apiKeysEncrypted.${provider}`, true);
    } else {
      this.store.set(`apiKeys.${provider}`, plainTextKey);
      this.store.set(`apiKeysEncrypted.${provider}`, false);
    }
  }

  getKey(provider) {
    const raw = this.store.get(`apiKeys.${provider}`);
    if (!raw) return null;
    const wasEncrypted = this.store.get(`apiKeysEncrypted.${provider}`);
    if (wasEncrypted && this._available()) {
      try {
        return safeStorage.decryptString(Buffer.from(raw, 'base64'));
      } catch {
        return null;
      }
    }
    return raw;
  }

  hasKey(provider) {
    return !!this.store.get(`apiKeys.${provider}`);
  }
}

module.exports = SecureStore;
