import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type ItemUpdate = {
  itemId: string;
  isChecked: boolean;
};

function parseItemUpdate(value: unknown): ItemUpdate | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const itemId =
    "itemId" in value && typeof (value as { itemId: unknown }).itemId === "string"
      ? (value as { itemId: string }).itemId.trim()
      : "";
  const isChecked =
    "isChecked" in value && typeof (value as { isChecked: unknown }).isChecked === "boolean"
      ? (value as { isChecked: boolean }).isChecked
      : null;

  if (!itemId || isChecked === null) {
    return null;
  }

  return { itemId, isChecked };
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update = parseItemUpdate(body);
  if (!update) {
    return NextResponse.json({ error: "itemId and isChecked are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("shopping_list_items")
    .update({
      is_checked: update.isChecked,
      is_skipped: false,
    })
    .eq("id", update.itemId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updatesRaw =
    typeof body === "object" && body !== null && "updates" in body
      ? (body as { updates: unknown }).updates
      : [];
  const updates = Array.isArray(updatesRaw)
    ? updatesRaw
        .map(parseItemUpdate)
        .filter((value): value is ItemUpdate => value !== null)
    : [];

  if (updates.length === 0) {
    return NextResponse.json({ error: "updates must include at least one item" }, { status: 400 });
  }

  for (const update of updates) {
    const { error } = await supabase
      .from("shopping_list_items")
      .update({
        is_checked: update.isChecked,
        is_skipped: false,
      })
      .eq("id", update.itemId)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message, itemId: update.itemId }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, applied: updates.length });
}
