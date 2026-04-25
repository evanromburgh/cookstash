const DEFAULT_HTTP_PORT = "80";
const DEFAULT_HTTPS_PORT = "443";

function isDefaultPort(protocol: string, port: string): boolean {
  return (
    (protocol === "http:" && port === DEFAULT_HTTP_PORT) ||
    (protocol === "https:" && port === DEFAULT_HTTPS_PORT)
  );
}

export function canonicalizeUrl(urlLike: string): string {
  const parsed = new URL(urlLike.trim());
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.port && isDefaultPort(parsed.protocol, parsed.port)) {
    parsed.port = "";
  }
  if (parsed.searchParams.size > 1) {
    parsed.searchParams.sort();
  }
  return parsed.href;
}

export function canonicalizeHttpUrlOrKeep(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return trimmed;
    }
    return canonicalizeUrl(trimmed);
  } catch {
    return trimmed;
  }
}
