CREATE TABLE `institution_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes` text DEFAULT 'bulk:analyze' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `institution_api_keys_token_uq` ON `institution_api_keys` (`token_hash`);--> statement-breakpoint
CREATE INDEX `institution_api_keys_user_idx` ON `institution_api_keys` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `institution_batch_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`api_key_id` text,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`record_count` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `institution_batch_jobs_user_idx` ON `institution_batch_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `institution_batch_jobs_key_idx` ON `institution_batch_jobs` (`api_key_id`,`created_at`);