ALTER TABLE properties
MODIFY COLUMN status ENUM('draft','pending_approval','available','reserved','under_offer','sold','pending','approved','rejected') NOT NULL DEFAULT 'draft';

UPDATE properties SET status = 'pending_approval' WHERE status = 'pending';
UPDATE properties SET status = 'available' WHERE status = 'approved';
UPDATE properties SET status = 'draft' WHERE status = 'rejected';

ALTER TABLE properties
MODIFY COLUMN status ENUM('draft','pending_approval','available','reserved','under_offer','sold') NOT NULL DEFAULT 'draft';

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS payment_intent ENUM('walk_in','online') NULL AFTER notes;

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS calculator_snapshot JSON NULL AFTER payment_intent;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS reservation_id INT NULL AFTER property_id;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS payment_channel ENUM('walk_in','online') NOT NULL DEFAULT 'online' AFTER amount;

ALTER TABLE payments
MODIFY COLUMN status ENUM('pending','paid','failed','refunded','processing','completed') NOT NULL DEFAULT 'pending';

UPDATE payments SET status = 'paid' WHERE status = 'completed';
UPDATE payments SET status = 'pending' WHERE status = 'processing';

ALTER TABLE payments
MODIFY COLUMN status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending';

ALTER TABLE payments
ADD INDEX idx_payment_reservation (reservation_id);

ALTER TABLE payments
ADD CONSTRAINT fk_payment_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NOT NULL,
  reservation_id INT NOT NULL,
  buyer_id INT NOT NULL,
  seller_id INT NOT NULL,
  amount BIGINT NOT NULL,
  message TEXT NULL,
  status ENUM('pending','accepted','rejected','countered','cancelled') NOT NULL DEFAULT 'pending',
  counter_amount BIGINT NULL,
  counter_message TEXT NULL,
  responded_by INT NULL,
  responded_at DATETIME NULL,
  deleted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_offer_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_responder FOREIGN KEY (responded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_offer_property (property_id),
  INDEX idx_offer_reservation (reservation_id),
  INDEX idx_offer_status (status)
);
