-- TrustVault Complete Schema & Seed Data

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('ADMIN', 'OWNER', 'VIEWER') NOT NULL DEFAULT 'VIEWER',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(36) PRIMARY KEY,
    owner_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT 'General',
    description TEXT,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    iv VARCHAR(64) NOT NULL,
    auth_tag VARCHAR(64) NOT NULL,
    sha256_checksum VARCHAR(64) NOT NULL,
    is_deleted TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_shares (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL,
    shared_with_user_id VARCHAR(36) NOT NULL,
    permission ENUM('VIEW', 'EDIT', 'DOWNLOAD') NOT NULL DEFAULT 'VIEW',
    download_count INT DEFAULT 0,
    max_downloads INT DEFAULT NULL,
    expires_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_document_user (document_id, shared_with_user_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    actor_id VARCHAR(36) NULL,
    actor_email VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(36) NULL,
    status ENUM('SUCCESS', 'DENIED', 'TAMPER_ALERT') NOT NULL DEFAULT 'SUCCESS',
    details TEXT,
    ip_address VARCHAR(45) NULL,
    previous_hash VARCHAR(64) NOT NULL,
    current_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Seed Accounts (Password: Password@123 with bcrypt salt 10)
INSERT INTO users (id, email, password_hash, role) VALUES 
('u-admin-001', 'admin@vault.local', '\\\.Yg2J3V0fUe6K.zO6c.VqP/r9.e3M2q9YF1xL0d7w9mB.aG', 'ADMIN'),
('u-owner-002', 'owner@vault.local', '\\\.Yg2J3V0fUe6K.zO6c.VqP/r9.e3M2q9YF1xL0d7w9mB.aG', 'OWNER'),
('u-viewer-003', 'viewer@vault.local', '\\\.Yg2J3V0fUe6K.zO6c.VqP/r9.e3M2q9YF1xL0d7w9mB.aG', 'VIEWER')
ON DUPLICATE KEY UPDATE email=VALUES(email);
