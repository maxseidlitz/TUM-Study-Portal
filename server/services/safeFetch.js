const dns = require('dns').promises;
const https = require('https');
const net = require('net');
const ipaddr = require('ipaddr.js');
const { safeExternalError } = require('./errors');

function isPrivateIp(address) {
  const normalized = String(address).toLowerCase().split('%')[0];
  if (!ipaddr.isValid(normalized)) return true;
  const parsed = ipaddr.parse(normalized);
  if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
    return isPrivateIp(parsed.toIPv4Address().toString());
  }
  return parsed.range() !== 'unicast';
}

async function resolvePublic(hostname, lookupImpl = dns.lookup) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw safeExternalError('Calendar target is blocked', 'ICAL_TARGET_BLOCKED');
    return [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }];
  }
  let answers;
  try {
    answers = await lookupImpl(hostname, { all: true, verbatim: true });
  } catch {
    throw safeExternalError('Calendar host could not be resolved', 'ICAL_DNS_FAILED');
  }
  if (!answers.length || answers.some((answer) => isPrivateIp(answer.address))) {
    throw safeExternalError('Calendar target is blocked', 'ICAL_TARGET_BLOCKED');
  }
  return answers;
}

async function safeFetchText(rawUrl, {
  allowedHosts,
  timeoutMs = 10000,
  maxBytes = 2 * 1024 * 1024,
  redirects = 3,
  lookupImpl = dns.lookup,
  requestImpl = https.get,
} = {}) {
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    throw safeExternalError('Invalid calendar URL', 'ICAL_INVALID_URL');
  }
  if (target.protocol !== 'https:' || target.username || target.password || target.port) {
    throw safeExternalError('Calendar URL must use HTTPS without credentials or a custom port', 'ICAL_INVALID_URL');
  }
  const hostname = target.hostname.toLowerCase();
  if (!allowedHosts || !allowedHosts.includes(hostname)) {
    throw safeExternalError('Calendar host is not allowlisted', 'ICAL_HOST_NOT_ALLOWED');
  }
  const addresses = await resolvePublic(hostname, lookupImpl);
  const pinned = addresses[0];

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };
    const request = requestImpl(target, {
      timeout: timeoutMs,
      headers: { Accept: 'text/calendar, text/plain;q=0.9' },
      lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location || redirects <= 0) {
          return finish(safeExternalError('Too many calendar redirects', 'ICAL_REDIRECT_LIMIT'));
        }
        let next;
        try {
          next = new URL(response.headers.location, target).toString();
        } catch {
          return finish(safeExternalError('Calendar redirect is invalid', 'ICAL_INVALID_REDIRECT'));
        }
        safeFetchText(next, {
          allowedHosts, timeoutMs, maxBytes, redirects: redirects - 1, lookupImpl, requestImpl,
        })
          .then((value) => finish(null, value), finish);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        finish(safeExternalError('Calendar server rejected the request', 'ICAL_UPSTREAM_REJECTED'));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          request.destroy();
          finish(safeExternalError('Calendar response exceeds the size limit', 'ICAL_RESPONSE_TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')));
      response.on('error', finish);
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => finish(safeExternalError('Calendar server is unavailable', 'ICAL_UNAVAILABLE')));
  });
}

module.exports = { isPrivateIp, resolvePublic, safeFetchText };
