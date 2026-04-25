import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/recipe-sharing", () => ({
  mintShareToken: vi.fn(),
  resolveSharedRecipeByToken: vi.fn(),
  hashShareToken: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  getPublicEnvironment: () => ({ siteUrl: "https://cookstash.test" }),
}));

import { POST } from "@/app/api/share/route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mintShareToken, resolveSharedRecipeByToken, hashShareToken } from "@/lib/recipe-sharing";

const mockedFeatureFlag = vi.mocked(isFeatureEnabled);
const mockedCreateSupabase = vi.mocked(createServerSupabaseClient);
const mockedMintToken = vi.mocked(mintShareToken);
const mockedResolveShared = vi.mocked(resolveSharedRecipeByToken);
const mockedHashToken = vi.mocked(hashShareToken);

function buildSupabaseForShare() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner-1" } } }) },
    from: vi.fn((table: string) => {
      if (table === "recipes") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: "r1", user_id: "owner-1" }, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "copy-1", name: "Pasta (Shared copy)", user_id: "owner-1", created_at: "now" },
                error: null,
              }),
            }),
          }),
        };
      }

      return {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
  };
}

describe("sharing controls regression", () => {
  beforeEach(() => {
    mockedFeatureFlag.mockResolvedValue(true);
    mockedMintToken.mockReturnValue("raw-token");
    mockedHashToken.mockReturnValue("hashed-token");
  });

  it("creates share links for owned recipes", async () => {
    mockedCreateSupabase.mockResolvedValue(buildSupabaseForShare() as never);

    const response = await POST(
      new Request("http://localhost/api/share", {
        method: "POST",
        body: JSON.stringify({ action: "create", recipeId: "r1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "created",
      token: "raw-token",
      shareUrl: "https://cookstash.test/shared/recipe?token=raw-token",
    });
  });

  it("saves a shared recipe copy", async () => {
    mockedCreateSupabase.mockResolvedValue(buildSupabaseForShare() as never);
    mockedResolveShared.mockResolvedValue({
      ownerUserId: "other-user",
      recipe: {
        name: "Pasta",
        source_url: "https://example.com",
        instructions: "Cook",
        ingredients: ["1 tomato"],
        tags: ["dinner"],
      },
    } as never);

    const response = await POST(
      new Request("http://localhost/api/share", {
        method: "POST",
        body: JSON.stringify({ action: "saveCopy", token: "valid-token" }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toHaveProperty("savedRecipe.id", "copy-1");
  });

  it("rejects invalid actions", async () => {
    mockedCreateSupabase.mockResolvedValue(buildSupabaseForShare() as never);

    const response = await POST(
      new Request("http://localhost/api/share", {
        method: "POST",
        body: JSON.stringify({ action: "unknown", recipeId: "r1" }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
