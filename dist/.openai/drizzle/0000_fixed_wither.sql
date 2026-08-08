CREATE TABLE `admin_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_audit_created_idx` ON `admin_audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `entitlements` (
	`user_id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`monthly_page_limit` integer DEFAULT 90 NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`promotion_id` text,
	`note` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entitlements_status_idx` ON `entitlements` (`status`);--> statement-breakpoint
CREATE INDEX `entitlements_ends_at_idx` ON `entitlements` (`ends_at`);--> statement-breakpoint
CREATE TABLE `promotion_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`promotion_id` text NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`redeemed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_redemptions_promo_user_uq` ON `promotion_redemptions` (`promotion_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `promotion_redemptions_promo_idx` ON `promotion_redemptions` (`promotion_id`);--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`plan` text DEFAULT 'Student Plus' NOT NULL,
	`gift_days` integer DEFAULT 0 NOT NULL,
	`max_redemptions` integer DEFAULT 0 NOT NULL,
	`per_user_limit` integer DEFAULT 1 NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotions_code_uq` ON `promotions` (`code`);--> statement-breakpoint
CREATE INDEX `promotions_active_idx` ON `promotions` (`active`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`email_verified` integer DEFAULT false NOT NULL,
	`provider` text DEFAULT 'firebase' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_users_email_uq` ON `site_users` (`email`);--> statement-breakpoint
CREATE INDEX `site_users_last_seen_idx` ON `site_users` (`last_seen_at`);