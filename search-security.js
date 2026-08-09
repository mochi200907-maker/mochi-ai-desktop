import dns from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 4;
const DEFAULT_MAX_BYTES = 120_000;

function ipv4ToNumber(value) {
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((number, part) => number * 256 + part, 0);
}

function ipv6ToBigInt(value) {
  let address = value.toLowerCase().split('%')[0];
  if (address.includes('.')) {
    const lastColon = address.lastIndexOf(':');
    const ipv4 = ipv4ToNumber(address.slice(lastColon + 1));
    if (ipv4 === null) return null;
    address = `${address.slice(0, lastColon)}:${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = address.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if ([...left, ...right].some(part => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  return groups.reduce((number, group) => (number << 16n) | BigInt(parseInt(group, 16)), 0n);
}

function inIpv6Range(value, prefix, bits) {
  const mask = (1n << BigInt(128 - prefix)) - 1n;
  return (value >> BigInt(128 - prefix)) === (bits >> BigInt(128 - prefix)) &&
    (value & mask) >= 0n;
}

function isBlockedAddress(address) {
  const version = isIP(address);
  if (version === 4) {
    const number = ipv4ToNumber(address);
    if (number === null) return true;
    const ranges = [
      [0, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
      [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24],
      [0xc0000200, 24], [0xc0a80000, 16], [0xc6120000, 15],
      [0xc6336400, 24], [0xcb007100, 24], [0xe0000000, 4],
      [0xffffffff, 32],
    ];
    return ranges.some(([base, prefix]) => {
      const shift = 32 - prefix;
      return (number >>> shift) === (base >>> shift);
    });
  }

  if (version === 6) {
    const value = ipv6ToBigInt(address);
    if (value === null) return true;
    const ranges = [
      ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10],
      ['ff00::', 8], ['2001:db8::', 32], ['2001:10::', 28],
    ];
    if (ranges.some(([base, prefix]) => inIpv6Range(value, prefix, ipv6ToBigInt(base)))) return true;

    // IPv4-mapped IPv6 addresses must follow the IPv4 rules too.
    if (value >> 32n === 0xffffn) {
      const mapped = Number(value & 0xffffffffn);
      const ipv4 = [mapped >>> 24, (mapped >>> 16) & 255, (mapped >>> 8) & 255, mapped & 255].join('.');
      return isBlockedAddress(ipv4);
    }
    return false;
  }

  return true;
}

export async function assertPublicHttpUrl(value, { lookupFn = dns.lookup } = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('invalid source URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('source URL must be public HTTP(S) without credentials');
  }
  if (parsed.port && !['80', '443'].includes(parsed.port)) {
    throw new Error('source URL port is not allowed');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookupFn(hostname, { all: true, verbatim: true });
  if (!addresses?.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error('source URL resolves to a non-public address');
  }
  return parsed;
}

async function readTextWithLimit(response, maxBytes) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error('source response is too large');
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('source response is too large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchPublicText(
  value,
  { fetchImpl = fetch, lookupFn = dns.lookup, headers = {}, maxBytes = DEFAULT_MAX_BYTES } = {},
) {
  let current = value;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const parsed = await assertPublicHttpUrl(current, { lookupFn });
    const response = await fetchImpl(parsed, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirect === MAX_REDIRECTS) throw new Error('too many or invalid source redirects');
      response.body?.cancel?.();
      current = new URL(location, parsed).toString();
      continue;
    }
    if (!response.ok) return null;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('text/html') && !contentType.includes('text/plain')) return null;
    return readTextWithLimit(response, maxBytes);
  }
  throw new Error('source redirect limit exceeded');
}
