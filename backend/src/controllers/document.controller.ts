import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { Readable } from "stream";
import { query } from "../config/db.js";
import { CryptoService } from "../services/crypto.service.js";
import { AuditService } from "../services/audit.service.js";

const STORAGE_DIR = path.resolve(process.cwd(), "storage/encrypted");

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

export async function uploadDocument(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.id;
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  if (!req.file || !req.file.buffer) {
    res.status(400).json({ error: "File payload is required." });
    return;
  }

  const { title, category, description } = req.body || {};
  if (!title || !category) {
    res.status(400).json({ error: "Title and category are required." });
    return;
  }

  const documentId = crypto.randomUUID();
  const encryptedStorageFileName = `${documentId}.enc`;
  const targetStoragePath = path.join(STORAGE_DIR, encryptedStorageFileName);

  try {
    // 1. Calculate SHA-256 integrity hash from the memory buffer
    const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

    // 2. Stream and encrypt in-memory buffer directly to encrypted disk storage
    const inputStream = Readable.from(req.file.buffer);
    const { ivHex, authTagHex } = await CryptoService.encryptFileStream(inputStream, targetStoragePath);

    // 3. Persist metadata into documents table
    await query(
      `INSERT INTO documents 
       (id, owner_id, title, category, description, storage_path, original_filename, mime_type, file_size_bytes, sha256_checksum, iv, auth_tag, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        documentId,
        userId,
        title,
        category,
        description || null,
        targetStoragePath,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        sha256,
        ivHex,
        authTagHex,
      ]
    );

    await AuditService.record({
      action: "DOCUMENT_UPLOADED",
      ipAddress: ip,
      status: "SUCCESS",
      metadata: { documentId, filename: req.file.originalname, sha256 },
    });

    res.status(201).json({
      id: documentId,
      title,
      category,
      originalFilename: req.file.originalname,
      fileSizeBytes: req.file.size,
      checksum: sha256,
    });
  } catch (error) {
    if (fs.existsSync(targetStoragePath)) {
      fs.unlinkSync(targetStoragePath);
    }
    res.status(500).json({ error: "Document encryption failed." });
  }
}

export async function downloadDocument(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = (req as any).user?.id;
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  try {
    const docs = await query<any>(
      "SELECT * FROM documents WHERE id = ? AND owner_id = ? AND is_deleted = 0 LIMIT 1",
      [id, userId]
    );

    if (docs.length === 0) {
      await AuditService.record({
        action: "DOCUMENT_DOWNLOAD_FAILED",
        ipAddress: ip,
        status: "DENIED",
        metadata: { attemptedDocumentId: id },
      });
      res.status(404).json({ error: "Document not found or access denied." });
      return;
    }

    const doc = docs[0];

    if (!fs.existsSync(doc.storage_path)) {
      res.status(500).json({ error: "Encrypted file missing from storage." });
      return;
    }

    res.setHeader("Content-Type", doc.mime_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(doc.original_filename)}"`
    );

    await CryptoService.decryptFileStream(
      doc.storage_path,
      doc.iv,
      doc.auth_tag,
      res
    );

    await AuditService.record({
      action: "DOCUMENT_DOWNLOADED",
      ipAddress: ip,
      status: "SUCCESS",
      metadata: { documentId: id },
    });
  } catch (error: any) {
    if (error.code === "ERR_CRYPTO_INITIALIZATION_ERROR" || (error.message && error.message.includes("auth"))) {
      await AuditService.record({
        action: "DOCUMENT_TAMPER_DETECTED",
        ipAddress: ip,
        status: "DENIED",
        metadata: { documentId: id, details: "GCM auth tag verification failed." },
      });
      if (!res.headersSent) {
        res.status(400).json({ error: "Cryptographic integrity check failed. Document corrupted or tampered." });
      }
      return;
    }

    if (!res.headersSent) {
      res.status(500).json({ error: "Stream decryption failed." });
    }
  }
}

export async function listDocuments(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.id;
  try {
    const docs = await query<any>(
      "SELECT id, title, category, description, original_filename, mime_type, file_size_bytes, sha256_checksum, created_at FROM documents WHERE owner_id = ? AND is_deleted = 0 ORDER BY created_at DESC",
      [userId]
    );
    res.json({ documents: docs });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch documents." });
  }
}
