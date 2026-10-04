ALTER TABLE `booking_requests` ADD `confirmation_number` text;--> statement-breakpoint
ALTER TABLE `booking_requests` ADD `official_status` text;--> statement-breakpoint
ALTER TABLE `booking_requests` ADD `booked_at` text;--> statement-breakpoint
ALTER TABLE `booking_requests` ADD `official_checked_at` text;--> statement-breakpoint
ALTER TABLE `booking_requests` ADD `official_verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `booking_requests` ADD `official_source_url` text;--> statement-breakpoint
ALTER TABLE `booking_requests` ADD `booking_details` text;--> statement-breakpoint
ALTER TABLE `booking_requests` ADD `verification_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `booking_requests` ADD `verification_message` text;