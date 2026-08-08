CREATE TABLE IF NOT EXISTS `academic_catalog_sources` (
  `id` text PRIMARY KEY NOT NULL,
  `institution_key` text NOT NULL,
  `institution` text NOT NULL,
  `country_code` text NOT NULL DEFAULT '',
  `college` text NOT NULL DEFAULT '',
  `department` text NOT NULL DEFAULT '',
  `program` text NOT NULL DEFAULT '',
  `catalog_year` text NOT NULL,
  `source_url` text NOT NULL,
  `source_title` text NOT NULL,
  `source_type` text NOT NULL DEFAULT 'catalog',
  `content_hash` text NOT NULL,
  `page_count` integer NOT NULL DEFAULT 1,
  `fact_count` integer NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'pending_review',
  `import_notes` text NOT NULL DEFAULT '',
  `imported_by` text NOT NULL,
  `reviewed_by` text,
  `reviewed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_catalog_sources_lookup` ON `academic_catalog_sources` (`institution_key`, `catalog_year`, `status`);

CREATE TABLE IF NOT EXISTS `academic_catalog_facts` (
  `id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL,
  `kind` text NOT NULL,
  `code` text NOT NULL DEFAULT '',
  `title` text NOT NULL DEFAULT '',
  `credits` real,
  `minimum_grade` text NOT NULL DEFAULT '',
  `prerequisite_codes` text NOT NULL DEFAULT '[]',
  `corequisite_codes` text NOT NULL DEFAULT '[]',
  `group_name` text NOT NULL DEFAULT '',
  `rule_type` text NOT NULL DEFAULT '',
  `summary` text NOT NULL DEFAULT '',
  `source_page` integer NOT NULL DEFAULT 1,
  `confidence` real NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'pending_review',
  `created_at` text NOT NULL,
  FOREIGN KEY (`source_id`) REFERENCES `academic_catalog_sources`(`id`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS `idx_catalog_facts_source` ON `academic_catalog_facts` (`source_id`, `status`, `kind`);
