# THREATS.md — TrustVault Security Model & Threat Assessment

## 1. Threats Identified and Mitigated

### T-01: Insecure Direct Object Reference (IDOR) on Document Retrieval
- **Threat**: An authenticated user modifies the document UUID parameter in `/api/documents/:id/download` to inspect or download confidential files belonging to other organizations or departments.
- **Mitigation**: Authorization is strictly enforced in SQL joins at the database layer on every call. The document row is only returned if `d.owner_id = userId` OR an active, unexpired record exists in `document_shares` matching `shared_with_user_id`. No file handle or decryption key is processed if this join returns 0 rows.
- **Verification**: Covered by `RULE 1` in `tests/security.test.ts`.

### T-02: Stale Permission Persistence via Pre-Signed URL Caching
- **Threat**: Revoking access does not invalidate previously issued S3 pre-signed URLs or cached bearer links, leaving a window of exposure until token expiration.
- **Mitigation**: TrustVault rejects pre-signed static storage URLs. All decrypted file bytes stream directly through Node.js after a real-time database validation query. Deleting a grant immediately breaks access for subsequent chunk requests.
- **Verification**: Covered by `RULE 2` in `tests/security.test.ts`.

### T-03: Ciphertext Manipulation and Bit-Flipping Attacks
- **Threat**: An attacker with filesystem access or compromised host storage alters bits in stored ciphertext to corrupt data or attempt chosen-ciphertext attacks.
- **Mitigation**: Implementation of AES-256-GCM (Authenticated Encryption with Associated Data). Node crypto deciphers verify a 16-byte authentication tag (`auth_tag`). Any byte corruption immediately throws an authentication error, halts streaming, issues HTTP 400, and records a `DOCUMENT_TAMPER_DETECTED` security audit log.
- **Verification**: Covered by `RULE 3` in `tests/security.test.ts`.

### T-04: Audit Trail Repudiation and Silent Row Tampering
- **Threat**: A compromised administrative account alters or deletes historical access records in the database to conceal illicit exfiltration.
- **Mitigation**: Cryptographic hash chaining. Each audit row stores:
  `current_hash = SHA256(previous_hash + actor_email + action + timestamp + resource_id)`
  Modifying any historical log breaks the verification chain for all subsequent entries.

### T-05: Malicious Executable Disguise Attacks
- **Threat**: An attacker uploads executable binaries (`.exe`, `.sh`, `.php`) masked with a `.pdf` or `.png` extension to execute remote code on worker services.
- **Mitigation**: Signature-level magic byte inspection in `uploadDocument`. Files are inspected for binary signatures (`%PDF`, `\x89PNG`, `\xFF\xD8\xFF`, `PK`) and blocked extensions are rejected before cipher streaming.

### T-06: Authentication Brute-Force & Credential Stuffing
- **Threat**: Automated dictionary attacks against `/api/auth/login` to compromise user passwords.
- **Mitigation**: IP-based rate limiting via `express-rate-limit` capped at 5 attempts per 15-minute window per IP address, backed by bcrypt hash rounds.

---

## 2. Knowingly Accepted Residual Risks

### R-01: Client-Side Content Extraction in "View-Only" Mode
- **Threat**: A recipient granted `VIEW` permissions captures the document data.
- **Why Accepted**: In a zero-plugin web architecture, decrypted bytes for PDF/image previews must reach client memory to be rendered by the DOM or canvas. While the UI disables right-click menus, hides browser toolbars, and blocks standard `Ctrl+P`/`Ctrl+S` commands, OS-level screen captures (e.g., Windows Snipping Tool) and memory inspection cannot be cryptographically blocked by the server. 
- **Compensating Controls**: Strict download rate limiting, disabling direct file attachment headers (`Content-Disposition: inline`), and immutable logging of every view event to guarantee non-repudiation.

### R-02: Stolen JWT Persistence During Active Token Lifetime
- **Threat**: If a user's JWT is exfiltrated from client storage, the bearer token remains valid until expiration.
- **Why Accepted**: Using stateless JWTs allows high-throughput API verification without requiring session lookups on static routes.
- **Compensating Controls**: Short 15-minute access token lifespan, coupled with real-time per-request database validation of document permissions (`document_shares`) so revoking document access takes effect immediately regardless of JWT validity.

### R-03: Node.js Master Key Residency in Memory
- **Threat**: A root user performing a physical memory dump of the host process could inspect the 32-byte AES Master Key.
- **Why Accepted**: Symmetric AES encryption requires the raw key inside process memory during cryptographic transformations.
- **Compensating Controls**: In production, key operations should be offloaded to an external Hardware Security Module (HSM) or AWS KMS envelope encryption.
