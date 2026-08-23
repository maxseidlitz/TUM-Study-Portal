const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');
const { safeExternalError } = require('./errors');

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'];

function requestJson(urlValue, { method = 'GET', body, headers = {}, timeoutMs = 180000, maxBytes = 4 * 1024 * 1024 } = {}) {
  const url = new URL(urlValue);
  const transport = url.protocol === 'https:' ? https : http;
  const encoded = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method,
      timeout: timeoutMs,
      headers: {
        Accept: 'application/json',
        ...headers,
        ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': encoded.length } : {}),
      },
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) request.destroy(new Error('Provider response exceeds the size limit'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          reject(safeExternalError('AI provider returned an invalid response', 'AI_INVALID_RESPONSE'));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300 || parsed.error) {
          reject(safeExternalError('AI provider rejected the request', 'AI_PROVIDER_REJECTED'));
          return;
        }
        resolve(parsed);
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => reject(safeExternalError('AI provider is unavailable', 'AI_UNAVAILABLE')));
    if (encoded) request.write(encoded);
    request.end();
  });
}

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function compactContext(store, maxBytes = 64 * 1024) {
  const payload = {
    today: today(),
    exams: store.exams.slice(0, 30),
    todos: store.todos.slice(0, 60),
    lectures: store.lectures.slice(0, 80),
    modules: store.modules.slice(0, 40),
  };
  while (Buffer.byteLength(JSON.stringify(payload), 'utf8') > maxBytes) {
    const largest = ['lectures', 'todos', 'modules', 'exams']
      .sort((a, b) => payload[b].length - payload[a].length)[0];
    if (!payload[largest].length) break;
    payload[largest].pop();
  }
  const encoded = JSON.stringify(payload);
  if (Buffer.byteLength(encoded, 'utf8') > maxBytes) {
    return JSON.stringify({ today: payload.today, truncated: true });
  }
  return encoded;
}

class AiService {
  constructor(domain, config) {
    this.domain = domain;
    this.config = config;
  }

  settings() {
    return this.domain.publicSettings();
  }

  snapshot() {
    return {
      exams: this.domain.db.listEntities('exams', 'date'),
      todos: this.domain.db.listEntities('todos'),
      lectures: this.domain.lectures(),
      modules: this.domain.modules(),
    };
  }

  provider(options = {}) {
    const persisted = this.settings();
    return options.aiProvider === 'gemini' || (!options.aiProvider && persisted.aiProvider === 'gemini')
      ? 'gemini' : 'ollama';
  }

  async models(options) {
    if (this.provider(options) === 'gemini') {
      const custom = String(options?.geminiModel || this.settings().geminiModel || '').replace(/^models\//, '');
      return [...new Set([custom, ...GEMINI_MODELS].filter(Boolean))];
    }
    const response = await requestJson(`${this.config.ollamaUrl.replace(/\/+$/, '')}/api/tags`, { timeoutMs: 5000 });
    return (response.models || []).map((model) => model.name).filter(Boolean);
  }

  model(provider) {
    const settings = this.settings();
    return provider === 'gemini'
      ? String(settings.geminiModel || GEMINI_MODELS[0]).replace(/^models\//, '')
      : settings.ollamaModel || this.config.ollamaModel;
  }

  async generate(provider, messages, system) {
    const model = this.model(provider);
    if (provider === 'gemini') {
      const apiKey = this.domain.geminiKey();
      if (!apiKey) throw safeExternalError('Gemini API key is not configured', 'GEMINI_NOT_CONFIGURED');
      const contents = messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));
      const response = await requestJson(
        `https://${GEMINI_HOST}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'X-goog-api-key': apiKey },
          timeoutMs: 120000,
          body: { systemInstruction: { parts: [{ text: system }] }, contents },
        },
      );
      const content = (response.candidates?.[0]?.content?.parts || [])
        .map((part) => part.text || '').join('').trim();
      if (!content) throw safeExternalError('Gemini returned an empty response', 'AI_EMPTY_RESPONSE');
      return { content, model };
    }
    const settings = this.settings();
    const response = await requestJson(`${this.config.ollamaUrl.replace(/\/+$/, '')}/api/chat`, {
      method: 'POST',
      body: {
        model,
        ...(settings.ollamaDisableReasoning ? { think: false } : {}),
        stream: false,
        messages: [{ role: 'system', content: system }, ...messages],
      },
    });
    const content = String(response.message?.content || response.response || '').trim();
    if (!content) throw safeExternalError('Ollama returned an empty response', 'AI_EMPTY_RESPONSE');
    return { content, model };
  }

  async recommend(context = {}) {
    const provider = this.provider();
    const system = 'Du bist ein persönlicher Studienassistent. Antworte kurz, konkret und ohne erfundene Fakten.';
    const data = compactContext(this.snapshot(), this.config.maxAiContextBytes);
    return this.generate(provider, [{
      role: 'user',
      content: `Studiendaten: ${data}\nHeute: ${context.today || today()}\nWas sollte heute priorisiert werden?`,
    }], system);
  }

  async chat(payload) {
    const provider = this.provider();
    const locale = payload.context?.locale || 'de';
    const language = locale === 'en' ? 'English' : locale === 'tr' ? 'Turkish' : 'German';
    const system = [
      'Du bist der persönliche Studienassistent im TUM Study Portal.',
      `Antworte ausschließlich in ${language}.`,
      'Erfinde keine persönlichen Fakten. Nutze nur die beigefügten Studiendaten.',
      `Studiendaten: ${compactContext(this.snapshot(), this.config.maxAiContextBytes)}`,
    ].join('\n');
    const result = await this.generate(provider, payload.messages, system);
    return {
      ...result,
      activeModel: result.model,
      fallbackUsed: true,
      fallbackReason: 'server_full_context',
      retrievalMode: 'full_context',
      todoActions: [],
    };
  }
}

class OllamaSetupService extends EventEmitter {
  constructor(ai, config) {
    super();
    this.ai = ai;
    this.config = config;
    this.state = { phase: 'idle', percent: 0, message: '', model: config.ollamaModel };
    this.running = null;
  }

  publish(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('state', this.state);
    return this.state;
  }

  retry() {
    if (this.running) return this.running;
    this.publish({ phase: 'starting', percent: 0, message: 'Prüfe Ollama…' });
    this.running = this.ai.models({ aiProvider: 'ollama' }).then((models) => {
      const present = models.some((name) => name === this.config.ollamaModel
        || name.startsWith(`${this.config.ollamaModel}:`));
      return this.publish(present
        ? { phase: 'ready', percent: 100, message: 'Bereit.' }
        : { phase: 'unavailable', percent: 0, message: `Modell ${this.config.ollamaModel} ist nicht installiert.` });
    }).catch(() => this.publish({
      phase: 'unavailable', percent: 0, message: 'Ollama ist nicht erreichbar.',
    })).finally(() => {
      this.running = null;
    });
    return this.running;
  }
}

module.exports = {
  AiService, GEMINI_MODELS, OllamaSetupService, compactContext, requestJson,
};
