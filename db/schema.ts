import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const siteUsers = sqliteTable("site_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  provider: text("provider").notNull().default("firebase"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [
  uniqueIndex("site_users_email_uq").on(table.email),
  index("site_users_last_seen_idx").on(table.lastSeenAt),
]);

export const universityProfiles = sqliteTable("university_profiles", {
  id: text("id").primaryKey(),
  countryCode: text("country_code").notNull(),
  countryName: text("country_name").notNull(),
  universityName: text("university_name").notNull(),
  universityNormalized: text("university_normalized").notNull(),
  universitySlug: text("university_slug").notNull(),
  sourceStatus: text("source_status").notNull().default("user_submitted"),
  contributorCount: integer("contributor_count").notNull().default(0),
  collegeCount: integer("college_count").notNull().default(0),
  departmentCount: integer("department_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastContributedAt: text("last_contributed_at").notNull(),
}, (table) => [
  uniqueIndex("university_profiles_country_name_uq").on(table.countryCode, table.universityNormalized),
  index("university_profiles_country_idx").on(table.countryCode, table.contributorCount),
]);

export const academicProfileContributions = sqliteTable("academic_profile_contributions", {
  contributorId: text("contributor_id").primaryKey(),
  userId: text("user_id"),
  installId: text("install_id"),
  universityProfileId: text("university_profile_id").notNull(),
  countryCode: text("country_code").notNull(),
  countryName: text("country_name").notNull(),
  universityName: text("university_name").notNull(),
  collegeName: text("college_name").notNull(),
  departmentName: text("department_name").notNull(),
  gradingSystemId: text("grading_system_id").notNull(),
  gradingSystemLabel: text("grading_system_label").notNull(),
  directoryUniversity: integer("directory_university", { mode: "boolean" }).notNull().default(false),
  directoryCollege: integer("directory_college", { mode: "boolean" }).notNull().default(false),
  directoryDepartment: integer("directory_department", { mode: "boolean" }).notNull().default(false),
  qualityStatus: text("quality_status").notNull().default("user_submitted"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("academic_profile_contributions_user_idx").on(table.userId),
  index("academic_profile_contributions_university_idx").on(table.universityProfileId, table.updatedAt),
]);

export const academicRecords = sqliteTable("academic_records", {
  ownerKey: text("owner_key").primaryKey(),
  userId: text("user_id"),
  installId: text("install_id"),
  payload: text("payload").notNull(),
  courseCount: integer("course_count").notNull().default(0),
  semesterCount: integer("semester_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("academic_records_user_idx").on(table.userId, table.updatedAt),
  index("academic_records_install_idx").on(table.installId, table.updatedAt),
]);

export const universityAcademicUnits = sqliteTable("university_academic_units", {
  id: text("id").primaryKey(),
  universityProfileId: text("university_profile_id").notNull(),
  collegeName: text("college_name").notNull(),
  collegeSlug: text("college_slug").notNull(),
  departmentName: text("department_name").notNull(),
  departmentSlug: text("department_slug").notNull(),
  qualityStatus: text("quality_status").notNull().default("user_submitted"),
  contributorCount: integer("contributor_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastContributedAt: text("last_contributed_at").notNull(),
}, (table) => [
  uniqueIndex("university_academic_units_path_uq").on(table.universityProfileId, table.collegeSlug, table.departmentSlug),
  index("university_academic_units_university_idx").on(table.universityProfileId, table.contributorCount),
]);

export const entitlements = sqliteTable("entitlements", {
  userId: text("user_id").primaryKey(),
  plan: text("plan").notNull(),
  status: text("status").notNull(),
  source: text("source").notNull(),
  monthlyPageLimit: integer("monthly_page_limit").notNull().default(90),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at"),
  note: text("note"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("entitlements_status_idx").on(table.status),
  index("entitlements_ends_at_idx").on(table.endsAt),
]);

export const paypalCheckoutSessions = sqliteTable("paypal_checkout_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  planId: text("plan_id"),
  approvalUrl: text("approval_url").notNull(),
  status: text("status").notNull().default("approval_pending"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("paypal_checkout_subscription_uq").on(table.subscriptionId),
  index("paypal_checkout_user_idx").on(table.userId, table.createdAt),
  index("paypal_checkout_plan_idx").on(table.userId, table.planId, table.createdAt),
]);

export const paypalSubscriptions = sqliteTable("paypal_subscriptions", {
  subscriptionId: text("subscription_id").primaryKey(),
  userId: text("user_id").notNull(),
  planId: text("plan_id").notNull(),
  status: text("status").notNull(),
  payerId: text("payer_id"),
  payerEmail: text("payer_email"),
  startedAt: text("started_at"),
  nextBillingAt: text("next_billing_at"),
  cancelledAt: text("cancelled_at"),
  rawUpdatedAt: text("raw_updated_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("paypal_subscriptions_user_idx").on(table.userId, table.status)]);

export const paypalWebhookEvents = sqliteTable("paypal_webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  subscriptionId: text("subscription_id"),
  status: text("status").notNull(),
  receivedAt: text("received_at").notNull(),
  processedAt: text("processed_at"),
  error: text("error"),
}, (table) => [index("paypal_webhook_received_idx").on(table.receivedAt)]);

export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const adminAuditLog = sqliteTable("admin_audit_log", {
  id: text("id").primaryKey(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("admin_audit_created_idx").on(table.createdAt),
]);

export const academicReportShares = sqliteTable("academic_report_shares", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  scope: text("scope").notNull(),
  payload: text("payload").notNull(),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
  lastAccessedAt: text("last_accessed_at"),
  viewCount: integer("view_count").notNull().default(0),
}, (table) => [
  uniqueIndex("academic_report_shares_token_uq").on(table.tokenHash),
  index("academic_report_shares_user_idx").on(table.userId, table.createdAt),
  index("academic_report_shares_expiry_idx").on(table.expiresAt, table.revokedAt),
]);

export const academicReportShareAttempts = sqliteTable("academic_report_share_attempts", {
  shareTokenHash: text("share_token_hash").notNull(),
  clientKey: text("client_key").notNull(),
  windowStartedAt: text("window_started_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
}, (table) => [
  uniqueIndex("academic_report_share_attempts_pk").on(table.shareTokenHash, table.clientKey),
  index("academic_report_share_attempts_window_idx").on(table.windowStartedAt),
]);

export const proUsageEvents = sqliteTable("pro_usage_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  units: integer("units").notNull().default(1),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("pro_usage_user_created_idx").on(table.userId, table.createdAt),
  index("pro_usage_action_created_idx").on(table.action, table.createdAt),
]);

export const institutionApiKeys = sqliteTable("institution_api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  tokenHash: text("token_hash").notNull(),
  scopes: text("scopes").notNull().default("bulk:analyze"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
  revokedAt: text("revoked_at"),
}, (table) => [
  uniqueIndex("institution_api_keys_token_uq").on(table.tokenHash),
  index("institution_api_keys_user_idx").on(table.userId, table.createdAt),
]);

export const institutionBatchJobs = sqliteTable("institution_batch_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  apiKeyId: text("api_key_id"),
  action: text("action").notNull(),
  status: text("status").notNull(),
  recordCount: integer("record_count").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [
  index("institution_batch_jobs_user_idx").on(table.userId, table.createdAt),
  index("institution_batch_jobs_key_idx").on(table.apiKeyId, table.createdAt),
]);
