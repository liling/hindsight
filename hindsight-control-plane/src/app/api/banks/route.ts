import { NextResponse } from "next/server";
import { sdk, lowLevelClient } from "@/lib/hindsight-client";

export async function GET() {
  try {
    const response = await sdk.listBanks({ client: lowLevelClient });

    // Check if the response has an error or no data
    if (response.error || !response.data) {
      console.error("API error:", response.error);
      return NextResponse.json({ error: "Failed to fetch banks from API" }, { status: 500 });
    }

    return NextResponse.json(response.data, { status: 200 });
  } catch (error) {
    console.error("Error fetching banks:", error);
    return NextResponse.json({ error: "Failed to fetch banks" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { bank_id } = body;

    if (!bank_id) {
      return NextResponse.json({ error: "bank_id is required" }, { status: 400 });
    }

    const response = await sdk.createOrUpdateBank({
      client: lowLevelClient,
      path: { bank_id },
      body: {},
    });

    if (response.error) {
      console.error("API error creating bank:", response.error);
      const status = response.error.status || 502;
      const message =
        (response.error as any).detail || (response.error as any).message || "API error";
      return NextResponse.json({ error: message }, { status });
    }

    const data = response.data;
    if (!data) {
      return NextResponse.json({ error: "No data returned from API" }, { status: 502 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error creating bank:", error);
    return NextResponse.json({ error: "Failed to create bank" }, { status: 500 });
  }
}
