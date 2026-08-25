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
          const providerMessage = String(parsed.error?.message || parsed.error || parsed.message || '');
          const toolsUnsupported = /(?:tool|function)(?: calling|s)? (?:is |are )?(?:not supported|unsupported)/i
            .test(providerMessage)
            || /does not support (?:tool|function)/i.test(providerMessage);
          reject(safeExternalError(
            'AI provider rejected the request',
            toolsUnsupported ? 'AI_TOOLS_UNSUPPORTED' : 'AI_PROVIDER_REJECTED',
          ));
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
    moodleCourses: (store.moodleCourses || store.moodle_courses || []).slice(0, 40),
  };
  while (Buffer.byteLength(JSON.stringify(payload), 'utf8') > maxBytes) {
    const largest = ['lectures', 'todos', 'modules', 'moodleCourses', 'exams']
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

const MAX_TOOL_TURNS = 5;
const MAX_TOOL_CALLS = 8;
const MAX_TODO_ACTIONS = 4;

const CREATE_TODO_DECLARATION = {
  name: 'create_todo',
  description: 'Creates a Todo only when the user explicitly asks to save one.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 240 },
      priority: { type: 'string', enum: ['high', 'medium', 'low'] },
      due: {
        type: 'string',
        pattern: '^$|^\\d{4}-\\d{2}-\\d{2}$',
        description: 'Empty or a calendar date in YYYY-MM-DD format.',
      },
      notes: { type: 'string', maxLength: 10000 },
      subject: {
        type: 'string',
        maxLength: 240,
        description: 'Free-text subject only when neither moduleId nor moodleCourseId is used.',
      },
      moduleId: {
        type: 'string',
        minLength: 1,
        maxLength: 240,
        description: 'Only an exact module ID from the server-provided snapshot.',
      },
      moodleCourseId: {
        type: 'string',
        minLength: 1,
        maxLength: 240,
        description: 'Only an exact Moodle course ID from the server-provided snapshot.',
      },
    },
    required: ['title'],
  },
};

const OLLAMA_TOOLS = [{ type: 'function', function: CREATE_TODO_DECLARATION }];
const GEMINI_TOOLS = [{ functionDeclarations: [CREATE_TODO_DECLARATION] }];

function parseToolArguments(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ok: true, value: raw };
  if (typeof raw !== 'string') return { ok: false, error: 'Tool arguments must be a JSON object.' };
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, error: 'Tool arguments must be a JSON object.' };
  } catch {
    return { ok: false, error: 'Tool arguments are not valid JSON.' };
  }
}

function canonicalCall(name, args) {
  const sorted = Object.keys(args).sort().reduce((result, key) => {
    result[key] = args[key];
    return result;
  }, {});
  return `${name}:${JSON.stringify(sorted)}`;
}

function allowsTodoWriteIntent(rawText) {
  const text = String(rawText || '').trim().toLocaleLowerCase('de-DE');
  if (!text || text.length > 12000) return false;

  const metaLanguage = /\b(?:(?:is|are)\s+what|appears?\s+on|(?:is|are)\s+(?:an?\s+)?(?:example|quote|label|documentation|tutorial|button\s+text)|(?:button|label|tutorial|documentation)\s+(?:says?|reads?|shows?|contains?)|(?:ist|sind)\s+(?:ein(?:e|en)?\s+)?(?:beispiel|zitat|beschriftung|buttontext)|(?:steht|erscheint)\s+(?:auf|in)|(?:button|schaltfläche|tutorial|dokumentation)\s+(?:sagt|zeigt|enthält|lautet))\b/u;
  if (/\b(?:wie|how|nasıl)\b/u.test(text)
    || /^(?:(?:kann|könnte|soll|darf)\s+ich|(?:can|could|should|may)\s+i)\b/u.test(text)
    || /\b(?:falls|wenn|if|eğer|erklär\w*|beschreib\w*|explain\w*|describe\w*|tell\s+me|sag\s+mir|açıkla\w*)\b/u.test(text)
    || /\b(?:nicht|keine?|don't|do not|never|oluşturma|ekleme|kaydetme)\b/u.test(text)
    || /\b(?:ignore|ignoriere|anweisungen|instructions?|system[\s-]?prompt|tool|function|provider|model|talimatları|kuralları)\b/u.test(text)
    || metaLanguage.test(text)) {
    return false;
  }

  const germanTodo = /\b(?:todos?|to-dos?|aufgaben?|erinnerungen?)\b/u;
  const germanDirect = /^(?:bitte\s+)?(?:erstell(?:e)?|leg(?:e)?|speicher(?:e)?|merk(?:e)?)\b/u;
  const germanElliptical = /^bitte\s+(?:(?:das|dies|dieses|diesen|diese|es)\s+)?(?:als\s+)?(?:ein(?:e|en)?\s+)?(?:todo|to-do|aufgabe|erinnerung)\b.*\b(?:erstellen|anlegen|speichern)\s*[?!.]*$/u;
  const germanPolite = /^(?:kannst|könntest)\s+du\s+(?:bitte\s+)?.*\b(?:erstellen|anlegen|speichern|merken)\s*[?!.]*$/u;
  const germanExplicit = (
    (germanTodo.test(text) && (
      germanDirect.test(text)
      || germanElliptical.test(text)
      || germanPolite.test(text)
    ))
    || /^(?:bitte\s+)?erinner(?:e)?\s+(?:mich|uns)\b/u.test(text)
    || /^(?:kannst|könntest)\s+du\s+(?:bitte\s+)?(?:mich|uns)(?:\s+bitte)?\b.*\berinnern\b/u.test(text)
  );

  const englishTodo = /\b(?:todos?|to-dos?|tasks?|reminders?)\b/u;
  const englishDirect = /^(?:please\s+)?(?:create|add|save|store)\b/u;
  const englishPolite = /^(?:can|could|would)\s+you\s+(?:please\s+)?(?:create|add|save|store)\b/u;
  const englishExplicit = (
    (englishTodo.test(text) && (
      englishDirect.test(text)
      || englishPolite.test(text)
    ))
    || /^(?:please\s+)?remind\s+(?:me|us)\b/u.test(text)
    || /^(?:can|could|would)\s+you\s+(?:please\s+)?remind\s+(?:me|us)\b/u.test(text)
    || /^(?:please\s+)?remember\s+to\b/u.test(text)
  );

  const turkishTodo = /\b(?:görev(?:ler)?|ödev(?:ler)?|hatırlatıcı(?:lar)?|yapılacak(?:lar)?)\b/u;
  const turkishAction = /\b(?:oluştur(?:un)?|ekle(?:yin)?|kaydet(?:in)?|oluşturabilir\s+misin(?:iz)?|ekleyebilir\s+misin(?:iz)?|kaydedebilir\s+misin(?:iz)?)\b/u;
  const turkishDirectStart = /^(?:(?:bir\s+)?(?:görev(?:ler)?|ödev(?:ler)?|hatırlatıcı(?:lar)?|yapılacak(?:lar)?)\b|(?:bunu|şunu)\s+(?:bir\s+)?(?:görev|ödev|hatırlatıcı)\b)/u;
  const turkishExplicit = (
    (turkishTodo.test(text) && turkishAction.test(text)
      && (/^lütfen\b/u.test(text) || turkishDirectStart.test(text)))
    || /^(?:lütfen\s+)?(?:bana|bize)\b.*\b(?:hatırlat(?:ın)?|hatırlatabilir\s+misin(?:iz)?|hatırlatır\s+mısın(?:ız)?)\b/u.test(text)
  );

  return germanExplicit || englishExplicit || turkishExplicit;
}

function finalTextAfterWrites(actions, language) {
  const titles = actions.map(action => `„${action.title}“`).join(', ');
  if (language === 'English') return `Saved ${actions.length === 1 ? 'the Todo' : 'the Todos'} ${titles}. The model could not complete its final response.`;
  if (language === 'Turkish') return `${titles} ${actions.length === 1 ? 'görevi' : 'görevleri'} kaydedildi. Model son yanıtını tamamlayamadı.`;
  return `${actions.length === 1 ? 'Das Todo' : 'Die Todos'} ${titles} wurde${actions.length === 1 ? '' : 'n'} gespeichert. Das Modell konnte die abschließende Antwort nicht vervollständigen.`;
}

function partialFailureText(actions, failures, language) {
  const titles = actions.map(action => `„${action.title}“`).join(', ');
  if (language === 'English') {
    return `${actions.length ? `Confirmed writes: ${titles}.` : 'No Todo was saved.'} ${failures} tool action(s) failed or were rejected.`;
  }
  if (language === 'Turkish') {
    return `${actions.length ? `Onaylanan kayıtlar: ${titles}.` : 'Hiçbir görev kaydedilmedi.'} ${failures} araç işlemi başarısız oldu veya reddedildi.`;
  }
  return `${actions.length ? `Bestätigt gespeichert: ${titles}.` : 'Es wurde kein Todo gespeichert.'} ${failures} Tool-Aktion(en) sind fehlgeschlagen oder wurden abgelehnt.`;
}

class AiService {
  constructor(domain, config) {
    this.domain = domain;
    this.config = config;
    this.request = requestJson;
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
      moodleCourses: this.domain.db.listEntities('moodle_courses', 'name COLLATE NOCASE'),
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
    const response = await this.request(`${this.config.ollamaUrl.replace(/\/+$/, '')}/api/tags`, { timeoutMs: 5000 });
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
      const response = await this.request(
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
    const response = await this.request(`${this.config.ollamaUrl.replace(/\/+$/, '')}/api/chat`, {
      method: 'POST',
      body: {
        model,
        ...(settings.ollamaDisableReasoning !== false ? { think: false } : {}),
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
      'Nutze create_todo nur auf ausdrücklichen Wunsch des Nutzers und nie mehrfach mit identischen Argumenten.',
      'Melde eine Speicherung nur dann als erfolgreich, wenn das Tool-Ergebnis success=true enthält.',
      'Wenn ein Tool-Aufruf fehlschlägt, erkläre den Fehler; behaupte nicht, dass dieses Todo gespeichert wurde.',
      `Studiendaten: ${compactContext(this.snapshot(), this.config.maxAiContextBytes)}`,
    ].join('\n');
    const messages = payload.messages.map(message => ({
      role: message.role,
      content: message.content,
    }));
    const lastUserMessage = [...messages].reverse().find(message => message.role === 'user');
    const writeIntentAllowed = payload.context?.allowTodoWrites === true
      && allowsTodoWriteIntent(lastUserMessage?.content);
    try {
      return provider === 'gemini'
        ? await this.chatGemini(messages, system, language, writeIntentAllowed)
        : await this.chatOllama(messages, system, language, writeIntentAllowed);
    } catch (error) {
      if (error.code !== 'AI_TOOLS_UNSUPPORTED') throw error;
      const result = await this.generate(provider, messages, system);
      return {
        ...result,
        activeModel: result.model,
        fallbackUsed: true,
        fallbackReason: 'tools_unsupported',
        retrievalMode: 'full_context_fallback',
        todoActions: [],
      };
    }
  }

  executeTool(name, rawArgs, state) {
    state.callCount += 1;
    if (state.callCount > MAX_TOOL_CALLS) {
      state.failures += 1;
      return { success: false, error: 'Tool call limit exceeded.' };
    }
    if (name !== 'create_todo') {
      state.failures += 1;
      return { success: false, error: `Unknown tool: ${String(name || '').slice(0, 80)}` };
    }
    const parsed = parseToolArguments(rawArgs);
    if (!parsed.ok) {
      state.failures += 1;
      return { success: false, error: parsed.error };
    }
    const signature = canonicalCall(name, parsed.value);
    if (state.seen.has(signature)) {
      state.failures += 1;
      return { success: false, error: 'Duplicate tool call blocked within this chat.' };
    }
    state.seen.add(signature);
    if (!state.writeIntentAllowed) {
      state.failures += 1;
      return {
        success: false,
        error: 'Todo write rejected: explicit user consent and a direct create, save, or reminder instruction are required.',
      };
    }
    if (state.actions.length >= MAX_TODO_ACTIONS) {
      state.failures += 1;
      return { success: false, error: 'Todo action limit exceeded.' };
    }
    try {
      const todo = this.domain.createAiTodo(parsed.value);
      const confirmed = { id: todo.id, title: todo.title, priority: todo.priority };
      state.actions.push(confirmed);
      return { success: true, ...confirmed, message: 'Todo was saved.' };
    } catch (error) {
      state.failures += 1;
      return {
        success: false,
        error: error?.code === 'VALIDATION_FAILED'
          ? error.message
          : 'Todo arguments failed validation.',
      };
    }
  }

  completedChat(content, model, state, language) {
    const safeContent = state.failures
      ? partialFailureText(state.actions, state.failures, language)
      : content;
    return {
      content: safeContent,
      model,
      activeModel: model,
      fallbackUsed: false,
      fallbackReason: null,
      retrievalMode: 'server_snapshot_tools',
      todoActions: state.actions,
    };
  }

  async chatOllama(originalMessages, system, language, writeIntentAllowed) {
    const model = this.model('ollama');
    const settings = this.settings();
    const messages = [{ role: 'system', content: system }, ...originalMessages];
    const state = {
      actions: [], callCount: 0, failures: 0, seen: new Set(), writeIntentAllowed,
    };
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
      let response;
      try {
        response = await this.request(`${this.config.ollamaUrl.replace(/\/+$/, '')}/api/chat`, {
          method: 'POST',
          body: {
            model,
            ...(settings.ollamaDisableReasoning !== false ? { think: false } : {}),
            stream: false,
            messages,
            tools: OLLAMA_TOOLS,
          },
        });
      } catch (error) {
        if (!state.actions.length) throw error;
        return this.completedChat(finalTextAfterWrites(state.actions, language), model, state, language);
      }
      const toolCalls = Array.isArray(response.message?.tool_calls) ? response.message.tool_calls : [];
      if (!toolCalls.length) {
        const content = String(response.message?.content || response.response || '').trim();
        if (!content) throw safeExternalError('Ollama returned an empty response', 'AI_EMPTY_RESPONSE');
        return this.completedChat(content, model, state, language);
      }
      messages.push({
        role: 'assistant',
        content: String(response.message?.content || ''),
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        const name = call?.function?.name || '';
        const result = this.executeTool(name, call?.function?.arguments, state);
        messages.push({
          role: 'tool',
          tool_name: name || 'unknown',
          content: JSON.stringify(result),
        });
      }
    }
    if (state.actions.length) {
      return this.completedChat(finalTextAfterWrites(state.actions, language), model, state, language);
    }
    throw safeExternalError('AI tool iteration limit exceeded', 'AI_TOOL_LIMIT');
  }

  async chatGemini(originalMessages, system, language, writeIntentAllowed) {
    const model = this.model('gemini');
    const apiKey = this.domain.geminiKey();
    if (!apiKey) throw safeExternalError('Gemini API key is not configured', 'GEMINI_NOT_CONFIGURED');
    const contents = originalMessages.map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));
    const state = {
      actions: [], callCount: 0, failures: 0, seen: new Set(), writeIntentAllowed,
    };
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
      let response;
      try {
        response = await this.request(
          `https://${GEMINI_HOST}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: { 'X-goog-api-key': apiKey },
            timeoutMs: 120000,
            body: {
              systemInstruction: { parts: [{ text: system }] },
              contents,
              tools: GEMINI_TOOLS,
            },
          },
        );
      } catch (error) {
        if (!state.actions.length) throw error;
        return this.completedChat(finalTextAfterWrites(state.actions, language), model, state, language);
      }
      const modelContent = response.candidates?.[0]?.content;
      const parts = Array.isArray(modelContent?.parts) ? modelContent.parts : [];
      const calls = parts.filter(part => part?.functionCall).map(part => part.functionCall);
      if (!calls.length) {
        const content = parts.map(part => part?.text || '').join('').trim();
        if (!content) throw safeExternalError('Gemini returned an empty response', 'AI_EMPTY_RESPONSE');
        return this.completedChat(content, model, state, language);
      }
      contents.push({ role: 'model', parts });
      const responseParts = calls.map((call) => ({
        functionResponse: {
          name: call.name || 'unknown',
          response: this.executeTool(
            call.name || '',
            call.args === undefined ? call.arguments : call.args,
            state,
          ),
        },
      }));
      contents.push({ role: 'user', parts: responseParts });
    }
    if (state.actions.length) {
      return this.completedChat(finalTextAfterWrites(state.actions, language), model, state, language);
    }
    throw safeExternalError('AI tool iteration limit exceeded', 'AI_TOOL_LIMIT');
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
  AiService, GEMINI_MODELS, OllamaSetupService, allowsTodoWriteIntent, compactContext, requestJson,
};
