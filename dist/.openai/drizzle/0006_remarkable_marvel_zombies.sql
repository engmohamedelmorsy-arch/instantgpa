CREATE TABLE `academic_records` (
	`owner_key` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`install_id` text,
	`payload` text NOT NULL,
	`course_count` integer DEFAULT 0 NOT NULL,
	`semester_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `academic_records_user_idx` ON `academic_records` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `academic_records_install_idx` ON `academic_records` (`install_id`,`updated_at`);