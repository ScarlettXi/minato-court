import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const watchSettings = sqliteTable("watch_settings", {
  userId: text("user_id").primaryKey(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  outdoorStart: text("outdoor_start").notNull().default("17:00"),
  outdoorEnd: text("outdoor_end").notNull().default("21:00"),
  ariakeAllDay: integer("ariake_all_day", { mode: "boolean" }).notNull().default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  // Preserve the database default; ensureDefaultSettings always supplies current selections.
  selectedCourtKeys: text("selected_court_keys").notNull().default('["shiba","hibiya","azabu","ariake_indoor"]'),
  courtTimeRanges: text("court_time_ranges").notNull().default('{}'),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const availabilitySlots = sqliteTable("availability_slots", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  courtKey: text("court_key").notNull(),
  courtName: text("court_name").notNull(),
  slotDate: text("slot_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  reservationType: text("reservation_type").notNull(),
  status: text("status").notNull().default("available"),
  sourceUrl: text("source_url").notNull(),
  priceText: text("price_text"),
  detectedAt: text("detected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_slots_natural_key").on(table.userId, table.courtKey, table.slotDate, table.startTime, table.endTime),
  index("idx_slots_status_date").on(table.userId, table.status, table.slotDate),
]);

export const bookingRequests = sqliteTable("booking_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  slotId: text("slot_id").notNull(),
  status: text("status").notNull().default("pending"),
  statusMessage: text("status_message"),
  confirmationNumber: text("confirmation_number"),
  officialStatus: text("official_status"),
  bookedAt: text("booked_at"),
  officialCheckedAt: text("official_checked_at"),
  officialVerified: integer("official_verified", { mode: "boolean" }).notNull().default(false),
  officialSourceUrl: text("official_source_url"),
  bookingDetails: text("booking_details"),
  verificationStatus: text("verification_status").notNull().default("pending"),
  verificationMessage: text("verification_message"),
  requestedAt: text("requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_booking_requests_status").on(table.userId, table.status, table.requestedAt),
]);

export const monitorRuns = sqliteTable("monitor_runs", {
  userId: text("user_id").notNull().default("owner"),
  courtKey: text("court_key").notNull(),
  status: text("status").notNull(),
  checkedAt: text("checked_at").notNull(),
  message: text("message"),
}, table => [primaryKey({ columns:[table.userId, table.courtKey] })]);

// One bounded, tenant-scoped health snapshot; never contains credentials or bookings.
export const monitorHealth = sqliteTable("monitor_health", {
  userId: text("user_id").primaryKey(),
  reportedAt: text("reported_at").notNull(),
  payload: text("payload").notNull(),
});

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  providerUserId: text("provider_user_id").notNull(),
  email: text("email"),
  phone: text("phone"),
  emailVerified: integer("email_verified").notNull().default(0),
  notificationChannel: text("notification_channel").notNull().default("email"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("idx_users_provider_identity").on(table.provider, table.providerUserId)]);

export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  attempts: integer("attempts").notNull(),
});

export const siteInvitations = sqliteTable("site_invitations", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: integer("expires_at").notNull(),
  usedBy: text("used_by"),
  usedAt: text("used_at"),
  revokedAt: text("revoked_at"),
}, table => [
  uniqueIndex("idx_invitation_hash").on(table.tokenHash),
  index("idx_invitation_member").on(table.usedBy, table.revokedAt),
]);

export const emailNotifications = sqliteTable("email_notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  eventKey: text("event_key").notNull(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  providerId: text("provider_id"),
  lastError: text("last_error"),
  availableAt: integer("available_at").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  sentAt: text("sent_at"),
}, table => [
  uniqueIndex("idx_email_user_event").on(table.userId, table.eventKey),
  index("idx_email_due").on(table.userId, table.status, table.availableAt),
]);
