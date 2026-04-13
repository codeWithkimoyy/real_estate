<?php

declare(strict_types=1);

require_once __DIR__ . '/../repositories/NotificationRepository.php';

final class NotificationService
{
    public function __construct(private NotificationRepository $repository)
    {
    }

    public function listForUser(int $userId, bool $unreadOnly, array $pagination): array
    {
        $total = $this->repository->countByUser($userId, $unreadOnly);
        $unreadCount = $this->repository->countUnread($userId);
        $rows = $this->repository->listByUser($userId, $unreadOnly, (int) $pagination['limit'], (int) $pagination['offset']);

        $mapped = array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'type' => (string) $row['type'],
                'title' => (string) $row['title'],
                'message' => (string) $row['message'],
                'resourceType' => $row['resource_type'],
                'resourceId' => $row['resource_id'] ? (int) $row['resource_id'] : null,
                'readAt' => $row['is_read'] ? (string) $row['created_at'] : null,
                'createdAt' => (string) $row['created_at'],
            ];
        }, $rows);

        $response = paginated_response($mapped, $total, (int) $pagination['page'], (int) $pagination['limit']);
        $response['unreadCount'] = $unreadCount;
        return $response;
    }

    public function markAllRead(int $userId): int
    {
        return $this->repository->markAllReadForUser($userId);
    }

    public function assertExistsForUser(int $id, int $userId): void
    {
        if (!$this->repository->findByIdForUser($id, $userId)) {
            send_json(404, ['ok' => false, 'error' => 'Notification not found']);
        }
    }

    public function markRead(int $id, int $userId): void
    {
        $this->repository->markReadByIdForUser($id, $userId);
    }

    public function delete(int $id, int $userId): void
    {
        $this->repository->deleteByIdForUser($id, $userId);
    }
}
