import { withEmailClient } from "./client";

export interface PostalAuditEntry {
  actor: string;
  operation: string;
  targetType?: string;
  targetId?: string;
  status: "ok" | "error";
  details?: Record<string, unknown>;
  error?: string;
}

export async function appendPostalAudit(entry: PostalAuditEntry): Promise<void> {
  await withEmailClient((c) =>
    c.query(
      `INSERT INTO mp_postal_audit
         (actor, operation, target_type, target_id, status, details, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.actor,
        entry.operation,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.status,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.error ?? null,
      ],
    ),
  );
}
