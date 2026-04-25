import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { POST } from "@/app/api/shopping-lists/from-recipe/route";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateSupabase = vi.mocked(createServerSupabaseClient);

describe("shopping list creation from recipe", () => {
  it("rejects draft recipes with no ingredients", async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "recipes") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "r1", name: "Draft recipe", ingredients: [], user_id: "user-1" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };
    mockedCreateSupabase.mockResolvedValue(supabase as never);

    const response = await POST(
      new Request("http://localhost/api/shopping-lists/from-recipe", {
        method: "POST",
        body: JSON.stringify({ recipeId: "r1", scale: 1 }),
      }),
    );

    expect(response.status).toBe(422);
  });
});
