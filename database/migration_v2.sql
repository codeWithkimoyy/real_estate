-- ============================================================
-- EstateFlow v2 Migration – Security & Feature Overhaul
-- Run AFTER the original schema.sql has been applied.
-- ============================================================

USE real_estate_db;

-- ============================================================
-- 1. SESSIONS TABLE (multi-device, hashed tokens)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT           NOT NULL,
  token_hash    VARCHAR(64)   NOT NULL,           -- SHA-256 of token
  device_info   VARCHAR(255)  NULL,               -- User-Agent
  ip_address    VARCHAR(45)   NULL,
  expires_at    DATETIME      NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token_hash (token_hash),
  INDEX idx_user_id    (user_id),
  INDEX idx_expires    (expires_at)
) ENGINE=InnoDB;

-- ============================================================
-- 2. RATE LIMITING TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  identifier    VARCHAR(255)  NOT NULL,           -- IP or user:ID
  action        VARCHAR(50)   NOT NULL,           -- login, register, api
  attempts      INT           NOT NULL DEFAULT 1,
  window_start  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_identifier_action (identifier, action),
  INDEX idx_window (window_start)
) ENGINE=InnoDB;

-- ============================================================
-- 3. NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT           NOT NULL,
  type          VARCHAR(50)   NOT NULL,           -- inquiry, appointment, payment, verification, system
  title         VARCHAR(255)  NOT NULL,
  message       TEXT          NOT NULL,
  reference_type VARCHAR(50)  NULL,               -- property, inquiry, appointment, payment, reservation
  reference_id  INT           NULL,
  is_read       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_read (user_id, is_read),
  INDEX idx_created (created_at DESC)
) ENGINE=InnoDB;

-- ============================================================
-- 4. VERIFICATION HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_history (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT           NOT NULL,
  verifier_id       INT           NULL,
  action            ENUM('submitted','verified','rejected','resubmitted','expired') NOT NULL,
  document_url      VARCHAR(255)  NULL,
  document_type     VARCHAR(50)   NULL,           -- national_id, passport, drivers_license, etc.
  notes             TEXT          NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vh_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_vh_verifier FOREIGN KEY (verifier_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_vh_user (user_id),
  INDEX idx_vh_created (created_at DESC)
) ENGINE=InnoDB;

-- ============================================================
-- 5. PROPERTY IMAGES TABLE (normalize JSON images)
-- ============================================================
CREATE TABLE IF NOT EXISTS property_images (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  property_id   INT           NOT NULL,
  url           VARCHAR(255)  NOT NULL,
  sort_order    INT           NOT NULL DEFAULT 0,
  is_primary    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pi_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  INDEX idx_pi_property (property_id)
) ENGINE=InnoDB;

-- ============================================================
-- 6. PROPERTY AMENITIES TABLE (normalize JSON amenities)
-- ============================================================
CREATE TABLE IF NOT EXISTS amenities (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS property_amenities (
  property_id INT NOT NULL,
  amenity_id  INT NOT NULL,
  PRIMARY KEY (property_id, amenity_id),
  CONSTRAINT fk_pa_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  CONSTRAINT fk_pa_amenity  FOREIGN KEY (amenity_id)  REFERENCES amenities(id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 7. DISPUTES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS disputes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  reporter_id     INT           NOT NULL,
  reported_id     INT           NULL,
  reference_type  VARCHAR(50)   NOT NULL,         -- property, payment, user
  reference_id    INT           NOT NULL,
  reason          VARCHAR(100)  NOT NULL,
  description     TEXT          NOT NULL,
  status          ENUM('open','investigating','resolved','dismissed') NOT NULL DEFAULT 'open',
  resolution      TEXT          NULL,
  resolved_by     INT           NULL,
  resolved_at     DATETIME      NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_dispute_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_dispute_resolved FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_dispute_status (status),
  INDEX idx_dispute_created (created_at DESC)
) ENGINE=InnoDB;

-- ============================================================
-- 8. PASSWORD RESET TOKENS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS password_resets (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT           NOT NULL,
  token_hash    VARCHAR(64)   NOT NULL,           -- SHA-256
  expires_at    DATETIME      NOT NULL,
  used_at       DATETIME      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pr_token (token_hash),
  INDEX idx_pr_expires (expires_at)
) ENGINE=InnoDB;

-- ============================================================
-- 9. EMAIL VERIFICATION TOKENS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS email_verifications (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT           NOT NULL,
  token_hash    VARCHAR(64)   NOT NULL,
  expires_at    DATETIME      NOT NULL,
  verified_at   DATETIME      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ev_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ev_token (token_hash)
) ENGINE=InnoDB;

-- ============================================================
-- 10. ALTER EXISTING TABLES (MySQL 8.4 compatible)
-- ============================================================

-- Helper procedure to safely add columns/indexes
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS safe_alter()
BEGIN
  -- Users: add soft delete, email verification, verification expiration
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='deleted_at') THEN
    ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='email_verified_at') THEN
    ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='verification_document_type') THEN
    ALTER TABLE users ADD COLUMN verification_document_type VARCHAR(50) NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='verification_expires_at') THEN
    ALTER TABLE users ADD COLUMN verification_expires_at DATETIME NULL DEFAULT NULL;
  END IF;

  -- Properties: add soft delete, proof_document, reservation_fee
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME='deleted_at') THEN
    ALTER TABLE properties ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME='proof_document') THEN
    ALTER TABLE properties ADD COLUMN proof_document VARCHAR(255) NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME='reservation_fee') THEN
    ALTER TABLE properties ADD COLUMN reservation_fee INT NULL DEFAULT NULL;
  END IF;

  -- Payments: add refund/dispute fields
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='reviewed_by') THEN
    ALTER TABLE payments ADD COLUMN reviewed_by INT NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='reviewed_at') THEN
    ALTER TABLE payments ADD COLUMN reviewed_at DATETIME NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='refund_amount') THEN
    ALTER TABLE payments ADD COLUMN refund_amount INT NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='refund_reason') THEN
    ALTER TABLE payments ADD COLUMN refund_reason TEXT NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='refund_approved_by') THEN
    ALTER TABLE payments ADD COLUMN refund_approved_by INT NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='dispute_id') THEN
    ALTER TABLE payments ADD COLUMN dispute_id INT NULL DEFAULT NULL;
  END IF;

  -- Inquiries: add soft delete
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='inquiries' AND COLUMN_NAME='deleted_at') THEN
    ALTER TABLE inquiries ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
  END IF;

  -- Appointments: add soft delete
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='deleted_at') THEN
    ALTER TABLE appointments ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
  END IF;

  -- Reservations: add soft delete
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservations' AND COLUMN_NAME='deleted_at') THEN
    ALTER TABLE reservations ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
  END IF;

  -- Audit logs: add archival support
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND COLUMN_NAME='archived_at') THEN
    ALTER TABLE audit_logs ADD COLUMN archived_at DATETIME NULL DEFAULT NULL;
  END IF;

  -- Add indexes safely
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND INDEX_NAME='idx_deleted') THEN
    ALTER TABLE users ADD INDEX idx_deleted (deleted_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND INDEX_NAME='idx_deleted') THEN
    ALTER TABLE properties ADD INDEX idx_deleted (deleted_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND INDEX_NAME='ft_search') THEN
    ALTER TABLE properties ADD FULLTEXT INDEX ft_search (title, description, address, city);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND INDEX_NAME='idx_archived') THEN
    ALTER TABLE audit_logs ADD INDEX idx_archived (archived_at);
  END IF;
END //
DELIMITER ;

CALL safe_alter();
DROP PROCEDURE IF EXISTS safe_alter;

-- ============================================================
-- 11. LOOKUP TABLES (replace ENUMs conceptually)
-- ============================================================
CREATE TABLE IF NOT EXISTS property_types (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  slug  VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO property_types (slug, label) VALUES
('house', 'House'), ('condo', 'Condominium'), ('townhome', 'Townhome'),
('apartment', 'Apartment'), ('lot', 'Lot');

CREATE TABLE IF NOT EXISTS payment_methods (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  slug  VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO payment_methods (slug, label) VALUES
('bank_transfer', 'Bank Transfer'), ('gcash', 'GCash'), ('pagibig', 'Pag-IBIG'),
('cash', 'Cash'), ('credit_card', 'Credit Card');

CREATE TABLE IF NOT EXISTS payment_types (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  slug  VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO payment_types (slug, label) VALUES
('reservation', 'Reservation'), ('down_payment', 'Down Payment'),
('full_payment', 'Full Payment'), ('monthly', 'Monthly');

-- ============================================================
-- 12. MIGRATE EXISTING SEED DATA - Images to property_images
-- ============================================================
INSERT IGNORE INTO property_images (property_id, url, sort_order, is_primary)
SELECT p.id, TRIM(BOTH '"' FROM j.image_url), @rownum := @rownum + 1, IF(@rownum = 1, 1, 0)
FROM properties p,
     JSON_TABLE(p.images, '$[*]' COLUMNS (image_url VARCHAR(255) PATH '$')) j,
     (SELECT @rownum := 0) r
WHERE p.images IS NOT NULL AND p.images != '[]';

-- ============================================================
-- 13. SEED ADMIN VERIFICATION
-- ============================================================
UPDATE users SET email_verified_at = NOW() WHERE user_type = 'administrator' AND email_verified_at IS NULL;
UPDATE users SET verification_expires_at = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE verification_status = 'verified' AND verification_expires_at IS NULL;
