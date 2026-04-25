import { NextResponse } from "next/server";

import { isFeatureEnabled } from "@/lib/feature-flags";

export async function POST() {
  const enabled = await isFeatureEnabled("url_import");

  if (!enabled) {
    return NextResponse.json(
      { error: "URL import is currently disabled by feature flag." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      message: "URL import endpoint scaffolded. Implementation follows in later issues.",
    },
    { status: 501 },
  );
}
