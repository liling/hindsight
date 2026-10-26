import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  USER_AGENT,
  getDataplaneHeaders,
  getHindsightClient,
  lowLevelClient,
} from "@/lib/hindsight-client";
import { version } from "../../package.json";

const clientOptions = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@vectorize-io/hindsight-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vectorize-io/hindsight-client")>();
  return {
    ...actual,
    HindsightClient: class {
      constructor(options: Record<string, unknown>) {
        clientOptions.push(options);
      }
    },
  };
});

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-api-key": "tenant-key" }),
  cookies: async () => ({ get: () => undefined }),
}));

describe("dataplane User-Agent", () => {
  it("identifies the control plane and its version", () => {
    expect(USER_AGENT).toBe(`hindsight-control-plane/${version}`);
  });

  it("is sent on direct fetches and by the low-level client", async () => {
    expect(await getDataplaneHeaders({ "Content-Type": "application/json" })).toMatchObject({
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    });
    const headers = lowLevelClient.getConfig().headers as Headers;
    expect(headers.get("User-Agent")).toBe(USER_AGENT);
  });
});

describe("high-level client credentials", () => {
  beforeEach(() => {
    clientOptions.length = 0;
  });

  it("binds the SaaS tenant key injected by middleware", async () => {
    await getHindsightClient();
    expect(clientOptions.at(-1)).toMatchObject({
      baseUrl: expect.any(String),
      apiKey: "tenant-key",
      userAgent: USER_AGENT,
    });
  });
});
