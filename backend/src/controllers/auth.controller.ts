import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { AuditService } from "../services/audit.service.js";

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  const users = await query<any>("SELECT * FROM users WHERE email = ?", [email]);
  if (users.length === 0) {
    await AuditService.record({
      action: "USER_LOGIN_FAILED",
      ipAddress: ip,
      status: "DENIED",
      metadata: { attemptedEmail: email }
    });
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const user = users[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    await AuditService.record({
      actorId: user.id,
      action: "USER_LOGIN_FAILED",
      ipAddress: ip,
      status: "DENIED"
    });
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: "8h" }
  );

  await AuditService.record({
    actorId: user.id,
    action: "USER_LOGIN",
    ipAddress: ip,
    status: "SUCCESS"
  });

  res.json({
    token,
    user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role }
  });
}
