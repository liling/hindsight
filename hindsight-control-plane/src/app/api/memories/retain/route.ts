import { NextRequest, NextResponse } from "next/server";
import { sdk, lowLevelClient } from "@/lib/hindsight-client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const bankId = body.bank_id || body.agent_id;

    if (!bankId) {
      return NextResponse.json({ error: "bank_id is required" }, { status: 400 });
    }

    const { items, document_id, document_tags, observation_scopes } = body;

    // Map observation_scopes into each item if provided at request level
    const mappedItems = observation_scopes
      ? items?.map((item: any) => ({
          ...item,
          observation_scopes: item.observation_scopes ?? observation_scopes,
        }))
      : items;

    const response = await sdk.retainMemories({
      client: lowLevelClient,
      path: { bank_id: bankId },
      body: {
        items: mappedItems,
        document_tags,
        async: false,
      },
    });

    return NextResponse.json(response.data, { status: 200 });
  } catch (error: any) {
    console.error("Error batch retain:", error);

    const errorMessage = error?.message || String(error);
    const errorDetails = error?.details;
    const statusCode = error?.statusCode;

    // If we have a statusCode, use it
    if (statusCode && typeof statusCode === "number") {
      return NextResponse.json(
        { error: errorMessage, details: errorDetails },
        { status: statusCode }
      );
    }

    // Otherwise, return generic 500 error
    return NextResponse.json({ error: errorMessage || "Failed to batch retain" }, { status: 500 });
  }
}
