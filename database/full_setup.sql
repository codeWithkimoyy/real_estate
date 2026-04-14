-- ============================================================
-- EstateFlow – Complete Database Setup (schema + all migrations)
-- Single file to create the entire database from scratch.
-- Safe to import on a fresh MySQL server.
-- Total: 25 tables
-- ============================================================

CREATE DATABASE IF NOT EXISTS real_estate_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE real_estate_db;

-- ============================================================
-- DROP ALL TABLES (dependency order)
-- ============================================================
DROP TABLE IF EXISTS inquiry_messages;
DROP TABLE IF EXISTS property_amenities;
DROP TABLE IF EXISTS amenities;
DROP TABLE IF EXISTS property_images;
DROP TABLE IF EXISTS verification_history;
DROP TABLE IF EXISTS email_verifications;
DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS disputes;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS rate_limits;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS payment_types;
DROP TABLE IF EXISTS payment_methods;
DROP TABLE IF EXISTS property_types;
DROP TABLE IF EXISTS inquiries;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS properties;
DROP TABLE IF EXISTS neighborhoods;
DROP TABLE IF EXISTS testimonials;
DROP TABLE IF EXISTS market_insights;
DROP TABLE IF EXISTS users;

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  first_name    VARCHAR(120)  NOT NULL,
  last_name     VARCHAR(120)  NOT NULL,
  email         VARCHAR(190)  NOT NULL UNIQUE,
  phone         VARCHAR(40)   NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  user_type     ENUM('administrator','agent','seller','buyer','clerk') NOT NULL DEFAULT 'buyer',
  avatar        VARCHAR(1024) NULL,
  bio           TEXT          NULL,
  verification_status ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
  verification_document VARCHAR(255) NULL,
  verification_document_type VARCHAR(50) NULL,
  verification_notes TEXT NULL,
  verified_at   DATETIME      NULL,
  verified_by   INT           NULL,
  verification_expires_at DATETIME NULL,
  id_type       VARCHAR(50)   NULL,
  email_verified_at DATETIME  NULL,
  session_token VARCHAR(128)  NULL,
  token_expires_at DATETIME   NULL,
  deleted_at    DATETIME      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_type (user_type),
  INDEX idx_session   (session_token, token_expires_at),
  INDEX idx_deleted   (deleted_at)
) ENGINE=InnoDB;

-- ============================================================
-- 2. PROPERTIES
-- ============================================================
CREATE TABLE properties (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(255)  NOT NULL,
  address       VARCHAR(255)  NOT NULL,
  city          VARCHAR(120)  NOT NULL,
  province      VARCHAR(120)  NOT NULL,
  zip_code      VARCHAR(20)   NOT NULL DEFAULT '',
  price         BIGINT        NOT NULL,
  beds          INT           NOT NULL DEFAULT 0,
  baths         INT           NOT NULL DEFAULT 0,
  sqft          INT           NOT NULL DEFAULT 0,
  sqm           INT           NOT NULL DEFAULT 0,
  property_type ENUM('house','condo','townhome','apartment','lot') NOT NULL,
  status        ENUM('pending','approved','rejected','sold') NOT NULL DEFAULT 'pending',
  listing_notes TEXT          NULL,
  reviewed_by   INT           NULL,
  proof_document VARCHAR(255) NULL,
  reservation_fee INT         NULL,
  image         VARCHAR(255)  NOT NULL DEFAULT '',
  images        JSON          NOT NULL,
  description   TEXT          NOT NULL,
  amenities     JSON          NOT NULL,
  year_built    INT           NULL,
  lot_size      INT           NULL,
  garage        INT           NOT NULL DEFAULT 0,
  pool          TINYINT(1)    NOT NULL DEFAULT 0,
  furnished     TINYINT(1)    NOT NULL DEFAULT 0,
  owner_id      INT           NOT NULL,
  latitude      DECIMAL(10,7) NULL,
  longitude     DECIMAL(10,7) NULL,
  interest_rate DECIMAL(5,2)  NOT NULL DEFAULT 6.50,
  deleted_at    DATETIME      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_property_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_status       (status),
  INDEX idx_owner        (owner_id),
  INDEX idx_city         (city),
  INDEX idx_property_type(property_type),
  INDEX idx_price        (price),
  INDEX idx_deleted      (deleted_at),
  FULLTEXT INDEX ft_search (title, description, address, city)
) ENGINE=InnoDB;

-- ============================================================
-- 3. INQUIRIES
-- ============================================================
CREATE TABLE inquiries (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  property_id   INT           NOT NULL,
  sender_id     INT           NOT NULL,
  receiver_id   INT           NOT NULL,
  message       TEXT          NOT NULL,
  reply         TEXT          NULL,
  status        ENUM('unread','read','replied') NOT NULL DEFAULT 'unread',
  deleted_at    DATETIME      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inquiry_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  CONSTRAINT fk_inquiry_sender   FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_inquiry_receiver FOREIGN KEY (receiver_id)  REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_receiver (receiver_id, status),
  INDEX idx_sender   (sender_id)
) ENGINE=InnoDB;

-- ============================================================
-- 4. FAVORITES
-- ============================================================
CREATE TABLE favorites (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  property_id   INT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fav_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_property (user_id, property_id)
) ENGINE=InnoDB;

-- ============================================================
-- 5. APPOINTMENTS
-- ============================================================
CREATE TABLE appointments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  property_id   INT           NOT NULL,
  user_id       INT           NOT NULL,
  agent_id      INT           NULL,
  appointment_date DATE       NOT NULL,
  appointment_time VARCHAR(20) NOT NULL,
  notes         TEXT          NULL,
  appointment_type ENUM('viewing','walk_in_payment') NOT NULL DEFAULT 'viewing',
  status        ENUM('pending','confirmed','cancelled','completed') NOT NULL DEFAULT 'pending',
  deleted_at    DATETIME      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_appt_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  CONSTRAINT fk_appt_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_appt_agent    FOREIGN KEY (agent_id)    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 6. NEIGHBORHOODS
-- ============================================================
CREATE TABLE neighborhoods (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150)  NOT NULL,
  city          VARCHAR(120)  NOT NULL,
  province      VARCHAR(120)  NOT NULL,
  image         VARCHAR(255)  NOT NULL DEFAULT '',
  avg_price     INT           NOT NULL DEFAULT 0,
  price_change  DECIMAL(5,2)  NOT NULL DEFAULT 0,
  description   TEXT          NOT NULL,
  walk_score    INT           NOT NULL DEFAULT 0,
  transit_score INT           NOT NULL DEFAULT 0,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- 7. TESTIMONIALS
-- ============================================================
CREATE TABLE testimonials (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150)  NOT NULL,
  role          VARCHAR(100)  NOT NULL,
  image         VARCHAR(255)  NOT NULL DEFAULT '',
  content       TEXT          NOT NULL,
  rating        INT           NOT NULL DEFAULT 5,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- 8. MARKET INSIGHTS
-- ============================================================
CREATE TABLE market_insights (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  metric_name   VARCHAR(100)  NOT NULL UNIQUE,
  metric_value  VARCHAR(255)  NOT NULL,
  description   TEXT          NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- 9. AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT           NULL,
  action        VARCHAR(50)   NOT NULL,
  resource_type VARCHAR(50)   NOT NULL,
  resource_id   INT           NULL,
  details       TEXT          NULL,
  ip_address    VARCHAR(45)   NULL,
  archived_at   DATETIME      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_created (created_at DESC),
  INDEX idx_archived      (archived_at)
) ENGINE=InnoDB;

-- ============================================================
-- 10. SESSIONS
-- ============================================================
CREATE TABLE sessions (
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

-- ============================================================
-- 11. RATE LIMITS
-- ============================================================
CREATE TABLE rate_limits (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  identifier    VARCHAR(255)  NOT NULL,
  action        VARCHAR(50)   NOT NULL,
  attempts      INT           NOT NULL DEFAULT 1,
  window_start  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_identifier_action (identifier, action),
  INDEX idx_window (window_start)
) ENGINE=InnoDB;

-- ============================================================
-- 12. NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
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

-- ============================================================
-- 13. VERIFICATION HISTORY
-- ============================================================
CREATE TABLE verification_history (
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

-- ============================================================
-- 14. PROPERTY IMAGES
-- ============================================================
CREATE TABLE property_images (
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
-- 15. AMENITIES
-- ============================================================
CREATE TABLE amenities (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- ============================================================
-- 16. PROPERTY AMENITIES (junction)
-- ============================================================
CREATE TABLE property_amenities (
  property_id INT NOT NULL,
  amenity_id  INT NOT NULL,
  PRIMARY KEY (property_id, amenity_id),
  CONSTRAINT fk_pa_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  CONSTRAINT fk_pa_amenity  FOREIGN KEY (amenity_id)  REFERENCES amenities(id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 17. DISPUTES
-- ============================================================
CREATE TABLE disputes (
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

-- ============================================================
-- 18. PASSWORD RESETS
-- ============================================================
CREATE TABLE password_resets (
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

-- ============================================================
-- 19. EMAIL VERIFICATIONS
-- ============================================================
CREATE TABLE email_verifications (
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
-- 20. PAYMENTS
-- ============================================================
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
  reviewed_by     INT             NULL,
  reviewed_at     DATETIME        NULL,
  refund_amount   INT             NULL,
  refund_reason   TEXT            NULL,
  refund_approved_by INT          NULL,
  dispute_id      INT             NULL,
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
-- 21. RESERVATIONS
-- ============================================================
CREATE TABLE reservations (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  property_id     INT             NOT NULL,
  user_id         INT             NOT NULL,
  status          ENUM('pending','active','expired','cancelled','completed') NOT NULL DEFAULT 'pending',
  expires_at      DATETIME        NOT NULL,
  notes           TEXT            NULL,
  deleted_at      DATETIME        NULL,
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
-- 22. INQUIRY MESSAGES
-- ============================================================
CREATE TABLE inquiry_messages (
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
-- 23. PROPERTY TYPES (lookup)
-- ============================================================
CREATE TABLE property_types (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  slug  VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

INSERT INTO property_types (slug, label) VALUES
('house', 'House'), ('condo', 'Condominium'), ('townhome', 'Townhome'),
('apartment', 'Apartment'), ('lot', 'Lot');

-- ============================================================
-- 24. PAYMENT METHODS (lookup)
-- ============================================================
CREATE TABLE payment_methods (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  slug  VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

INSERT INTO payment_methods (slug, label) VALUES
('bank_transfer', 'Bank Transfer'), ('gcash', 'GCash'), ('pagibig', 'Pag-IBIG'),
('cash', 'Cash'), ('credit_card', 'Credit Card');

-- ============================================================
-- 25. PAYMENT TYPES (lookup)
-- ============================================================
CREATE TABLE payment_types (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  slug  VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

INSERT INTO payment_types (slug, label) VALUES
('reservation', 'Reservation'), ('down_payment', 'Down Payment'),
('full_payment', 'Full Payment'), ('monthly', 'Monthly');

-- ============================================================
-- SEED DATA
-- ============================================================

-- Admin (Password: Password123)
INSERT INTO users (first_name, last_name, email, phone, password_hash, user_type, verification_status, verified_at, email_verified_at, verification_expires_at) VALUES
('System', 'Admin', 'admin@estateflow.ph', '+63 917 000 0001',
 '$2y$10$DA0a.cLC7uPZaxOceY1peey7ahFxXct3axrw.uwwCDuw01KBWhFvS', 'administrator',
 'verified', NOW(), NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR));

-- Agents (Password: Test@1234)
INSERT INTO users (first_name, last_name, email, phone, password_hash, user_type, avatar, bio) VALUES
('Maria', 'Santos', 'maria.santos@estateflow.ph', '+63 917 123 4567',
 '$2y$10$6zE23JSs2yQv625E2EG5VuKORyO8Mae8zFHrCrHdKmg0egphw7xaq', 'agent',
 '/images/agent1.jpg', 'Top-performing luxury property specialist in Metro Manila with 10+ years of experience.'),
('Juan', 'Reyes', 'juan.reyes@estateflow.ph', '+63 918 234 5678',
 '$2y$10$6zE23JSs2yQv625E2EG5VuKORyO8Mae8zFHrCrHdKmg0egphw7xaq', 'agent',
 '/images/agent2.jpg', 'Specializing in OFW investments and Visayas properties with 8 years of experience.'),
('Roberto', 'Lim', 'roberto.lim@estateflow.ph', '+63 919 345 6789',
 '$2y$10$6zE23JSs2yQv625E2EG5VuKORyO8Mae8zFHrCrHdKmg0egphw7xaq', 'agent',
 '/images/agent3.jpg', 'Family home expert and QC area specialist with 12 years in the industry.'),
('Anna', 'Cruz', 'anna.cruz@estateflow.ph', '+63 920 456 7890',
 '$2y$10$6zE23JSs2yQv625E2EG5VuKORyO8Mae8zFHrCrHdKmg0egphw7xaq', 'agent',
 '/images/agent4.jpg', 'Commercial real estate and condo investment advisor for Cebu and Davao markets.');

-- Seller (Password: Test@1234)
INSERT INTO users (first_name, last_name, email, phone, password_hash, user_type) VALUES
('Carlos', 'Garcia', 'seller@estateflow.ph', '+63 921 567 8901',
 '$2y$10$6zE23JSs2yQv625E2EG5VuKORyO8Mae8zFHrCrHdKmg0egphw7xaq', 'seller');

-- Buyer (Password: Test@1234)
INSERT INTO users (first_name, last_name, email, phone, password_hash, user_type) VALUES
('Elena', 'Rodriguez', 'buyer@estateflow.ph', '+63 922 678 9012',
 '$2y$10$6zE23JSs2yQv625E2EG5VuKORyO8Mae8zFHrCrHdKmg0egphw7xaq', 'buyer');

-- Clerk (Password: Test@1234)
INSERT INTO users (first_name, last_name, email, phone, password_hash, user_type) VALUES
('Front Desk', 'Clerk', 'clerk@estateflow.ph', '+63 917 000 0002',
 '$2y$10$6zE23JSs2yQv625E2EG5VuKORyO8Mae8zFHrCrHdKmg0egphw7xaq', 'clerk');

-- Properties (user IDs: admin=1, agents=2-5, seller=6, buyer=7, clerk=8)
INSERT INTO properties (title, address, city, province, zip_code, price, beds, baths, sqft, sqm,
  property_type, status, image, images, description, amenities, year_built, lot_size,
  garage, pool, furnished, owner_id, latitude, longitude) VALUES
('Luxury Condo in Makati CBD', '1226 Ayala Avenue', 'Makati', 'Metro Manila', '1226',
 25000000, 3, 2, 1292, 120, 'condo', 'approved',
 '/images/property1.jpg', '[\"/images/property1.jpg\",\"/images/modern_interior.jpg\"]',
 'Premium 3-bedroom condominium in the heart of Makati CBD with stunning city views and full resort-style amenities.',
 '[\"Swimming Pool\",\"Gym\",\"Concierge\",\"Function Room\",\"24/7 Security\",\"Parking\"]',
 2020, NULL, 1, 1, 1, 2, 14.5547000, 121.0244000),

('Modern Townhouse in BGC', '32nd Street, Bonifacio Global City', 'Taguig', 'Metro Manila', '1634',
 45000000, 4, 3, 2691, 250, 'townhome', 'approved',
 '/images/property2.jpg', '[\"/images/property2.jpg\",\"/images/pool_house.jpg\"]',
 'Stunning 4-bedroom townhouse in prestigious BGC with rooftop terrace and smart home features.',
 '[\"Private Garden\",\"Rooftop Terrace\",\"Smart Home\",\"Storage Room\",\"2-Car Garage\"]',
 2021, NULL, 2, 0, 0, 3, 14.5408000, 121.0503000),

('Penthouse with Manila Bay View', 'Roxas Boulevard, Malate', 'Manila', 'Metro Manila', '1004',
 65000000, 5, 4, 3767, 350, 'condo', 'approved',
 '/images/property3.jpg', '[\"/images/property3.jpg\",\"/images/modern_interior.jpg\"]',
 'Magnificent penthouse offering breathtaking Manila Bay sunset views with private elevator and luxury lifestyle.',
 '[\"Infinity Pool\",\"Private Elevator\",\"Wine Cellar\",\"Home Theater\",\"Spa\",\"Concierge\"]',
 2019, NULL, 3, 1, 1, 4, 14.5995000, 120.9842000),

('Family Home in Quezon City', '45 Commonwealth Avenue', 'Quezon City', 'Metro Manila', '1121',
 12000000, 4, 3, 2153, 200, 'house', 'approved',
 '/images/property4.jpg', '[\"/images/property4.jpg\",\"/images/modern_interior.jpg\"]',
 'Spacious 4-bedroom family home in a peaceful QC subdivision close to schools and hospitals.',
 '[\"Large Garden\",\"Covered Carport\",\"Storage Room\",\"Security\",\"Flood-free Area\"]',
 2015, 300, 2, 0, 0, 5, 14.6760000, 121.0437000),

('Beachfront Villa in Cebu', 'Punta Engaño Road, Mactan', 'Cebu City', 'Cebu', '6015',
 85000000, 6, 5, 5382, 500, 'house', 'approved',
 '/images/property5.jpg', '[\"/images/property5.jpg\",\"/images/pool_house.jpg\"]',
 'Spectacular beachfront villa on Mactan Island with private beach access and guest house.',
 '[\"Private Beach\",\"Infinity Pool\",\"Guest House\",\"Outdoor Kitchen\",\"Garden\",\"Boat Dock\"]',
 2020, 1000, 3, 1, 1, 2, 10.3157000, 123.8854000),

('Studio Unit in Ortigas CBD', 'Ortigas Avenue, Pasig', 'Pasig', 'Metro Manila', '1605',
 4500000, 1, 1, 323, 30, 'condo', 'approved',
 '/images/property6.jpg', '[\"/images/property6.jpg\",\"/images/modern_interior.jpg\"]',
 'Modern studio unit in Ortigas CBD ideal for young professionals and savvy investors.',
 '[\"Swimming Pool\",\"Gym\",\"Lounge\",\"Co-working Space\",\"24/7 Security\"]',
 2022, NULL, 0, 1, 1, 3, 14.5869000, 121.0614000),

('Seller Pending Listing', '78 Rizal Street', 'Makati', 'Metro Manila', '1226',
 18000000, 2, 1, 860, 80, 'condo', 'pending',
 '/images/property1.jpg', '[\"/images/property1.jpg\"]',
 'A 2-bedroom condo in Makati waiting for admin approval.',
 '[\"Gym\",\"Pool\",\"Security\"]', 2023, NULL, 1, 0, 1, 6, 14.5500000, 121.0200000);

-- Neighborhoods
INSERT INTO neighborhoods (name, city, province, image, avg_price, price_change, description, walk_score, transit_score) VALUES
('Makati CBD', 'Makati', 'Metro Manila', '/images/city_palms.jpg', 180000, 8.50,
 'The premier central business district of the Philippines with world-class condominiums and offices.', 92, 88),
('Bonifacio Global City', 'Taguig', 'Metro Manila', '/images/beachfront_aerial.jpg', 220000, 12.30,
 'Modern master-planned community featuring luxury residences, international schools, and vibrant nightlife.', 88, 82),
('Ortigas Center', 'Pasig', 'Metro Manila', '/images/coast_wide.jpg', 140000, 6.80,
 'Major business hub with excellent connectivity, shopping malls, and residential towers.', 85, 80),
('Quezon City Central', 'Quezon City', 'Metro Manila', '/images/forest_path.jpg', 95000, 4.20,
 'Vibrant urban center with top universities, hospitals, and diverse dining options.', 78, 75),
('Alabang', 'Muntinlupa', 'Metro Manila', '/images/modern_interior.jpg', 120000, 9.10,
 'Upscale residential area known for excellent schools and gated village communities.', 65, 70),
('Cebu Business Park', 'Cebu City', 'Cebu', '/images/pool_house.jpg', 85000, 11.70,
 'Cebu''s premier business district with modern towers and a thriving lifestyle scene.', 82, 78),
('Davao Central', 'Davao City', 'Davao del Sur', '/images/city_palms.jpg', 75000, 7.30,
 'Growing metropolitan center known for safety, modern developments, and quality of life.', 75, 72),
('Clark Freeport', 'Clark', 'Pampanga', '/images/beachfront_aerial.jpg', 65000, 5.90,
 'Strategic economic zone with international airport access and rapid urban growth.', 68, 85);

-- Testimonials
INSERT INTO testimonials (name, role, image, content, rating) VALUES
('The Garcia Family', 'Home Buyers', '/images/agent1.jpg',
 'Maria helped us find our dream condo in Makati. She understood exactly what we needed and negotiated a great price. Highly recommended!', 5),
('David Tan', 'OFW Investor', '/images/agent2.jpg',
 'As an OFW, buying property in the Philippines seemed daunting. Juan made the entire process smooth, even handling everything while I was abroad.', 5),
('Catherine Lim', 'Property Seller', '/images/agent3.jpg',
 'Roberto sold our family home in Quezon City in just 2 weeks for above asking price. His marketing strategy was exceptional.', 5);

-- Market Insights
INSERT INTO market_insights (metric_name, metric_value, description) VALUES
('avgDaysOnMarket', '28', 'Average days properties stay on market'),
('priceTrend', '9.2', 'Year-over-year price trend percentage'),
('newListingsThisWeek', '156', 'New property listings this week'),
('totalActiveListings', '4850', 'Total active property listings'),
('avgPricePerSqm', '125000', 'Average price per square meter in PHP');

-- Sample inquiry (buyer=7 asks agent=2 about property 1)
INSERT INTO inquiries (property_id, sender_id, receiver_id, message, status) VALUES
(1, 7, 2, 'Hi, I am interested in the Makati CBD condo. Is it still available? Can I schedule a viewing this weekend?', 'unread');

-- Sample appointment
INSERT INTO appointments (property_id, user_id, agent_id, appointment_date, appointment_time, notes, status) VALUES
(1, 7, 2, '2026-04-05', '2:00 PM', 'First-time viewing', 'pending');

-- Sample favorites
INSERT INTO favorites (user_id, property_id) VALUES (7, 1), (7, 3);

-- Sample audit log
INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address) VALUES
(1, 'CREATE', 'user', 2, 'Admin created agent account maria.santos@estateflow.ph', '127.0.0.1');

-- Migrate property images from JSON to property_images table
INSERT IGNORE INTO property_images (property_id, url, sort_order, is_primary)
SELECT p.id, TRIM(BOTH '"' FROM j.image_url), @rownum := @rownum + 1, IF(@rownum = 1, 1, 0)
FROM properties p,
     JSON_TABLE(p.images, '$[*]' COLUMNS (image_url VARCHAR(255) PATH '$')) j,
     (SELECT @rownum := 0) r
WHERE p.images IS NOT NULL AND p.images != '[]';
