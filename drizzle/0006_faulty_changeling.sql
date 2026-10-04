CREATE TABLE `monitor_health` (
	`user_id` text PRIMARY KEY NOT NULL,
	`reported_at` text NOT NULL,
	`payload` text NOT NULL
);
