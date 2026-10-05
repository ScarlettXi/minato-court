export type NotificationReceipt = {
  kind: "test" | "availability";
  status: "pending" | "sending" | "retry" | "sent" | "failed" | "cancelled" | "unknown";
  createdAt: string;
  acceptedAt: string | null;
};
export type NotificationStatus = { recent: NotificationReceipt[] };

// Only status metadata belonging to the authenticated account's current email.
// A provider acceptance receipt does not prove inbox delivery.
export async function readNotificationStatus(db: D1Database, userId: string): Promise<NotificationStatus> {
  const notices = await db.prepare(`SELECT n.event_key,n.status,n.created_at,n.sent_at
    FROM email_notifications n JOIN app_users u ON u.id=n.user_id
    WHERE n.user_id=? AND n.recipient=u.email AND u.email_verified=1
    ORDER BY n.created_at DESC,n.rowid DESC LIMIT 5`).bind(userId).all<{
      event_key:string; status:string; created_at:string; sent_at:string | null;
    }>();
  return { recent: notices.results.map(row => ({
    kind:row.event_key.startsWith("test:") ? "test" : "availability",
    status:(["pending","sending","retry","sent","failed","cancelled"].includes(row.status) ? row.status : "unknown") as NotificationReceipt["status"],
    createdAt:row.created_at, acceptedAt:row.sent_at,
  })) };
}
