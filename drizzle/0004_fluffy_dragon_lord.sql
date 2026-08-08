CREATE TABLE IF NOT EXISTS `academic_profile_contributions` (
	`contributor_id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`install_id` text,
	`university_profile_id` text NOT NULL,
	`country_code` text NOT NULL,
	`country_name` text NOT NULL,
	`university_name` text NOT NULL,
	`college_name` text NOT NULL,
	`department_name` text NOT NULL,
	`grading_system_id` text NOT NULL,
	`grading_system_label` text NOT NULL,
	`directory_university` integer DEFAULT false NOT NULL,
	`directory_college` integer DEFAULT false NOT NULL,
	`directory_department` integer DEFAULT false NOT NULL,
	`quality_status` text DEFAULT 'user_submitted' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `academic_profile_contributions_user_idx` ON `academic_profile_contributions` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `academic_profile_contributions_university_idx` ON `academic_profile_contributions` (`university_profile_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `country_prices` (
	`country` text PRIMARY KEY NOT NULL,
	`price_cents` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`plan` text DEFAULT 'Student Plus' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `university_academic_units` (
	`id` text PRIMARY KEY NOT NULL,
	`university_profile_id` text NOT NULL,
	`college_name` text NOT NULL,
	`college_slug` text NOT NULL,
	`department_name` text NOT NULL,
	`department_slug` text NOT NULL,
	`quality_status` text DEFAULT 'user_submitted' NOT NULL,
	`contributor_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_contributed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `university_academic_units_path_uq` ON `university_academic_units` (`university_profile_id`,`college_slug`,`department_slug`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `university_academic_units_university_idx` ON `university_academic_units` (`university_profile_id`,`contributor_count`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `university_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`country_code` text NOT NULL,
	`country_name` text NOT NULL,
	`university_name` text NOT NULL,
	`university_normalized` text NOT NULL,
	`university_slug` text NOT NULL,
	`source_status` text DEFAULT 'user_submitted' NOT NULL,
	`contributor_count` integer DEFAULT 0 NOT NULL,
	`college_count` integer DEFAULT 0 NOT NULL,
	`department_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_contributed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `university_profiles_country_name_uq` ON `university_profiles` (`country_code`,`university_normalized`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `university_profiles_country_idx` ON `university_profiles` (`country_code`,`contributor_count`);
