CREATE TABLE `pro_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`units` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pro_usage_user_created_idx` ON `pro_usage_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `pro_usage_action_created_idx` ON `pro_usage_events` (`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `pro_workspaces` (
	`user_id` text PRIMARY KEY NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pro_workspaces_updated_idx` ON `pro_workspaces` (`updated_at`);