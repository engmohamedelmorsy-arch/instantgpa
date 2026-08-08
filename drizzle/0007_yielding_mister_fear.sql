CREATE TABLE `premium_waitlist` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`country_code` text,
	`language` text DEFAULT 'en' NOT NULL,
	`source` text DEFAULT 'pricing' NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `premium_waitlist_email_uq` ON `premium_waitlist` (`email`);--> statement-breakpoint
CREATE INDEX `premium_waitlist_created_idx` ON `premium_waitlist` (`created_at`);