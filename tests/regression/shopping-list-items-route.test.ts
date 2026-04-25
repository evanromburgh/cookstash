import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { PATCH, POST } from "@/app/api/shopping-list-items/route";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateSupabase = vi.mocked(createServerSupabaseClient);

function buildSupabase() {
  const updates: Array<{ id: string; userId: string; body: Record<string, unknown> }> = [];

  return {
    updates,
    client: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn(() => ({
        update: vi.fn((body: Record<string, unknown>) => ({
          eq: vi.fn((_: string, id: string) => ({
            eq: vi.fn((__: string, userId: string) => {
              updates.push({ id, userId, body });
              return Promise.resolve({ error: null });
            }),
          })),
        })),
      })),
    },
  };
}

describe("shopping list item lifecycle", () => {
  it("updates a single item state", async () => {
    const mocked = buildSupabase();
    mockedCreateSupabase.mockResolvedValue(mocked.client as never);

    const response = await PATCH(
      new Request("http://localhost/api/shopping-list-items", {
        method: "PATCH",
        body: JSON.stringify({ itemId: "i1", isChecked: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocked.updates).toHaveLength(1);
    expect(mocked.updates[0]).toMatchObject({ id: "i1", userId: "user-1", body: { is_checked: true } });
  });

  it("applies queued bulk updates in request order", async () => {
    const mocked = buildSupabase();
    mockedCreateSupabase.mockResolvedValue(mocked.client as never);

    const response = await POST(
      new Request("http://localhost/api/shopping-list-items", {
        method: "POST",
        body: JSON.stringify({
          updates: [
            { itemId: "i1", isChecked: true },
            { itemId: "i2", isChecked: false },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocked.updates.map((entry) => entry.id)).toEqual(["i1", "i2"]);
  });

  it("rejects empty bulk updates", async () => {
    const mocked = buildSupabase();
    mockedCreateSupabase.mockResolvedValue(mocked.client as never);

    const response = await POST(
      new Request("http://localhost/api/shopping-list-items", {
        method: "POST",
        body: JSON.stringify({ updates: [] }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
