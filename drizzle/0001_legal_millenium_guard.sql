CREATE TABLE `academic_report_share_attempts` (
	`share_token_hash` text NOT NULL,
	`client_key` text NOT NULL,
	`window_started_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_report_share_attempts_pk` ON `academic_report_share_attempts` (`share_token_hash`,`client_key`);--> statement-breakpoint
CREATE INDEX `academic_report_share_attempts_window_idx` ON `academic_report_share_attempts` (`window_started_at`);--> statement-breakpoint
CREATE TABLE `academic_report_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`scope` text NOT NULL,
	`payload` text NOT NULL,
	`password_hash` text,
	`password_salt` text,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`last_accessed_at` text,
	`view_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_report_shares_token_uq` ON `academic_report_shares` (`token_hash`);--> statement-breakpoint
CREATE INDEX `academic_report_shares_user_idx` ON `academic_report_shares` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `academic_report_shares_expiry_idx` ON `academic_report_shares` (`expires_at`,`revoked_at`);