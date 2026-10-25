# \---

# 

# \## 1. Seed Accounts \& Credentials

# 

# The database comes pre-seeded with three accounts:

# 

# | Role | Email | Password | Access Capabilities |

# | :--- | :--- | :--- | :--- |

# | \*\*Administrator\*\* | admin@vault.local | Password@123 | Full system oversight, audit log inspection, metrics, file deletion. |

# | \*\*Document Owner\*\* | owner@vault.local | Password@123 | Encrypted uploads (AES-256-GCM), permission delegation, quota management, instant revocation. |

# | \*\*Viewer\*\* | viewer@vault.local | Password@123 | In-app view-only modal for shared documents. No download or edit access. |

# 

# \---

# 

# \## 2. The Permission Model

# 

# \- \*\*Ownership Isolation\*\*: Every document is permanently tied to an owner\_id.

# \- \*\*Granular Delegation\*\*: Explicit grants per document: VIEW, EDIT, or DOWNLOAD with optional download limits and expiry timestamps.

# \- \*\*Immediate Revocation\*\*: Dynamic Node.js AES-256-GCM stream decryption checks authorization in real time on every request. Revoking a share blocks access instantly.

# \- \*\*Audit Immutability\*\*: All actions and denied requests are recorded using SHA-256 hash chaining:

# &#x20; current\_hash = SHA256(previous\_hash + actor\_id + action + timestamp + resource\_id)

# 

# \---

# 

# \## 3. What Was Built vs. Deliberately Omitted

# 

# \### Built

# \- AES-256-GCM authenticated encryption at rest with per-file IV and auth tags.

# \- Ephemeral stream decryption direct to the client; no decrypted storage on disk.

# \- Storage tamper detection that aborts streams and logs security alerts on tag mismatch.

# \- Magic-byte validation on memory buffers to prevent executable uploads.

# \- Route-level rate limiting on auth and uploads, plus locked CORS.

# 

# \### Deliberately Omitted

# \- Client-side DRM/canvas tricks (relies instead on non-repudiation and server-side audit logs).

# \- Anonymous public links (all access must map to an accountable identity).

# \- Folder hierarchy inheritance (to prevent accidental permission creep).

# 

# \---

# 

# \## 4. API Authorization Matrix

# 

# | Endpoint | Method | Role | Policy |

# | :--- | :---: | :--- | :--- |

# | /api/auth/login | POST | Public | Rate-limited (15 req/15 min). Returns JWT. |

# | /api/auth/register | POST | Public | Validates email; hashes via bcrypt. |

# | /api/documents | GET | Auth | Scoped to owner\_id (Admins see all). Supports search. |

# | /api/documents | POST | OWNER, ADMIN | Rate-limited. Validates magic bytes; streams AES-GCM to disk. |

# | /api/documents/:id/download | GET | OWNER, Delegate | Atomic DB check. Decrypts stream; aborts on tamper. |

# | /api/documents/:id | PATCH | OWNER, EDIT | Updates metadata; logs audit entry. |

# | /api/documents/:id | DELETE | OWNER, ADMIN | Soft-deletes record (is\_deleted = 1). |

# | /api/documents/shared-with-me | GET | Auth | Returns active shared documents within limits/expiry. |

# | /api/documents/:id/share | POST | OWNER | Adds grant (VIEW, EDIT, DOWNLOAD). |

# | /api/documents/:id/shares | GET | OWNER | Lists active shares and download counts. |

# | /api/documents/:id/share/:shareId | DELETE | OWNER | Deletes share; immediately revokes access. |

# | /api/audit | GET | ADMIN, OWNER | Returns SHA-256 hash-chained logs. |

# | /api/admin/metrics | GET | ADMIN | System metrics and tamper alerts. |

# 

# \---

# 

# \## 5. Local Setup \& Deployment

# 

# \### Database Setup

# ```bash

# mysql -u root -p < backend/src/db/schema.sql

