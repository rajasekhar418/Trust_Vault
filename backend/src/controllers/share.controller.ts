import { Request, Response } from "express";
import crypto from "crypto";
import { query } from "../config/db.js";
import { AuditService } from "../services/audit.service.js";

// POST /api/documents/:id/share
export async function shareDocument(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.id;
  const { id: documentId } = req.params;
  const { recipientEmail, permission = "VIEW", maxDownloads, expiresAt } = req.body;

  try {
    // 1. Verify document ownership
    const docs = await query<any>(
      `SELECT id, title FROM documents WHERE id = ? AND owner_id = ? AND is_deleted = 0`,
      [documentId, userId]
    );

    if (!docs || docs.length === 0) {
      res.status(404).json({ error: "Document not found or access denied." });
      return;
    }

    // 2. Find recipient user
    const recipients = await query<any>(
      `SELECT id, email FROM users WHERE email = ?`,
      [recipientEmail?.trim()]
    );

    if (!recipients || recipients.length === 0) {
      res.status(404).json({ error: "Recipient user not found." });
      return;
    }

    const recipient = recipients[0];

    if (recipient.id === userId) {
      res.status(400).json({ error: "Cannot share a document with yourself." });
      return;
    }

    // 3. Prepare values
    const shareId = crypto.randomUUID();
    const finalPermission = String(permission).toUpperCase();
    const finalMaxDownloads = finalPermission === "VIEW" ? null : (maxDownloads ? Number(maxDownloads) : 1);
    const finalExpiresAt = expiresAt ? new Date(expiresAt) : null;

    // 4. Insert share record (including owner_id)
    await query(
      `INSERT INTO document_shares 
        (id, document_id, owner_id, shared_with_user_id, permission, max_downloads, download_count, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, NOW())`,
      [shareId, documentId, userId, recipient.id, finalPermission, finalMaxDownloads, finalExpiresAt]
    );

    // 5. Audit log
    try {
      await AuditService.record({
        actorId: userId,
        action: "DOCUMENT_SHARE",
        resourceId: documentId,
        ipAddress: req.ip || "127.0.0.1",
        status: "SUCCESS",
        metadata: {
          recipientEmail: recipient.email,
          permission: finalPermission,
          maxDownloads: finalMaxDownloads
        }
      });
    } catch (auditErr) {
      console.warn("Audit log skipped:", auditErr);
    }

    res.json({ message: "Access successfully delegated.", shareId });
  } catch (error: any) {
    console.error("Failed to share document:", error);
    res.status(500).json({ error: error?.message || "Failed to share document." });
  }
}

// GET /api/documents/shared-with-me
export async function getSharedWithMe(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.id;

  try {
    const shares = await query<any>(
      `SELECT ds.id AS share_id, ds.permission, ds.expires_at, ds.max_downloads, ds.download_count,
              d.id AS document_id, d.title, d.category, d.description, d.original_filename,
              d.file_size_bytes, d.sha256_checksum, u.email AS shared_by
       FROM document_shares ds
       JOIN documents d ON ds.document_id = d.id
       LEFT JOIN users u ON ds.owner_id = u.id
       WHERE ds.shared_with_user_id = ?
         AND d.is_deleted = 0
         AND (ds.expires_at IS NULL OR ds.expires_at > NOW())
         AND (
           ds.permission = 'VIEW'
           OR ds.max_downloads IS NULL
           OR ds.download_count < ds.max_downloads
         )
       ORDER BY ds.created_at DESC`,
      [userId]
    );

    res.json({ sharedDocuments: shares });
  } catch (error) {
    console.error("Fetch shared docs error:", error);
    res.status(500).json({ error: "Failed to fetch shared documents." });
  }
}

// GET /api/documents/:id/shares
export async function getDocumentShares(req: Request, res: Response): Promise<void> {
  const documentId = req.params.id;
  const userId = (req as any).user?.id;

  try {
    // Only the document owner can inspect who has been granted access
    const docs = await query<any>(
      "SELECT id FROM documents WHERE id = ? AND owner_id = ? AND is_deleted = 0",
      [documentId, userId]
    );

    if (!docs || docs.length === 0) {
      res.status(404).json({ error: "Document not found or access denied." });
      return;
    }

    const shares = await query<any>(
      `SELECT ds.id, ds.permission, ds.expires_at, ds.max_downloads, ds.download_count, ds.created_at,
              u.email AS recipient_email, u.full_name AS recipient_name
       FROM document_shares ds
       JOIN users u ON ds.shared_with_user_id = u.id
       WHERE ds.document_id = ?
       ORDER BY ds.created_at DESC`,
      [documentId]
    );

    res.json({ shares });
  } catch (error) {
    console.error("Fetch shares error:", error);
    res.status(500).json({ error: "Failed to fetch document shares." });
  }
}

// DELETE /api/documents/:id/share/:shareId
export async function revokeShare(req: Request, res: Response): Promise<void> {
  const ownerId = (req as any).user?.id;
  const { id: documentId, shareId } = req.params;

  try {
    const docs = await query<any>(
      `SELECT id FROM documents WHERE id = ? AND owner_id = ?`,
      [documentId, ownerId]
    );

    if (!docs || docs.length === 0) {
      res.status(403).json({ error: "Unauthorized to revoke this share." });
      return;
    }

    await query(`DELETE FROM document_shares WHERE id = ? AND document_id = ?`, [shareId, documentId]);

    try {
      await AuditService.record({
        actorId: ownerId,
        action: "DOCUMENT_REVOKE",
        resourceId: documentId,
        ipAddress: req.ip || "127.0.0.1",
        status: "SUCCESS",
        metadata: { revokedShareId: shareId }
      });
    } catch (auditErr) {
      console.warn("Audit log skipped:", auditErr);
    }

    res.json({ message: "Share revoked successfully." });
  } catch (error) {
    console.error("Revoke error:", error);
    res.status(500).json({ error: "Failed to revoke share." });
  }
}