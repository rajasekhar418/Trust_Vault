import { Router, Request, Response } from "express";
import { query } from "../config/db.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;

    let sql = "";
    let params: any[] = [];

    if (userRole === "ADMIN") {
      sql = `
        SELECT a.*, u.email as actor_email, d.title as document_title
        FROM audit_logs a
        LEFT JOIN users u ON a.actor_id = u.id
        LEFT JOIN documents d ON a.resource_id = d.id
        ORDER BY a.sequence_id DESC
        LIMIT 100
      `;
    } else {
      sql = `
        SELECT a.*, u.email as actor_email, d.title as document_title
        FROM audit_logs a
        LEFT JOIN users u ON a.actor_id = u.id
        LEFT JOIN documents d ON a.resource_id = d.id
        WHERE d.owner_id = ? OR a.actor_id = ?
        ORDER BY a.sequence_id DESC
        LIMIT 50
      `;
      params = [userId, userId];
    }

    const rows = await query<any>(sql, params);
    return res.json({ logs: rows });
  } catch (error) {
    console.error("Audit log error:", error);
    return res.status(500).json({ error: "Failed to fetch audit records." });
  }
});

export default router;