import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { query } from "../config/db.js";

const router = Router();

router.get("/metrics", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "ADMIN") {
    res.status(403).json({ error: "Access denied. Admins only." });
    return;
  }

  try {
    const [docs] = await query<any>("SELECT COUNT(*) as total FROM documents WHERE is_deleted = 0");
    const [users] = await query<any>("SELECT COUNT(*) as total FROM users");
    const [tamper] = await query<any>(
      "SELECT COUNT(*) as total FROM audit_logs WHERE action = 'DOCUMENT_TAMPER_DETECTED'"
    );

    res.json({
      totalDocuments: docs.total,
      totalUsers: users.total,
      tamperAlerts: tamper.total,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch admin metrics." });
  }
});

export default router;