# TrustVault Development & AI Interaction Log (PROMPTS.md)

## Entry 1 � 2026-10-21: Audit Trail Immutability & Database Architecture
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

## Entry 2 � 2026-10-22: File Ingestion Hardening & Remediation of Day 1 Storage Flaws
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

  _______________________________________________________________________________________________________________

  ## Day 3: At-Rest Cryptographic Architecture & Authenticated Streaming Retrieval

### 1. Objective & Architectural Goal
- Transition Trust Vault from storing unencrypted files on disk to a zero-knowledge at-rest cryptographic architecture using **AES-256-GCM**.
- Implement authenticated streaming retrieval so sensitive documents are never written decrypted to disk or buffered entirely into server memory, while enforcing strict ownership access and tamper detection.

---

### 2. Architectural Flaws Identified & Iterative Fixes
- **Flaw 1: Plaintext Storage at Rest**
  - *Previous State:* File uploads were placed directly onto the server file system in plaintext, making documents vulnerable to local compromise.
  - *Resolution:* Implemented stream-based AES-256-GCM encryption writing raw ciphertext (`.enc`) directly to isolated storage (`storage/encrypted/<id>.enc`).
- **Flaw 2: Missing Cryptographic Metadata in Schema**
  - *Previous State:* The database only tracked basic file metadata (`title`, `storage_path`, `sha256_checksum`). Authenticated decryption was impossible without tracking per-file cryptographic parameters.
  - *Resolution:* Migrated the database schema to store dedicated `iv` (`VARCHAR(32)`) and `auth_tag` (`VARCHAR(32)`) columns adjacent to `sha256_checksum`.
- **Flaw 3: In-Memory Multer vs. Disk Path Controller Mismatch**
  - *Previous State:* The upload route utilized in-memory buffering (`uploadMemory.single("file")`), but the controller attempted to read from `req.file.path`, resulting in runtime crashes.
  - *Resolution:* Refactored `uploadDocument` to convert the in-memory buffer (`req.file.buffer`) directly into a readable stream (`Readable.from(...)`), encrypting straight to disk without leaving plaintext remnants on the filesystem.
- **Flaw 4: Missing Endpoint Exposure**
  - *Previous State:* `downloadDocument` was declared inside the controller but not mounted in `src/app.ts`.
  - *Resolution:* Registered `GET /api/documents/:id/download` protected behind the `authenticate` middleware.

---

### 3. Implementation Details & Prompts
- **Database Schema Migration:**
  ```sql
  ALTER TABLE documents 
    ADD COLUMN iv VARCHAR(32) NOT NULL AFTER sha256_checksum,
    ADD COLUMN auth_tag VARCHAR(32) NOT NULL AFTER iv;

    
_______________________________________________________________________________________________________________

## Entry 4 — 2026-10-24: Granular Access Delegation, Instant Revocation & Client Boundary Enforcement
- **Prompt Summary:**
  Asked the assistant how to implement per-document sharing with configurable permissions (`VIEW`, `EDIT`, `DOWNLOAD`), access quotas, and frontend document viewing for delegated recipients.
- **What the AI Initially Proposed:**
  1. The AI generated a MySQL query to fetch shared documents that included `AND ds.download_count < ds.max_downloads` across all share records.
  2. The AI implemented the download streaming controller to increment `download_count` unconditionally on every GET request to `/api/documents/:id/download` and send `Content-Disposition: attachment`.
  3. On the frontend, the AI proposed rendering decrypted documents by generating an object URL and opening it directly via `window.open(blobUrl, "_blank")`.
- **Specific Flaws Identified:**
  1. **Silent Dropping of View-Only Records (Three-Valued Logic Trap):** View-only grants set `max_downloads = NULL` because viewing in-browser does not consume a download permit. In MySQL three-valued logic, `download_count < NULL` evaluates to `UNKNOWN` (falsy). This caused every view-only document to disappear from the viewer's dashboard.
  2. **Premature Download Quota Depletion & Forced File Attachment:** Decrementing quotas on every GET hit drained view-only access quotas prematurely. Setting `Content-Disposition: attachment` triggered the browser's download manager even when the owner only granted read-only viewing permissions.
  3. **Client-Side Boundary Bypass:** Opening the raw blob URL in an external tab invoked the browser's default PDF viewer plugin, providing prominent native "Save", "Print", and "Download" toolbars to view-only users.
- **What Was Implemented Instead:**
  1. Corrected the SQL sharing filter to explicitly support view-only permits and unbound download caps:
     ```sql
     AND (ds.permission = 'VIEW' OR ds.max_downloads IS NULL OR ds.download_count < ds.max_downloads)
     ```
  2. Implemented strict header and quota separation: served `Content-Disposition: inline` for `VIEW` sessions and only incremented `download_count` when `permission === 'DOWNLOAD'`.
  3. Built a secure in-app modal embedding an `<iframe>` loaded with `#toolbar=0&navpanes=0`, suppressed right-click context menus (`e.preventDefault()`), and blocked standard print/save hotkeys (`Ctrl+S`, `Ctrl+P`).
  4. Enforced immediate revocation: deleting a record from `document_shares` halts subsequent stream decryption requests instantly, returning HTTP 404/403.

_______________________________________________________________________________________________________________

## Entry 5 — 2026-10-25: Cryptographic Tamper Detection, Hash Chaining & Route Protection
- **Prompt Summary:**
  Asked the assistant how to handle decryption runtime exceptions, structure rate limiting, and finalize the tamper-detection pipeline when streaming AES-256-GCM ciphertexts.
- **What the AI Initially Proposed:**
  1. The AI wrapped `CryptoService.decryptFileStream` in a generic `try/catch` block returning a standard `500 Internal Server Error`.
  2. The AI left CORS set to a wildcard `origin: "*"` and left authentication endpoints unthrottled.
  3. In Express routing, the AI registered `/api/documents/:id` before `/api/documents/shared-with-me`.
- **Specific Flaws Identified:**
  1. **Masking Deliberate Bit-Flipping as Infrastructure Failure:** In AES-256-GCM, ciphertext bit manipulation or storage corruption causes the 16-byte authentication tag to fail validation (`ERR_CRYPTO_INITIALIZATION_ERROR`). Masking this behind a generic 500 error prevented administrators from distinguishing between server crashes and active storage tampering attacks, leaving the audit log blind.
  2. **Brute-Force & Cross-Origin Exposure:** Without endpoint-level rate limiting, `/api/auth/login` was vulnerable to credential stuffing attacks. A wildcard CORS policy allowed unauthorized web origins to make authenticated credentialed requests.
  3. **Route Precedence Collision:** Express route matching captured the string literal `"shared-with-me"` as a dynamic `:id` parameter, causing database queries to fail with UUID validation errors.
- **What Was Implemented Instead:**
  1. Separated cryptographic integrity failures from filesystem errors: explicitly caught GCM auth tag verification failures, immediately recorded an immutable `DOCUMENT_TAMPER_DETECTED` audit record with the actor ID and document ID, and returned HTTP 400.
  2. Locked CORS strictly to the configured frontend origin (`process.env.FRONTEND_ORIGIN || "http://localhost:5173"`) and added `express-rate-limit` to `/api/auth/login` (capping requests at 15 attempts per 15-minute window) and document uploads.
  3. Re-ordered routes in `app.ts` so `/api/documents/shared-with-me` is evaluated prior to dynamic parameter route `/api/documents/:id`.
  4. Verified cryptographic audit trail immutability where each row's SHA-256 hash depends on the preceding row:
     `current_hash = SHA256(previous_hash + actor_id + action + timestamp + resource_id)`
