import { NextRequest, NextResponse } from "next/server";

const COOKIE_MAX_AGE = 900;

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

  return await handleSaasRequest(request);
}

async function handleSaasRequest(request: NextRequest) {
  const managerApiUrl = process.env.HINDSIGHT_CP_MANAGER_API_URL || "http://localhost:8001";
  const saasHostUrl = process.env.HINDSIGHT_CP_SAAS_HOST_URL || "http://localhost:3000";
  const { pathname, searchParams } = request.nextUrl;

  // Handle OTP exchange
  const otp = searchParams.get("otp");
  if (otp) {
    try {
      const resp = await fetch(`${managerApiUrl}/auth/exchange-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });

      if (!resp.ok) {
        return NextResponse.redirect(new URL("/dashboard", saasHostUrl));
      }

      const data = await resp.json();

      const proto = request.headers.get("x-forwarded-proto") || "http";
      const host = request.headers.get("host") || "";
      const targetPath = pathname === "/" ? "/dashboard" : pathname;
      const targetUrl = new URL(targetPath, `${proto}://${host}`);

      const response = NextResponse.redirect(targetUrl);
      response.cookies.set("session-jwt", data.jwt, {
        path: "/",
        maxAge: COOKIE_MAX_AGE,
        sameSite: "lax",
        httpOnly: true,
      });
      response.cookies.set("tenant-api-key", data.api_key, {
        path: "/",
        maxAge: COOKIE_MAX_AGE,
        sameSite: "lax",
        httpOnly: true,
      });
      return response;
    } catch {
      return NextResponse.redirect(new URL("/dashboard", saasHostUrl));
    }
  }

  // Validate existing session
  const jwt = request.cookies.get("session-jwt");
  if (!jwt) {
    return NextResponse.redirect(new URL("/dashboard", saasHostUrl));
  }

  // Inject tenant API key as request header so downstream API routes can use it
  const apiKey = request.cookies.get("tenant-api-key")?.value;
  const response = NextResponse.next();
  if (apiKey) {
    response.headers.set("x-api-key", apiKey);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
