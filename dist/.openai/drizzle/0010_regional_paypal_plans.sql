ALTER TABLE `paypal_checkout_sessions` ADD `plan_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `paypal_checkout_plan_idx` ON `paypal_checkout_sessions` (`user_id`,`plan_id`,`created_at`);
