-- ============================================================
-- EstateFlow – Combined Migration
-- Applies ALL migrations in one go (safe to re-run).
-- Run AFTER schema.sql has been applied.
-- ============================================================

USE real_estate_db;

-- ============================================================
-- FROM: migration_v2.sql
-- ============================================================

-- 1. SESSIONS TABLE
CREATE TABLE IF NOT EXISTS sessions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT           NOT NULL,
  token_hash    VARCHAR(64)   NOT NULL,
  device_info   VARCHAR(255)  NULL,
  ip_address    VARCHAR(45)   NULL,
  expires_at    DATETIME      NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token_hash (token_hash),
  INDEX idx_user_id    (user_id),
  INDEX idx_expires    (expires_at)
) ENGINE=InnoDB;

-- 2. RATE LIMITING TABLE
CREATE TABLE IF NOT EXISTS rate_limits (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  identifier    VARCHAR(255)  NOT NULL,
  action        VARCHAR(50)   NOT NULL,
  attempts      INT           NOT NULL DEFAULT 1,
  window_start  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_identifier_action (identifier, action),
  INDEX idx_window (window_start)
) ENGINE=InnoDB;

-- 3. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT           NOT NULL,
  type          VARCHAR(50)   NOT NULL,
  title         VARCHAR(255)  NOT NULL,
  message       TEXT          NOT NULL,
  reference_type VARCHAR(50)  NULL,
  reference_id  INT           NULL,
  is_read       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_read (user_id, is_read),
  INDEX idx_created (created_at DESC)
) ENGINE=InnoDB;

-- 4. VERIFICATION HISTORY TABLE
CREATE TABLE IF NOT EXISTS verification_history (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT           NOT NULL,
  verifier_id       INT           NULL,
  action            ENUM('submitted','verified','rejected','resubmitted','expired') NOT NULL,
  document_url      VARCHAR(255)  NULL,
  document_type     VARCHAR(50)   NULL,
  notes             TEXT          NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vh_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_vh_verifier FOREIGN KEY (verifier_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_vh_user (user_id),
  INDEX idx_vh_created (created_at DESC)
) ENGINE=InnoDB;

-- 5. PROPERTY IMAGES TABLE
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

-- 6. AMENITIES TABLES
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

-- 7. DISPUTES TABLE
CREATE TABLE IF NOT EXISTS disputes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  reporter_id     INT           NOT NULL,
  reported_id     INT           NULL,
  reference_type  VARCHAR(50)   NOT NULL,
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

-- 8. PASSWORD RESET TOKENS TABLE
CREATE TABLE IF NOT EXISTS password_resets (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT           NOT NULL,
  token_hash    VARCHAR(64)   NOT NULL,
  expires_at    DATETIME      NOT NULL,
  used_at       DATETIME      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pr_token (token_hash),
  INDEX idx_pr_expires (expires_at)
) ENGINE=InnoDB;

-- 9. EMAIL VERIFICATION TOKENS TABLE
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
-- FROM: payments_table.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  property_id     INT             NOT NULL,
  buyer_id        INT             NOT NULL,
  seller_id       INT             NOT NULL,
  amount          BIGINT          NOT NULL,
  payment_method  ENUM('bank_transfer','gcash','pagibig','cash','credit_card') NOT NULL,
  payment_type    ENUM('reservation','down_payment','full_payment','monthly') NOT NULL DEFAULT 'reservation',
  reference_no    VARCHAR(100)    NULL,
  status          ENUM('pending','processing','completed','failed','refunded') NOT NULL DEFAULT 'pending',
  notes           TEXT            NULL,
  proof_url       VARCHAR(255)    NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_buyer    FOREIGN KEY (buyer_id)    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_seller   FOREIGN KEY (seller_id)   REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_payment_buyer    (buyer_id),
  INDEX idx_payment_seller   (seller_id),
  INDEX idx_payment_property (property_id),
  INDEX idx_payment_status   (status)
) ENGINE=InnoDB;

-- ============================================================
-- FROM: add_reservations_and_updates.php
-- ============================================================
CREATE TABLE IF NOT EXISTS reservations (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  property_id     INT             NOT NULL,
  user_id         INT             NOT NULL,
  status          ENUM('active','expired','cancelled','completed') NOT NULL DEFAULT 'active',
  expires_at      DATETIME        NOT NULL,
  notes           TEXT            NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservation_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  CONSTRAINT fk_reservation_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reservation_property (property_id),
  INDEX idx_reservation_user     (user_id),
  INDEX idx_reservation_status   (status),
  INDEX idx_reservation_expires  (expires_at)
) ENGINE=InnoDB;

-- ============================================================
-- FROM: inquiry_messages.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS inquiry_messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  inquiry_id  INT           NOT NULL,
  sender_id   INT           NOT NULL,
  message     TEXT          NOT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inqmsg_inquiry FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  CONSTRAINT fk_inqmsg_sender  FOREIGN KEY (sender_id)  REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_inquiry_messages (inquiry_id, created_at)
) ENGINE=InnoDB;

-- ============================================================
-- SAFE ALTER EXISTING TABLES (from migration_v2.sql + PHP migrations)
-- ============================================================
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS safe_alter()
BEGIN
  -- Users: soft delete, email verification, verification expiration, id_type
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
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='id_type') THEN
    ALTER TABLE users ADD COLUMN id_type VARCHAR(50) NULL DEFAULT NULL;
  END IF;

  -- Properties: soft delete, proof_document, reservation_fee, listing_notes, reviewed_by, interest_rate
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME='deleted_at') THEN
    ALTER TABLE properties ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME='proof_document') THEN
    ALTER TABLE properties ADD COLUMN proof_document VARCHAR(255) NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME='reservation_fee') THEN
    ALTER TABLE properties ADD COLUMN reservation_fee INT NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME='listing_notes') THEN
    ALTER TABLE properties ADD COLUMN listing_notes TEXT NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME='reviewed_by') THEN
    ALTER TABLE properties ADD COLUMN reviewed_by INT NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME='interest_rate') THEN
    ALTER TABLE properties ADD COLUMN interest_rate DECIMAL(5,2) NOT NULL DEFAULT 6.50;
  END IF;

  -- Payments: refund/dispute fields
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

  -- Appointments: appointment_type, soft delete
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='appointment_type') THEN
    ALTER TABLE appointments ADD COLUMN appointment_type ENUM('viewing','walk_in_payment') NOT NULL DEFAULT 'viewing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='deleted_at') THEN
    ALTER TABLE appointments ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
  END IF;

  -- Inquiries: soft delete
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='inquiries' AND COLUMN_NAME='deleted_at') THEN
    ALTER TABLE inquiries ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
  END IF;

  -- Reservations: soft delete
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservations' AND COLUMN_NAME='deleted_at') THEN
    ALTER TABLE reservations ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
  END IF;

  -- Audit logs: archival
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND COLUMN_NAME='archived_at') THEN
    ALTER TABLE audit_logs ADD COLUMN archived_at DATETIME NULL DEFAULT NULL;
  END IF;

  -- Indexes
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
-- LOOKUP TABLES
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
-- SEED DATA
-- ============================================================

-- Migrate existing property images from JSON to property_images table
INSERT IGNORE INTO property_images (property_id, url, sort_order, is_primary)
SELECT p.id, TRIM(BOTH '"' FROM j.image_url), @rownum := @rownum + 1, IF(@rownum = 1, 1, 0)
FROM properties p,
     JSON_TABLE(p.images, '$[*]' COLUMNS (image_url VARCHAR(255) PATH '$')) j,
     (SELECT @rownum := 0) r
WHERE p.images IS NOT NULL AND p.images != '[]';

-- Auto-verify admin users
UPDATE users SET email_verified_at = NOW() WHERE user_type = 'administrator' AND email_verified_at IS NULL;
UPDATE users SET verification_status = 'verified', verified_at = NOW() WHERE user_type = 'administrator' AND verification_status != 'verified';
UPDATE users SET verification_expires_at = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE verification_status = 'verified' AND verification_expires_at IS NULL;

-- Seed clerk user (Password: Test@1234)
INSERT IGNORE INTO users (first_name, last_name, email, phone, password_hash, user_type)
VALUES ('Front Desk', 'Clerk', 'clerk@estateflow.ph', '+63 917 000 0002',
        '$2y$10$6zE23JSs2yQv625E2EG5VuKORyO8Mae8zFHrCrHdKmg0egphw7xaq', 'clerk');
