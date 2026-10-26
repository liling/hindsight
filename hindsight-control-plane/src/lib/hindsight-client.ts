/**
 * Shared Hindsight API client helpers for the control plane.
 * In standalone mode: configured via env vars.
 * In SaaS mode: middleware injects x-api-key; a custom fetch reads it per-request.
 */

import {
  HindsightClient,
  HindsightError,
  createClient,
  createConfig,
  sdk,
} from "@vectorize-io/hindsight-client";
import { version } from "../../package.json";

export const DATAPLANE_URL = process.env.HINDSIGHT_CP_DATAPLANE_API_URL || "http://localhost:8888";
const DATAPLANE_API_KEY = process.env.HINDSIGHT_CP_DATAPLANE_API_KEY || "";

/** Sent on every dataplane request so the API can tell control-plane traffic apart. */
export const USER_AGENT = `hindsight-control-plane/${version}`;

/**
 * Custom fetch that reads the API key from middleware-injected x-api-key header.
 * Falls back to HINDSIGHT_CP_DATAPLANE_API_KEY env var when the header is absent.
 */
const requestAwareFetch: typeof fetch = async (input, init) => {
  const apiKey = await getActiveApiKey();

  // input may be a Request object (from the SDK), which already has headers set
  const baseHeaders = input instanceof Request ? input.headers : init?.headers;
  const newHeaders = new Headers(baseHeaders);
  if (apiKey) newHeaders.set("Authorization", `Bearer ${apiKey}`);

  return globalThis.fetch(input, { ...init, headers: newHeaders });
};

/**
 * Read the API key for the current request.
 * Uses next/headers() which is async in Next.js 16.
 * Resolution order: middleware-injected x-api-key header → tenant-api-key
 * httpOnly cookie (SaaS mode) → HINDSIGHT_CP_DATAPLANE_API_KEY env var.
 */
async function getActiveApiKey(): Promise<string> {
  try {
    const { headers, cookies } = await import("next/headers");
    const headerList = await headers();
    const injected = headerList.get("x-api-key");
    if (injected) return injected;

    const cookieList = await cookies();
    const tenantKey = cookieList.get("tenant-api-key")?.value;
    if (tenantKey) return tenantKey;
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
  const headers: Record<string, string> = { "User-Agent": USER_AGENT, ...extra };
  const apiKey = await getActiveApiKey();
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Build a dataplane URL for a bank-scoped endpoint with the bank id properly encoded.
 * Bank ids may contain `:`, `/`, `%`, etc. (e.g. openclaw `agent::channel::user`),
 * which must be percent-encoded before being interpolated into a URL path.
 */
export function dataplaneBankUrl(bankId: string, suffix = ""): string {
  return `${DATAPLANE_URL}/v1/default/banks/${encodeURIComponent(bankId)}${suffix}`;
}

// High-level client. HindsightClient bakes the API key into its headers at
// construction time and takes no custom fetch, so it is built per request to
// pick up the SaaS tenant key injected by middleware (or the env key).
export async function getHindsightClient(): Promise<HindsightClient> {
  return new HindsightClient({
    baseUrl: DATAPLANE_URL,
    apiKey: (await getActiveApiKey()) || undefined,
    userAgent: USER_AGENT,
  });
}

// Low-level SDK client with request-aware fetch
export const lowLevelClient = createClient(
  createConfig({
    baseUrl: DATAPLANE_URL,
    headers: new Headers({ "User-Agent": USER_AGENT }),
    fetch: requestAwareFetch,
  })
);

export { sdk };
export { HindsightError };
