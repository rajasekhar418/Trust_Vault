import { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { query } from "../config/db.js";
import { AuditService } from "../services/audit.service.js";

const storageDir = process.env.STORAGE_DIR || "./storage";

export async function uploadDocument(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const file = req.file!;
  const { title, category, description } = req.body;
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "Document title is required." });
    return;
  }

  const docId = crypto.randomUUID();
  const diskStorageFilename = crypto.randomUUID();
  const diskPath = path.join(storageDir, diskStorageFilename);

  const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");

  await fs.writeFile(diskPath, file.buffer);

  await query(
    `INSERT INTO documents 
      (id, owner_id, title, category, description, storage_path, original_filename, mime_type, file_size_bytes, sha256_checksum)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      docId,
      user.id,
      title.trim(),
      category?.trim() || "General",
      description?.trim() || "",
      diskPath,
      path.basename(file.originalname),
      file.mimetype,
      file.size,
      sha256
    ]
  );

  await AuditService.record({
    actorId: user.id,
    action: "DOCUMENT_UPLOAD",
    resourceId: docId,
    ipAddress: ip,
    status: "SUCCESS",
    metadata: { originalFilename: file.originalname, size: file.size, mimeType: file.mimetype }
  });

  res.status(201).json({
    id: docId,
    title: title.trim(),
    category: category?.trim() || "General",
    originalFilename: file.originalname,
    fileSizeBytes: file.size,
    checksum: sha256
  });
}

export async function listDocuments(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const { search, category } = req.query;

  let sql = `
    SELECT DISTINCT d.id, d.title, d.category, d.mime_type, d.file_size_bytes, d.created_at, u.full_name as owner_name,
    CASE WHEN d.owner_id = ? THEN 'OWNER' ELSE COALESCE(g.permission, 'ADMIN_VIEW') END as user_permission
    FROM documents d
    JOIN users u ON d.owner_id = u.id
    LEFT JOIN document_grants g ON g.document_id = d.id AND g.grantee_id = ?
    WHERE d.is_deleted = FALSE
  `;

  const params: any[] = [user.id, user.id];

  if (user.role !== "ADMIN") {
    sql += ` AND (d.owner_id = ? OR g.grantee_id = ?)`;
    params.push(user.id, user.id);
  }

  if (category && typeof category === "string") {
    sql += ` AND d.category = ?`;
    params.push(category);
  }

  if (search && typeof search === "string") {
    sql += ` AND (d.title LIKE ? OR d.category LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY d.created_at DESC`;

  const rows = await query(sql, params);
  res.json(rows);
}
