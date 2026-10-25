import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { query } from "../config/db.js";
import { AuditService } from "../services/audit.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_vault_2026";

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body || {};
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  try {
    const users = await query<any>(
      "SELECT id, email, password_hash, role, full_name FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      await AuditService.record({
        action: "AUTH_LOGIN_FAILED",
        ipAddress: ip,
        status: "DENIED",
        metadata: { attemptedEmail: email, reason: "User not found" },
      });
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      await AuditService.record({
        actorId: user.id,
        action: "AUTH_LOGIN_FAILED",
        ipAddress: ip,
        status: "DENIED",
        metadata: { attemptedEmail: email, reason: "Password mismatch" },
      });
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    // Signed token with role and id
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    await AuditService.record({
      actorId: user.id,
      action: "AUTH_LOGIN_SUCCESS",
      ipAddress: ip,
      status: "SUCCESS",
      metadata: { role: user.role },
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Authentication service error." });
  }
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, fullName, role } = req.body || {};
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  if (!email || !password || !fullName) {
    res.status(400).json({ error: "Email, password, and fullName are required." });
    return;
  }

  const assignedRole = role && ["ADMIN", "OWNER", "VIEWER"].includes(role) ? role : "VIEWER";

  try {
    const existing = await query<any>("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0) {
      res.status(409).json({ error: "User already exists with this email." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();

    await query(
      "INSERT INTO users (id, email, password_hash, role, full_name, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [userId, email, passwordHash, assignedRole, fullName]
    );

    await AuditService.record({
      actorId: userId,
      action: "AUTH_USER_REGISTERED",
      ipAddress: ip,
      status: "SUCCESS",
      metadata: { role: assignedRole },
    });

    res.status(201).json({ message: "User registered successfully.", userId });
  } catch (error) {
    res.status(500).json({ error: "Registration failed." });
  }
}