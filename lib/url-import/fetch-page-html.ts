import {
  assertHostnameResolvesPublicly,
  assertUrlSafeForServerFetch,
} from "@/lib/url-import/assert-url-safe";

const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function readBodyWithCap(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) {
      throw new Error("Response body is too large");
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new Error("Response body is too large");
    }
    return text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Response body is too large");
    }
    chunks.push(value);
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(concatChunks(chunks));
}

export type FetchPageHtmlResult = {
  /** Final URL after redirects (validated at each hop). */
  finalUrl: string;
  html: string;
};

export async function fetchPageHtml(
  initialUrl: string,
  options?: { maxBytes?: number; timeoutMs?: number },
): Promise<FetchPageHtmlResult> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let current = assertUrlSafeForServerFetch(initialUrl).href;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const parsed = assertUrlSafeForServerFetch(current);
    await assertHostnameResolvesPublicly(parsed);

    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "CookstashUrlImport/1.0",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) {
        throw new Error("Too many redirects or missing Location header");
      }
      current = new URL(location, current).href;
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (
      contentType.length > 0 &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      throw new Error("URL did not return HTML");
    }

    const html = await readBodyWithCap(response, maxBytes);
    return { finalUrl: current, html };
  }

  throw new Error("Too many redirects");
}
