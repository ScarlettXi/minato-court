CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`email` text,
	`phone` text,
	`email_verified` integer DEFAULT 0 NOT NULL,
	`notification_channel` text DEFAULT 'email' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_provider_identity` ON `app_users` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_key` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`provider_id` text,
	`last_error` text,
	`available_at` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_email_user_event` ON `email_notifications` (`user_id`,`event_key`);--> statement-breakpoint
CREATE INDEX `idx_email_due` ON `email_notifications` (`user_id`,`status`,`available_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_monitor_runs` (
	`user_id` text DEFAULT 'owner' NOT NULL,
	`court_key` text NOT NULL,
	`status` text NOT NULL,
	`checked_at` text NOT NULL,
	`message` text,
	PRIMARY KEY(`user_id`, `court_key`)
);
--> statement-breakpoint
INSERT INTO `__new_monitor_runs`("court_key", "status", "checked_at", "message") SELECT "court_key", "status", "checked_at", "message" FROM `monitor_runs`;--> statement-breakpoint
DROP TABLE `monitor_runs`;--> statement-breakpoint
ALTER TABLE `__new_monitor_runs` RENAME TO `monitor_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
