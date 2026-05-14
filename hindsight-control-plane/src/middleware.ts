import { NextRequest, NextResponse } from "next/server";

function extractTenantSlug(hostname: string): string | null {
  const hostWithoutPort = hostname.split(":")[0];
  const parts = hostWithoutPort.split(".cp.");
  if (parts.length < 2) return null;
  return parts[0];
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const tenantSlug = extractTenantSlug(hostname);

  if (!tenantSlug) {
    return NextResponse.next();
  }

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
