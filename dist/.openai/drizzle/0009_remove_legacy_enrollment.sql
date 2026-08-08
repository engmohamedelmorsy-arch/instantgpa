DROP TABLE IF EXISTS `premium_waitlist`;
--> statement-breakpoint
DROP TABLE IF EXISTS `promotion_redemptions`;
--> statement-breakpoint
DROP TABLE IF EXISTS `promotions`;
--> statement-breakpoint
DROP TABLE IF EXISTS `country_prices`;
--> statement-breakpoint
DELETE FROM `site_settings` WHERE `key` IN ('promotions', 'defaultGiftDays');
