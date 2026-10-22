# TrustVault Development & AI Interaction Log (PROMPTS.md)

## Entry 1 — 2026-10-21: Audit Trail Immutability & Database Architecture
* **Prompt Summary:**
  Asked the assistant for the best way to implement an append-only audit trail and immediate access revocation for a zero-trust document platform using MySQL.
* **What the AI Initially Proposed:**
  The AI suggested handling audit logging and permission checking purely inside Express application middleware and storing permissions inside JWT tokens.
* **Specific Flaws Identified:**
  1. **Violation of Non-Negotiable Standard 3 (Immediate Revocation):** If permissions are embedded inside JWT claims, revoking access does not take effect until the JWT expires (e.g., 1 hour later), leaving an active window for revoked users to download confidential documents.
  2. **Violation of Non-Negotiable Standard 2 (Audit Tampering):** Relying solely on application-level checks to prevent log modification leaves the audit trail vulnerable. Anyone with access to the database or an SQL injection path could execute `UPDATE` or `DELETE` queries to wipe tracks.
* **What Was Implemented Instead:**
  1. Kept JWT tokens strictly limited to identity authentication (`user_id`). Document access checks are executed dynamically against the `document_grants` table in MySQL on every single download request.
  2. Implemented database-level immutability triggers on `audit_logs` using MySQL `SIGNAL SQLSTATE '45000'` on `BEFORE UPDATE` and `BEFORE DELETE` to reject alterations directly at the DBMS layer.
  3. Structured the table schema to support cryptographic SHA-256 hash chaining linking each entry to its predecessor.

__________________________________________________________________________________________________________________________________________

## Entry 2 — 2026-10-22: File Ingestion Hardening & Remediation of Day 1 Storage Flaws
* **Prompt Summary:**
  Asked the assistant how to implement document ingestion, file type validation, and disk storage based on the schema established in Day 1.
* **What the AI Initially Proposed:**
  The AI suggested using standard Multer `diskStorage`, determining the file type via `req.file.mimetype` and file extension, and saving files under a sanitized version of `file.originalname`.
* **Specific Flaws Identified Over Day 1 Work:**
  1. **MIME Spoofing Vulnerability:** Relying on `req.file.mimetype` or the file extension provides zero zero-trust protection. A malicious actor can easily rename an executable script or Windows PE binary (`payload.exe` to `payload.pdf`) and send a spoofed `Content-Type: application/pdf` header, bypassing the check entirely.
  2. **Path Traversal & Namespace Collision:** Retaining any part of `file.originalname` on disk exposes the host to directory traversal payloads (e.g., `../../etc/passwd` or `..\system32`) and causes silent data loss if two users upload files with identical names.
  3. **Unvalidated Integrity Checksums:** While Day 1 defined a `sha256_checksum` column in the schema, saving directly to disk via streaming Multer made checksum verification an afterthought, risking unverified file ingestion.
* **What Was Implemented Instead:**
  1. Ingested files into memory buffer (`memoryStorage()`) so that verification occurs before any byte reaches permanent disk storage.
  2. Implemented magic-byte inspection using `file-type` to inspect the raw file signature (e.g., `%PDF-1.4` binary signatures), rejecting any file whose internal structure contradicts its declared type with HTTP 400.
  3. Decoupled physical storage from user input: all files are written to an isolated storage folder named strictly as server-generated random UUIDs without file extensions.
  4. Streamed the raw buffer through Node's `crypto.createHash('sha256')` during ingestion to store an authoritative fingerprint in MySQL.