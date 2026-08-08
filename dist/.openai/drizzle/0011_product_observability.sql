CREATE TABLE IF NOT EXISTS `product_events` (
  `id` text PRIMARY KEY NOT NULL,
  `event_name` text NOT NULL,
  `install_hash` text,
  `session_hash` text NOT NULL,
  `path` text NOT NULL,
  `tool` text,
  `language` text NOT NULL,
  `country` text,
  `metadata` text NOT NULL DEFAULT '{}',
  `created_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `product_events_name_created_idx` ON `product_events` (`event_name`,`created_at`);
CREATE INDEX IF NOT EXISTS `product_events_session_created_idx` ON `product_events` (`session_hash`,`created_at`);
CREATE TABLE IF NOT EXISTS `product_error_events` (
  `id` text PRIMARY KEY NOT NULL,
  `fingerprint` text NOT NULL,
  `path` text NOT NULL,
  `category` text NOT NULL,
  `message` text NOT NULL,
  `source` text,
  `line` integer,
  `column_number` integer,
  `metadata` text NOT NULL DEFAULT '{}',
  `created_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `product_errors_fingerprint_created_idx` ON `product_error_events` (`fingerprint`,`created_at`);
CREATE TABLE IF NOT EXISTS `result_feedback` (
  `id` text PRIMARY KEY NOT NULL,
  `session_hash` text NOT NULL,
  `path` text NOT NULL,
  `tool` text,
  `answer` text NOT NULL,
  `note` text,
  `created_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `result_feedback_created_idx` ON `result_feedback` (`created_at`);
CREATE TABLE IF NOT EXISTS `observability_rate_limits` (
  `rate_key` text PRIMARY KEY NOT NULL,
  `window_started_at` text NOT NULL,
  `request_count` integer NOT NULL DEFAULT 0
);
