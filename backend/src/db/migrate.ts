import { pool } from "../config/db.js";

async function migrate() {
  console.log("Running MySQL schema migration...");
  const conn = await pool.getConnection();

  try {
    // 1. Users Table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id CHAR(36) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(150) NOT NULL,
        role ENUM("ADMIN", "USER") NOT NULL DEFAULT "USER",
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // 2. Documents Table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id CHAR(36) PRIMARY KEY,
        owner_id CHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT "General",
        description TEXT,
        storage_path VARCHAR(512) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size_bytes BIGINT NOT NULL,
        sha256_checksum CHAR(64) NOT NULL,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_owner (owner_id),
        INDEX idx_category (category),
        CONSTRAINT fk_docs_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);

    // 3. Document Grants Table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS document_grants (
        id CHAR(36) PRIMARY KEY,
        document_id CHAR(36) NOT NULL,
        grantee_id CHAR(36) NOT NULL,
        permission ENUM("VIEW", "EDIT") NOT NULL DEFAULT "VIEW",
        granted_by CHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_doc_grantee (document_id, grantee_id),
        CONSTRAINT fk_grant_doc FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        CONSTRAINT fk_grant_user FOREIGN KEY (grantee_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_grant_by FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);

    // 4. Append-Only Tamper-Evident Audit Logs Table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        sequence_id BIGINT AUTO_INCREMENT PRIMARY KEY,
        id CHAR(36) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actor_id CHAR(36) NULL,
        action VARCHAR(50) NOT NULL,
        resource_id CHAR(36) NULL,
        ip_address VARCHAR(45) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT "SUCCESS",
        metadata JSON NULL,
        previous_hash CHAR(64) NOT NULL,
        current_hash CHAR(64) NOT NULL,
        INDEX idx_actor (actor_id),
        INDEX idx_resource (resource_id),
        INDEX idx_timestamp (timestamp)
      ) ENGINE=InnoDB;
    `);

    // 5. Anti-Tamper Triggers
    await conn.query("DROP TRIGGER IF EXISTS trg_protect_audit_update;");
    await conn.query(`
      CREATE TRIGGER trg_protect_audit_update
      BEFORE UPDATE ON audit_logs
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE "45000"
        SET MESSAGE_TEXT = "SECURITY REJECTION: audit_logs is append-only. Modification is strictly prohibited.";
      END;
    `);

    await conn.query("DROP TRIGGER IF EXISTS trg_protect_audit_delete;");
    await conn.query(`
      CREATE TRIGGER trg_protect_audit_delete
      BEFORE DELETE ON audit_logs
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE "45000"
        SET MESSAGE_TEXT = "SECURITY REJECTION: audit_logs is append-only. Deletion is strictly prohibited.";
      END;
    `);

    console.log("Migration executed successfully.");
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(console.error);
