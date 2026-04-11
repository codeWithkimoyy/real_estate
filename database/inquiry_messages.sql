-- Inquiry messages table for multi-message conversations
-- Run this after schema.sql

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
