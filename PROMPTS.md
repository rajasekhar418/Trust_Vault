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
