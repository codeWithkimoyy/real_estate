-- ============================================================
-- PAYMENTS TABLE
-- Run this migration to add the payments table.
-- ============================================================

USE real_estate_db;

DROP TABLE IF EXISTS payments;

CREATE TABLE payments (
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
