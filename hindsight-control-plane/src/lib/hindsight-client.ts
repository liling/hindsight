/**
 * Shared Hindsight API client instance for the control plane.
 * In standalone mode: configured via env vars (module-level singletons).
 * In SaaS mode: middleware injects x-api-key header; a custom fetch reads it per-request.
 */

import {
  HindsightClient,
  HindsightError,
  createClient,
  createConfig,
  sdk,
} from "@vectorize-io/hindsight-client";

export const DATAPLANE_URL = process.env.HINDSIGHT_CP_DATAPLANE_API_URL || "http://localhost:8888";
const DATAPLANE_API_KEY = process.env.HINDSIGHT_CP_DATAPLANE_API_KEY || "";

/**
 * Custom fetch that reads the API key from middleware-injected x-api-key header.
 * Falls back to HINDSIGHT_CP_DATAPLANE_API_KEY env var when the header is absent.
 */
const requestAwareFetch: typeof fetch = async (input, init) => {
  const apiKey = await getActiveApiKey();

  const newHeaders = new Headers(init?.headers as Record<string, string> | Headers | undefined);
  if (apiKey) newHeaders.set("Authorization", `Bearer ${apiKey}`);

  return globalThis.fetch(input, { ...init, headers: newHeaders });
};

/**
 * Read the API key for the current request.
 * Uses next/headers() which is async in Next.js 16.
 */
async function getActiveApiKey(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const headerList = await headers();
    const injected = headerList.get("x-api-key");
    if (injected) return injected;
  } catch {
    // Not in a request context — fall through to env var
  }
  return DATAPLANE_API_KEY;
}

/**
 * Auth headers for direct fetch calls to the dataplane API.
 */
export async function getDataplaneHeaders(
  extra?: Record<string, string>
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };
  const apiKey = await getActiveApiKey();
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Build a dataplane URL for a bank-scoped endpoint with the bank id properly encoded.
 */
export function dataplaneBankUrl(bankId: string, suffix = ""): string {
  return `${DATAPLANE_URL}/v1/default/banks/${encodeURIComponent(bankId)}${suffix}`;
}

// High-level client
export const hindsightClient = new HindsightClient({
  baseUrl: DATAPLANE_URL,
  apiKey: DATAPLANE_API_KEY || undefined,
});

// Low-level SDK client with request-aware fetch
export const lowLevelClient = createClient(
  createConfig({
    baseUrl: DATAPLANE_URL,
    fetch: requestAwareFetch,
  })
);

export { sdk };
export { HindsightError };
