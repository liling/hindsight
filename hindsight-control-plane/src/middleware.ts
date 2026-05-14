import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { localizeApiErrorPayload } from "@/lib/i18n/api-errors";
import createIntlMiddleware from "next-intl/middleware";

import { ACCESS_KEY_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { stripBasePath, withBasePath } from "@/lib/base-path";
import { routing } from "@/i18n/routing";

const PUBLIC_PATTERNS = [
  "/login",
  "/api/auth/",
  "/api/health",
  "/api/version",
  "/logo.png",
  "/favicon",
  "/_next",
  "/fonts",
  "/static",
];

function extractTenantSlug(hostname: string): string | null {
  const hostWithoutPort = hostname.split(":")[0];
  const parts = hostWithoutPort.split(".cp.");
  if (parts.length < 2) return null;
  return parts[0];
}

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // SaaS mode: route by tenant slug when present in hostname
  const hostname = request.headers.get("host") || "";
  const tenantSlug = extractTenantSlug(hostname);
  if (tenantSlug) {
    return await handleSaasRequest(request);
  }

async function handleSaasRequest(request: NextRequest) {
  // Allow SSO OTP exchange route to pass through without session check
  if (request.nextUrl.pathname === "/api/auth/sso") {
    return NextResponse.next();
  }

  // Validate existing session
  const jwt = request.cookies.get("session-jwt");
  if (!jwt) {
    const saasHostUrl = process.env.HINDSIGHT_CP_SAAS_HOST_URL || "http://localhost:3000";
    return NextResponse.redirect(new URL("/dashboard", saasHostUrl));
  }

  // Inject tenant API key as request header so downstream API routes can use it
  const apiKey = request.cookies.get("tenant-api-key")?.value;
  const requestHeaders = new Headers(request.headers);
  if (apiKey) {
    requestHeaders.set("x-api-key", apiKey);
  }
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // Match all paths except Next.js internals and static assets.
  // - Use an explicit file extension allowlist instead of .*\..* so that
  //   dynamic segments containing dots (e.g. bank IDs like
  //   "SX.Products.GovComply.Build") still get the i18n locale rewrite.
  matcher:
    "/((?!_next|_vercel|.*\\.(?:png|jpe?g|gif|svg|webp|ico|css|js|map|woff2?|ttf|eot|txt|xml|json)$).*)",
};
