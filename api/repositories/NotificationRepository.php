<?php

declare(strict_types=1);

final class NotificationRepository
{
    public function __construct(private mysqli $mysqli)
    {
    }

    public function countUnread(int $userId): int
    {
        $stmt = $this->mysqli->prepare('SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0');
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        return (int) ($stmt->get_result()->fetch_assoc()['cnt'] ?? 0);
    }

    public function countByUser(int $userId, bool $unreadOnly): int
    {
        $sql = 'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?';
        if ($unreadOnly) {
            $sql .= ' AND is_read = 0';
        }

        $stmt = $this->mysqli->prepare($sql);
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        return (int) ($stmt->get_result()->fetch_assoc()['total'] ?? 0);
    }

    public function listByUser(int $userId, bool $unreadOnly, int $limit, int $offset): array
    {
        $sql = 'SELECT * FROM notifications WHERE user_id = ?';
        if ($unreadOnly) {
            $sql .= ' AND is_read = 0';
        }
        $sql .= ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

        $stmt = $this->mysqli->prepare($sql);
        $stmt->bind_param('iii', $userId, $limit, $offset);
        $stmt->execute();

        $rows = [];
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $rows[] = $row;
        }
        return $rows;
    }

    public function findByIdForUser(int $id, int $userId): ?array
    {
        $stmt = $this->mysqli->prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->bind_param('ii', $id, $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        return $row ?: null;
    }

    public function markReadByIdForUser(int $id, int $userId): void
    {
        $stmt = $this->mysqli->prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?');
        $stmt->bind_param('ii', $id, $userId);
        $stmt->execute();
    }

    public function markAllReadForUser(int $userId): int
    {
        $stmt = $this->mysqli->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0');
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        return $this->mysqli->affected_rows;
    }

    public function deleteByIdForUser(int $id, int $userId): void
    {
        $stmt = $this->mysqli->prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?');
        $stmt->bind_param('ii', $id, $userId);
        $stmt->execute();
    }
}
