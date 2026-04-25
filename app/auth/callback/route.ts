import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const redirectUrl = new URL("/login", requestUrl.origin);
      redirectUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
