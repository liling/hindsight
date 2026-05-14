import { NextRequest, NextResponse } from "next/server";

const COOKIE_MAX_AGE = 900;

export async function POST(request: NextRequest) {
  const managerApiUrl = process.env.HINDSIGHT_CP_MANAGER_API_URL || "http://localhost:8001";
  const saasHostUrl = process.env.HINDSIGHT_CP_SAAS_HOST_URL || "http://localhost:3000";

  let otp: string | undefined;
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    otp = formData.get("otp") as string | undefined;
  } else {
    try {
      const body = await request.json();
      otp = body.otp;
    } catch {
      // ignore parse error
    }
  }

  if (!otp) {
    return NextResponse.redirect(new URL("/dashboard", saasHostUrl), 303);
  }

  try {
    const resp = await fetch(`${managerApiUrl}/auth/exchange-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp }),
    });

    if (!resp.ok) {
      return NextResponse.redirect(new URL("/dashboard", saasHostUrl), 303);
    }

    const data = await resp.json();

    const proto = request.headers.get("x-forwarded-proto") || "http";
    const host = request.headers.get("host") || "";
    const targetUrl = new URL("/dashboard", `${proto}://${host}`);

    const response = NextResponse.redirect(targetUrl, 303);
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
  } catch (err) {
    console.error("[SSO] OTP exchange failed:", err);
    return NextResponse.redirect(new URL("/dashboard", saasHostUrl), 303);
  }
}
