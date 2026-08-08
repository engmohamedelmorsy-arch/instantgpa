CREATE TABLE IF NOT EXISTS `paypal_checkout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subscription_id` text NOT NULL UNIQUE,
	`approval_url` text NOT NULL,
	`status` text DEFAULT 'approval_pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `paypal_checkout_user_idx` ON `paypal_checkout_sessions` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `paypal_checkout_subscription_uq` ON `paypal_checkout_sessions` (`subscription_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `paypal_subscriptions` (
	`subscription_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text NOT NULL,
	`payer_id` text,
	`payer_email` text,
	`started_at` text,
	`next_billing_at` text,
	`cancelled_at` text,
	`raw_updated_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `paypal_subscriptions_user_idx` ON `paypal_subscriptions` (`user_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `paypal_webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`subscription_id` text,
	`status` text NOT NULL,
	`received_at` text NOT NULL,
	`processed_at` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `paypal_webhook_received_idx` ON `paypal_webhook_events` (`received_at`);
