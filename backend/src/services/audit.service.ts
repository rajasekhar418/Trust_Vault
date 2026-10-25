import crypto from "crypto";
import { query } from "../config/db.js";


export class AuditService {
  static async record(params: {
    actorId?: string | null;
    action: string;
    resourceId?: string | null;
    ipAddress: string;
    status: "SUCCESS" | "DENIED";
    metadata?: Record<string, any>;
  }) {
    try {
      const lastRow = await query<any>(
        "SELECT current_hash FROM audit_logs ORDER BY sequence_id DESC LIMIT 1"
      );
      const previousHash = lastRow.length > 0 
        ? lastRow[0].current_hash 
        : "0000000000000000000000000000000000000000000000000000000000000000";

      const logId = crypto.randomUUID();
      const timestamp = new Date();
      const metadataStr = JSON.stringify(params.metadata || {});

      const payload = 
        previousHash +
        timestamp.toISOString() +
        (params.actorId || "ANONYMOUS") +
        params.action +
        (params.resourceId || "NONE") +
        params.status +
        params.ipAddress;

      const currentHash = crypto.createHash("sha256").update(payload).digest("hex");

      await query(
        `INSERT INTO audit_logs 
          (id, timestamp, actor_id, action, resource_id, ip_address, status, metadata, previous_hash, current_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          logId,
          timestamp,
          params.actorId || null,
          params.action,
          params.resourceId || null,
          params.ipAddress || "unknown",
          params.status,
          metadataStr,
          previousHash,
          currentHash
        ]
      );
    } catch (err) {
      console.error("CRITICAL: Audit log failure:", err);
    }
  }
}
