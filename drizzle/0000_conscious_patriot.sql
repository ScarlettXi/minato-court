CREATE TABLE `availability_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`court_key` text NOT NULL,
	`court_name` text NOT NULL,
	`slot_date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`reservation_type` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`source_url` text NOT NULL,
	`price_text` text,
	`detected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slots_natural_key` ON `availability_slots` (`user_id`,`court_key`,`slot_date`,`start_time`,`end_time`);--> statement-breakpoint
CREATE TABLE `booking_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_message` text,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitor_runs` (
	`court_key` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`checked_at` text NOT NULL,
	`message` text
);
--> statement-breakpoint
CREATE TABLE `watch_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`outdoor_start` text DEFAULT '17:00' NOT NULL,
	`outdoor_end` text DEFAULT '21:00' NOT NULL,
	`ariake_all_day` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
