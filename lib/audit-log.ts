type DestructiveAuditActionType = "recipe_delete" | "shopping_list_delete" | "recipe_share_revoke";
type DestructiveAuditTargetType = "recipe" | "shopping_list" | "recipe_share_link";

type DestructiveAuditRecord = {
  actorUserId: string;
  actionType: DestructiveAuditActionType;
  targetType: DestructiveAuditTargetType;
  targetId: string;
  happenedAt?: string;
};

type InsertCapableSupabase = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => Promise<{ error?: { message?: string } | null }>;
  };
};

export async function logDestructiveAuditRecord(
  supabase: InsertCapableSupabase,
  record: DestructiveAuditRecord,
): Promise<void> {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      actor_user_id: record.actorUserId,
      action_type: record.actionType,
      target_type: record.targetType,
      target_id: record.targetId,
      created_at: record.happenedAt ?? new Date().toISOString(),
    });
    if (error) {
      console.error("Failed to persist destructive audit log.", error.message ?? error);
    }
  } catch (error) {
    console.error("Unexpected destructive audit logging failure.", error);
  }
}
