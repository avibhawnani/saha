/**
 * Anakin client. Every call goes to /api/anakin, which the dev server proxies
 * to https://api.anakin.io/v1 with the X-API-Key header injected — so the key
 * is never in client code. See vite.config.ts.
 *
 * Endpoints used:
 *   POST /search          — synchronous AI web search (prompt, limit ≤ 20)
 *   GET  /wire/catalog    — the source catalog; public, no key required
 *
 * Deliberately NOT used: /agentic-search. It is the better tool for research
 * but takes 1–5 minutes, which is unusable behind a search box.
 */

const BASE = "/api/anakin";

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  date?: string;
  last_updated?: string;
}

/** Thrown with a readable reason so the UI can say what went wrong. */
export class AnakinError extends Error {
  readonly status: number;
  /** True when the fix is configuration rather than a retry. */
  readonly needsKey: boolean;

  constructor(message: string, status: number, needsKey = false) {
    super(message);
    this.name = "AnakinError";
    this.status = status;
    this.needsKey = needsKey;
  }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new AnakinError("Could not reach Anakin.", 0);
  }

  if (res.status === 401) {
    throw new AnakinError("No Anakin API key configured — set ANAKIN_API_KEY in .env.", 401, true);
  }
  if (res.status === 402) {
    throw new AnakinError("Anakin credits exhausted.", 402, true);
  }
  if (!res.ok) {
    throw new AnakinError(`Anakin returned ${res.status}.`, res.status);
  }
  return (await res.json()) as T;
}

/** Live web search. Fast enough to sit behind the ask box. */
export async function search(
  prompt: string,
  limit = 6,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const json = await post<{ id: string; results?: SearchResult[] }>(
    "/search",
    { prompt, limit },
    signal,
  );
  return json.results ?? [];
}

export interface CatalogEntry {
  slug: string;
  name: string;
  category: string;
  action_count: number;
}

/** The Wire catalog is public, so this works with or without a key. */
export async function catalog(signal?: AbortSignal): Promise<CatalogEntry[]> {
  const res = await fetch(`${BASE}/wire/catalog?limit=2000`, { signal });
  if (!res.ok) throw new AnakinError(`Catalog returned ${res.status}.`, res.status);
  const json = (await res.json()) as { catalog?: CatalogEntry[] };
  return json.catalog ?? [];
}
