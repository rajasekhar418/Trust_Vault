import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "ADMIN" | "USER";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required. Bearer token missing." });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session token." });
  }
}
