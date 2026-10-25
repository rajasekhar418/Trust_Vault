# THREATS.md — TrustVault Threat Model & Risk Posture

This document details the threat landscape evaluated during the design and implementation of TrustVault. It maps the attack surfaces, vectors, engineering mitigations, automated verification tests, and knowingly accepted architectural risks.

---

## 1. Threat Matrix & Mitigations

### T1: Insecure Direct Object Reference (IDOR) & Horizontal Privilege Escalation
* **Vector**: An authenticated caller modifies `document_id` in API calls (e.g., `GET /api/documents/:id/download` or `PATCH /api/documents/:id`) to retrieve or tamper with files owned by other organizations or users.
* **Mitigation**:
  * Request parameters (`req.params.id`) are never trusted without authoritative database validation.
  * Every query joins against the authenticated user context (`req.user.id`) from the verified JWT:
    ```sql
    SELECT d.*, ds.permission, ds.download_count, ds.max_downloads, ds.expires_at 
    FROM documents d
    LEFT JOIN document_shares ds 
      ON d.id = ds.document_id AND ds.shared_with_user_id = ?
    WHERE d.id = ? 
      AND d.is_deleted = 0 
      AND (d.owner_id = ? OR ds.id IS NOT NULL)
    ```
  * Admins cannot download file ciphertext without explicit share grants or documented ownership.
* **Automated Test**: `tests/security.test.ts` -> `RULE 1: Unauthorized user CANNOT access unshared document` (returns HTTP 404/403).

---

### T2: Stale Authorization Window via Pre-Signed Links or Cached Tokens
* **Vector**: An owner revokes access, but a recipient retains an active pre-signed S3 URL, an unexpired capability token, or a client cache entry allowing ongoing downloads.
* **Mitigation**:
  * Pre-signed static links are completely excluded from the architecture.
  * Documents are encrypted at rest with AES-256-GCM and streamed exclusively through dynamic Node.js transform streams.
  * The database check executes atomically on the download request. Deleting a grant from `document_shares` halts subsequent requests immediately.
* **Automated Test**: `tests/security.test.ts` -> `RULE 2: Revoking access immediately prevents file decryption` (subsequent GET returns HTTP 403).

---

### T3: Storage Tampering & Ciphertext Bit-Flipping
* **Vector**: An attacker with direct disk or database access modifies ciphertext bits, alters the encrypted payload, or injects malicious content into existing files.
* **Mitigation**:
  * TrustVault uses authenticated encryption with associated data (**AES-256-GCM**).
  * Every encrypted document stores an initialization vector (`iv`, 12 bytes) and an authentication tag (`auth_tag`, 16 bytes).
  * If a single byte of ciphertext or metadata is modified, the GCM decipher verification fails with an authentication tag error (`ERR_CRYPTO_INITIALIZATION_ERROR`).
  * The controller traps this error, immediately aborts the stream, responds with HTTP 400, and logs an immutable `DOCUMENT_TAMPER_DETECTED` security alert.
* **Automated Test**: `tests/security.test.ts` -> `RULE 3: Storage cipher modification triggers GCM tag integrity failure`.

---

### T4: Audit Trail Repudiation & Silent Log Manipulation
* **Vector**: An internal actor with database access modifies or drops rows in `audit_logs` to conceal unauthorized downloads, deletions, or metadata modifications.
* **Mitigation**:
  * **Cryptographic Hash Chaining**: Every log row computes a SHA-256 hash linking to the preceding entry:
    $$\text{current\_hash} = \text{SHA256}(\text{previous\_hash} + \text{actor\_id} + \text{action} + \text{timestamp} + \text{resource\_id})$$
  * Any manual deletion or inline update breaks the hash linkage for all downstream records.
  * **Database-Level Trigger Enforcement**: `BEFORE UPDATE` and `BEFORE DELETE` triggers reject mutations directly in MySQL using `SIGNAL SQLSTATE '45000'`.

---

### T5: Malicious File Ingestion & Executable Polyglots
* **Vector**: An attacker renames an executable script or Windows PE binary (`malware.exe` to `invoice.pdf`) and transmits a spoofed `Content-Type: application/pdf` header to bypass extension checks.
* **Mitigation**:
  * The server uses in-memory file ingestion (`memoryStorage()`) and inspects file magic bytes using `file-type` before writing to disk.
  * Only whitelisted binary signatures (`application/pdf`, `image/png`, `image/jpeg`, `application/vnd.openxmlformats-officedocument...`) are accepted.
  * Executable formats (`application/x-dosexec`, shell scripts) are rejected with HTTP 400.
  * Files are stored under random server-generated UUIDs without original filenames to eliminate directory traversal exploits (`../../etc/passwd`).

---

### T6: Credential Stuffing & Denial of Service (DoS)
* **Vector**: Automated bots brute-force the authentication gateway or exhaust server memory by uploading oversized file streams.
* **Mitigation**:
  * Configured `express-rate-limit` on `/api/auth/login` (limited to 15 attempts per 15 minutes per IP).
  * Configured upload throttles (limited to 20 requests per minute per IP).
  * Enforced file size limits (10 MB cap) at the Multer buffer ingestion stage.

---

## 2. Knowingly Accepted Residual Risks

The following limitations were evaluated and consciously accepted in the design:

| ID | Residual Threat | Reason for Acceptance | Compensating Security Control |
| :--- | :--- | :--- | :--- |
| **R1** | **Client-Side Screengrab / External Camera Capture** | Once decrypted pixels are rendered on a physical monitor, hardware-level screen captures or external camera recordings cannot be prevented by web applications. | All view sessions require authentication and append an immutable `DOCUMENT_VIEWED` record to the audit trail for strict legal non-repudiation. |
| **R2** | **Compromise of `MASTER_KEY` via Host Environment Breach** | If the host OS running Node.js is compromised, an attacker with root memory access can extract runtime environment variables. | Key access is restricted to the execution environment via `.env` / secret managers. File contents remain protected against offline disk theft. |
| **R3** | **Single Point of Database Administration** | A root DBA with full server privileges can theoretically disable triggers or drop the entire `audit_logs` table. | Audit rows are cryptographically hash-chained so that selective tampering cannot be hidden; full reconstruction or export to external SIEM/WORM storage can detect total drops. |

---

## 3. Threat Verification Mapping

| Threat Reference | Core Component | Automated Test Suite | Passing Verdict |
| :--- | :--- | :--- | :--- |
| **T1: IDOR / Access Reach** | `share.controller.ts` | `tests/security.test.ts` (Rule 1) | PASS |
| **T2: Revocation Infallibility** | `document.controller.ts` | `tests/security.test.ts` (Rule 2) | PASS |
| **T3: Ciphertext Tampering** | `crypto.service.ts` | `tests/security.test.ts` (Rule 3) | PASS |
| **T4: Audit Hash Chaining** | `audit.service.ts` | `tests/audit.test.ts` | PASS |
| **T5: Magic-Byte Inspection** | `document.controller.ts` | `tests/upload.test.ts` | PASS |