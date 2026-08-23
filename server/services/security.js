const crypto = require('crypto');
const argon2 = require('argon2');

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(secret, value) {
  return base64url(crypto.createHmac('sha256', secret).update(value).digest());
}

function equal(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(header = '') {
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

class SecurityService {
  static async create(db, config) {
    let passwordHash = config.passwordHash;
    if (!passwordHash) {
      passwordHash = await argon2.hash(config.bootstrapPassword, { type: argon2.argon2id });
    }
    return new SecurityService(db, config, passwordHash);
  }

  constructor(db, config, passwordHash) {
    this.db = db;
    this.config = config;
    this.passwordHash = passwordHash;
    this.sessionCookie = '__Host-tum_session';
    this.loginCookie = '__Host-login_nonce';
  }

  cookie(name, value, { maxAge, httpOnly = true } = {}) {
    const parts = [
      `${name}=${encodeURIComponent(value)}`,
      'Path=/',
      'SameSite=Strict',
      httpOnly ? 'HttpOnly' : '',
      this.config.secureCookies ? 'Secure' : '',
      maxAge != null ? `Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}` : '',
    ];
    return parts.filter(Boolean).join('; ');
  }

  loginChallenge() {
    const nonce = base64url(crypto.randomBytes(24));
    const issued = Date.now();
    const payload = `${nonce}.${issued}`;
    return {
      token: `${payload}.${hmac(this.config.csrfSecret, payload)}`,
      cookie: this.cookie(this.loginCookie, nonce, { maxAge: 10 * 60 * 1000 }),
    };
  }

  verifyLoginChallenge(req, token) {
    const cookies = parseCookies(req.headers.cookie);
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return false;
    const [nonce, issued, signature] = parts;
    if (!equal(cookies[this.loginCookie], nonce)) return false;
    if (!Number.isFinite(Number(issued)) || Date.now() - Number(issued) > 10 * 60 * 1000) return false;
    return equal(signature, hmac(this.config.csrfSecret, `${nonce}.${issued}`));
  }

  verifyOrigin(req) {
    const origin = req.get('origin');
    if (origin) return origin === this.config.publicOrigin;
    const referer = req.get('referer');
    if (!referer) return false;
    try {
      return new URL(referer).origin === this.config.publicOrigin;
    } catch {
      return false;
    }
  }

  async verifyPassword(password) {
    try {
      return await argon2.verify(this.passwordHash, String(password || ''));
    } catch {
      return false;
    }
  }

  createSession() {
    const raw = base64url(crypto.randomBytes(32));
    const now = new Date();
    const expires = new Date(now.getTime() + this.config.sessionTtlMs);
    this.db.db.prepare('INSERT INTO sessions(id_hash,created_at,last_seen_at,expires_at) VALUES(?,?,?,?)')
      .run(hash(raw), now.toISOString(), now.toISOString(), expires.toISOString());
    return {
      raw,
      csrf: hmac(this.config.csrfSecret, raw),
      cookie: this.cookie(this.sessionCookie, raw, { maxAge: this.config.sessionTtlMs }),
    };
  }

  session(req, { touch = true } = {}) {
    const raw = parseCookies(req.headers.cookie)[this.sessionCookie];
    if (!raw) return null;
    const row = this.db.db.prepare('SELECT * FROM sessions WHERE id_hash=?').get(hash(raw));
    if (!row || Date.parse(row.expires_at) <= Date.now()) {
      if (row) this.db.db.prepare('DELETE FROM sessions WHERE id_hash=?').run(hash(raw));
      return null;
    }
    if (touch && Date.now() - Date.parse(row.last_seen_at) > 5 * 60 * 1000) {
      this.db.db.prepare('UPDATE sessions SET last_seen_at=? WHERE id_hash=?')
        .run(new Date().toISOString(), hash(raw));
    }
    return { raw, csrf: hmac(this.config.csrfSecret, raw) };
  }

  destroySession(req) {
    const raw = parseCookies(req.headers.cookie)[this.sessionCookie];
    if (raw) this.db.db.prepare('DELETE FROM sessions WHERE id_hash=?').run(hash(raw));
    return this.cookie(this.sessionCookie, '', { maxAge: 0 });
  }

  requireAuth() {
    return (req, res, next) => {
      const session = this.session(req);
      if (!session) return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      req.session = session;
      return next();
    };
  }

  requireCsrf() {
    return (req, res, next) => {
      if (!this.verifyOrigin(req)) {
        return res.status(403).json({ error: 'Origin check failed', code: 'BAD_ORIGIN' });
      }
      if (!req.session || !equal(req.get('X-CSRF-Token'), req.session.csrf)) {
        return res.status(403).json({ error: 'Invalid CSRF token', code: 'BAD_CSRF' });
      }
      return next();
    };
  }

  encrypt(value, encryptionKey) {
    if (!encryptionKey) throw new Error('Secret encryption is not configured');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
    const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(record, encryptionKey) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.auth_tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  decryptBuffer(record, encryptionKey) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.auth_tag || record.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final(),
    ]);
  }

  saveSecret(keyName, value) {
    const encrypted = this.encrypt(value, this.config.settingsEncryptionKey);
    this.db.db.prepare(`
      INSERT INTO secrets(key,ciphertext,iv,auth_tag,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,
        auth_tag=excluded.auth_tag,updated_at=excluded.updated_at
    `).run(keyName, encrypted.ciphertext, encrypted.iv, encrypted.authTag, new Date().toISOString());
  }

  readSecret(keyName) {
    const row = this.db.db.prepare('SELECT * FROM secrets WHERE key=?').get(keyName);
    return row ? this.decrypt(row, this.config.settingsEncryptionKey) : '';
  }
}

module.exports = { SecurityService, parseCookies, isEqual: equal, hash, hmac };
