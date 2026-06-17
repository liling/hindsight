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

  const accessKey = process.env.HINDSIGHT_CP_ACCESS_KEY;
  const { pathname } = request.nextUrl;
  const appPathname = stripBasePath(pathname);

  // API routes are not locale-prefixed — handle auth directly without i18n routing.
  if (appPathname.startsWith("/api/")) {
    if (!accessKey) {
      return NextResponse.next();
    }

    const isPublic = PUBLIC_PATTERNS.some((pattern) => appPathname.startsWith(pattern));
    if (isPublic) {
      return NextResponse.next();
    }

    const sessionCookie = request.cookies.get(ACCESS_KEY_COOKIE)?.value;
    const isAuthenticated = await verifySessionToken(sessionCookie, accessKey);

    if (!isAuthenticated) {
      return NextResponse.json(
        localizeApiErrorPayload(request, {
          error: "Unauthorized",
          errorKey: "api.errors.auth.unauthorized",
        }),
        { status: 401 }
      );
    }

    return NextResponse.next();
  }

  // Page routes: enforce auth first, then delegate to the i18n middleware for
  // locale negotiation and rewriting. With localePrefix "never" the locale is
  // never in the path, so appPathname is already the canonical route.
  if (accessKey) {
    const isPublic = PUBLIC_PATTERNS.some((pattern) => appPathname.startsWith(pattern));

    if (!isPublic) {
      const sessionCookie = request.cookies.get(ACCESS_KEY_COOKIE)?.value;
      const isAuthenticated = await verifySessionToken(sessionCookie, accessKey);

      if (!isAuthenticated) {
        // Next.js middleware redirects do not automatically inherit next.config basePath.
        // Prefix the target explicitly, but keep returnTo as the app-relative path so
        // client-side router.push() does not double-prefix after login.
        const loginUrl = new URL(withBasePath("/login"), request.url);
        loginUrl.searchParams.set("returnTo", appPathname);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  return intlMiddleware(request);
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

  // Inject tenant API key as request header so downstream API routes can use it.
  // For API routes, the override headers are applied directly. For page routes,
  // delegate to intlMiddleware for locale rewrite; the tenant-api-key cookie is
  // httpOnly so API routes can also read it directly via next/headers as fallback.
  const apiKey = request.cookies.get("tenant-api-key")?.value;
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (!apiKey) return NextResponse.next();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-api-key", apiKey);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Page routes: run i18n middleware so /dashboard rewrites to /[locale]/dashboard
  return intlMiddleware(request);
}

export const config = {
  // Match all paths except Next.js internals and static assets.
  // - Use an explicit file extension allowlist instead of .*\..* so that
  //   dynamic segments containing dots (e.g. bank IDs like
  //   "SX.Products.GovComply.Build") still get the i18n locale rewrite.
  matcher:
    "/((?!_next|_vercel|.*\\.(?:png|jpe?g|gif|svg|webp|ico|css|js|map|woff2?|ttf|eot|txt|xml|json)$).*)",
};
