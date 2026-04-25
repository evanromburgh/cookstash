import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/url-import/fetch-page-html", () => ({
  fetchPageHtml: vi.fn(),
}));
vi.mock("@/lib/url-import/jsonld-recipe", () => ({
  extractFirstJsonLdRecipeFromHtml: vi.fn(),
}));

import { POST } from "@/app/api/url-import/route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchPageHtml } from "@/lib/url-import/fetch-page-html";
import { extractFirstJsonLdRecipeFromHtml } from "@/lib/url-import/jsonld-recipe";

const mockedFeatureFlag = vi.mocked(isFeatureEnabled);
const mockedCreateSupabase = vi.mocked(createServerSupabaseClient);
const mockedFetchPageHtml = vi.mocked(fetchPageHtml);
const mockedExtractRecipe = vi.mocked(extractFirstJsonLdRecipeFromHtml);

function mockSupabase(userId = "user-1") {
  const eqSourceUrl = vi.fn().mockReturnValue({
    limit: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }),
  });
  const eqUserId = vi.fn().mockReturnValue({
    eq: eqSourceUrl,
  });
  const select = vi.fn().mockReturnValue({
    eq: eqUserId,
  });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
    from: vi.fn().mockReturnValue({ select }),
    __spies: {
      eqSourceUrl,
    },
  };
}

describe("url import regression", () => {
  beforeEach(() => {
    mockedFeatureFlag.mockResolvedValue(true);
  });

  it("returns parsed recipe for happy path", async () => {
    mockedCreateSupabase.mockResolvedValue(mockSupabase() as never);
    mockedFetchPageHtml.mockResolvedValue({
      finalUrl: "https://example.com/recipe",
      html: "<html></html>",
    });
    mockedExtractRecipe.mockReturnValue({
      name: "Pasta",
      ingredients: ["1 tomato"],
      instructions: "Cook it",
    });

    const response = await POST(
      new Request("http://localhost/api/url-import", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/recipe" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      name: "Pasta",
      sourceUrl: "https://example.com/recipe",
    });
  });

  it("returns fallback when no JSON-LD recipe payload exists", async () => {
    mockedCreateSupabase.mockResolvedValue(mockSupabase() as never);
    mockedFetchPageHtml.mockResolvedValue({
      finalUrl: "https://example.com/plain",
      html: "<html><head><title>Plain Page</title></head><body></body></html>",
    });
    mockedExtractRecipe.mockReturnValue(null);

    const response = await POST(
      new Request("http://localhost/api/url-import", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/plain" }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      fallback: { name: "Plain Page", sourceUrl: "https://example.com/plain" },
    });
  });

  it("classifies invalid-url failure as client error", async () => {
    mockedCreateSupabase.mockResolvedValue(mockSupabase() as never);
    mockedFetchPageHtml.mockRejectedValue(new Error("Invalid URL"));

    const response = await POST(
      new Request("http://localhost/api/url-import", {
        method: "POST",
        body: JSON.stringify({ url: "bad-url" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("canonicalizes url before duplicate lookup and response payload", async () => {
    const supabase = mockSupabase();
    mockedCreateSupabase.mockResolvedValue(supabase as never);
    mockedFetchPageHtml.mockResolvedValue({
      finalUrl: "https://EXAMPLE.com:443/recipe?b=2&a=1#fragment",
      html: "<html></html>",
    });
    mockedExtractRecipe.mockReturnValue({
      name: "Pasta",
      ingredients: [],
      instructions: null,
    });

    const response = await POST(
      new Request("http://localhost/api/url-import", {
        method: "POST",
        body: JSON.stringify({ url: "https://Example.com:443/recipe?b=2&a=1#ignore" }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.sourceUrl).toBe("https://example.com/recipe?a=1&b=2");
    expect((supabase as { __spies: { eqSourceUrl: ReturnType<typeof vi.fn> } }).__spies.eqSourceUrl).toHaveBeenCalledWith(
      "source_url",
      "https://example.com/recipe?a=1&b=2",
    );
  });

  it("reuses cached parse results for repeated canonical url retries", async () => {
    mockedCreateSupabase.mockResolvedValue(mockSupabase() as never);
    mockedFetchPageHtml.mockResolvedValue({
      finalUrl: "https://example.com/cache-target?b=2&a=1",
      html: "<html></html>",
    });
    mockedExtractRecipe.mockReturnValue({
      name: "Cached Pasta",
      ingredients: ["1 tomato"],
      instructions: "Cook it",
    });

    const first = await POST(
      new Request("http://localhost/api/url-import", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/cache-target?a=1&b=2" }),
      }),
    );
    const second = await POST(
      new Request("http://localhost/api/url-import", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/cache-target?b=2&a=1#x" }),
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockedFetchPageHtml).toHaveBeenCalledTimes(1);
    expect(mockedExtractRecipe).toHaveBeenCalledTimes(1);
  });
});
