const dns = require('dns').promises;
const https = require('https');
const net = require('net');

function isPrivateIp(address) {
  const normalized = String(address).toLowerCase().split('%')[0];
  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    return parts[0] === 0
      || parts[0] === 10
      || parts[0] === 127
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || parts[0] >= 224;
  }
  if (!net.isIPv6(normalized)) return true;
  if (normalized === '::' || normalized === '::1') return true;
  if (/^f[cd]/.test(normalized) || /^fe[89ab]/.test(normalized) || /^ff/.test(normalized)) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIp(mapped[1]) : false;
}

async function resolvePublic(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('IP literals in private or reserved ranges are blocked');
    return [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }];
  }
  const answers = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!answers.length || answers.some((answer) => isPrivateIp(answer.address))) {
    throw new Error('Calendar host resolves to a private or reserved address');
  }
  return answers;
}

async function safeFetchText(rawUrl, {
  allowedHosts,
  timeoutMs = 10000,
  maxBytes = 2 * 1024 * 1024,
  redirects = 3,
} = {}) {
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new Error('Invalid calendar URL');
  }
  if (target.protocol !== 'https:' || target.username || target.password || target.port) {
    throw new Error('Calendar URL must use HTTPS without credentials or a custom port');
  }
  const hostname = target.hostname.toLowerCase();
  if (!allowedHosts || !allowedHosts.includes(hostname)) {
    throw new Error('Calendar host is not allowlisted');
  }
  const addresses = await resolvePublic(hostname);
  const pinned = addresses[0];

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };
    const request = https.get(target, {
      timeout: timeoutMs,
      headers: { Accept: 'text/calendar, text/plain;q=0.9' },
      lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location || redirects <= 0) return finish(new Error('Too many calendar redirects'));
        const next = new URL(response.headers.location, target).toString();
        safeFetchText(next, { allowedHosts, timeoutMs, maxBytes, redirects: redirects - 1 })
          .then((value) => finish(null, value), finish);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        finish(new Error(`Calendar server returned HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          request.destroy();
          finish(new Error('Calendar response exceeds the size limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')));
      response.on('error', finish);
    });
    request.on('timeout', () => request.destroy(new Error('Calendar request timed out')));
    request.on('error', finish);
  });
}

module.exports = { isPrivateIp, safeFetchText };
