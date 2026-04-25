import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(),
}));

import { proxy } from "@/proxy";
import { updateSession } from "@/lib/supabase/middleware";

const mockedUpdateSession = vi.mocked(updateSession);

describe("auth recovery and access control", () => {
  it("redirects guests from dashboard to login with next path", async () => {
    mockedUpdateSession.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      user: null,
    });

    const request = new NextRequest("http://localhost:3000/dashboard");
    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?next=%2Fdashboard");
  });

  it("lets guests open forgot/reset password routes", async () => {
    mockedUpdateSession.mockResolvedValue({
      response: new Response("ok", { status: 200 }),
      user: null,
    });

    const forgotRequest = new NextRequest("http://localhost:3000/forgot-password");
    const resetRequest = new NextRequest("http://localhost:3000/reset-password");

    const forgotResponse = await proxy(forgotRequest);
    const resetResponse = await proxy(resetRequest);

    expect(forgotResponse.status).toBe(200);
    expect(resetResponse.status).toBe(200);
  });
});
