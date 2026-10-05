CREATE TABLE `site_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` integer NOT NULL,
	`used_by` text,
	`used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitation_hash` ON `site_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_invitation_member` ON `site_invitations` (`used_by`,`revoked_at`);