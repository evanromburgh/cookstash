/**
 * Reject URLs that are obviously unsafe for server-side fetch (SSRF hardening).
 * Does not replace network-level egress controls.
 */
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";

const MAX_URL_LENGTH = 2048;

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) {
    return true;
  }
  // 0.0.0.0/8
  if ((n >>> 24) === 0) {
    return true;
  }
  // 10.0.0.0/8
  if ((n >>> 24) === 10) {
    return true;
  }
  // 127.0.0.0/8
  if ((n >>> 24) === 127) {
    return true;
  }
  // 169.254.0.0/16 (link-local + metadata endpoints)
  if ((n >>> 16) === 0xa9fe) {
    return true;
  }
  // 172.16.0.0/12
  const second = (n >>> 16) & 0xff;
  if ((n >>> 24) === 172 && second >= 16 && second <= 31) {
    return true;
  }
  // 192.168.0.0/16
  if ((n >>> 16) === 0xc0a8) {
    return true;
  }
  // 100.64.0.0/10 (shared address space)
  const firstOctet = n >>> 24;
  const secondOctet = (n >>> 16) & 0xff;
  if (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127) {
    return true;
  }
  // 192.0.0.0/24 (IETF protocol assignments)
  if ((n >>> 8) === 0xc00000) {
    return true;
  }
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 documentation
  if (n === 0xc0000200 || (n >>> 8) === 0xc63364 || (n >>> 8) === 0xcb0071) {
    return true;
  }
  // 224.0.0.0+ multicast / reserved
  if (firstOctet >= 224) {
    return true;
  }
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }
  if (normalized.startsWith("ff")) {
    return true;
  }
  const mappedV4 = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedV4?.[1] && isBlockedIpv4(mappedV4[1])) {
    return true;
  }
  return false;
}

export function assertUrlSafeForServerFetch(urlString: string): URL {
  if (urlString.length > MAX_URL_LENGTH) {
    throw new Error("URL is too long");
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }

  if (url.username || url.password) {
    throw new Error("URL must not include credentials");
  }

  const host = url.hostname.toLowerCase();
  if (!host) {
    throw new Error("Invalid host");
  }

  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("Host is not allowed");
  }

  if (host.includes(":")) {
    throw new Error("Host is not allowed");
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && isBlockedIpv4(host)) {
    throw new Error("Host is not allowed");
  }

  return url;
}

export async function assertHostnameResolvesPublicly(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    return;
  }

  let records: LookupAddress[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("Invalid host");
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Invalid host");
  }

  for (const record of records) {
    if (record.family === 4 && isBlockedIpv4(record.address)) {
      throw new Error("Host is not allowed");
    }
    if (record.family === 6 && isBlockedIpv6(record.address)) {
      throw new Error("Host is not allowed");
    }
  }
}
