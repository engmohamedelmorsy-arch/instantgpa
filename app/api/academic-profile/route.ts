import {
  assertSameOrigin,
  ensureAdminSchema,
  errorResponse,
  getAdminDb,
  json,
} from "../_shared/admin-data";
import directory from "../../../static-site/data/academic-directory.json";

type ProfileBody = {
  installId?: unknown;
  countryCode?: unknown;
  countryName?: unknown;
  university?: unknown;
  college?: unknown;
  department?: unknown;
  gradingSystemId?: unknown;
  gradingSystemLabel?: unknown;
  directoryUniversity?: unknown;
  directoryCollege?: unknown;
  directoryDepartment?: unknown;
};

function clean(value: unknown, max = 180) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalized(value: string) {
  return value.normalize("NFKD").toLocaleLowerCase("en").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9\p{L}]+/gu, " ").trim();
}

function slug(value: string) {
  const source = normalized(value);
  const ascii = source.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 82);
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(36);
  return ascii ? `${ascii}-${suffix}` : `entry-${suffix}`;
}

function validInstallId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validLabel(value: string) {
  return value.length >= 2 && !/https?:\/\/|www\.|[<>]/i.test(value);
}

async function refreshUniversityMetrics(db: D1Database, universityId: string, now: string) {
  const counts = await db.prepare(`SELECT
      count(*) AS contributors,
      count(DISTINCT lower(college_name)) AS colleges,
      count(DISTINCT lower(college_name) || '|' || lower(department_name)) AS departments
    FROM academic_profile_contributions WHERE university_profile_id = ?`)
    .bind(universityId).first<{ contributors: number; colleges: number; departments: number }>();
  await db.prepare(`UPDATE university_profiles SET contributor_count = ?, college_count = ?,
      department_count = ?, updated_at = ? WHERE id = ?`)
    .bind(counts?.contributors || 0, counts?.colleges || 0, counts?.departments || 0, now, universityId).run();
}

async function refreshUnitMetrics(db: D1Database, universityId: string, college: string, department: string, now: string) {
  const count = await db.prepare(`SELECT count(*) AS contributors FROM academic_profile_contributions
      WHERE university_profile_id = ? AND lower(college_name) = lower(?) AND lower(department_name) = lower(?)`)
    .bind(universityId, college, department).first<{ contributors: number }>();
  await db.prepare(`UPDATE university_academic_units SET contributor_count = ?, updated_at = ?
      WHERE university_profile_id = ? AND college_slug = ? AND department_slug = ?`)
    .bind(count?.contributors || 0, now, universityId, slug(college), slug(department)).run();
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureAdminSchema();
    const body = await request.json().catch(() => ({})) as ProfileBody;
    const installId = clean(body.installId, 50).toLowerCase();
    if (!validInstallId(installId)) {
      return json({ error: "This browser could not create a valid contribution key.", code: "INVALID_INSTALL_ID" }, 400);
    }

    const countryCode = clean(body.countryCode, 5).toUpperCase();
    const requestedCountryName = clean(body.countryName, 100);
    const university = clean(body.university);
    const college = clean(body.college);
    const department = clean(body.department);
    const gradingSystemId = clean(body.gradingSystemId, 100);
    const gradingSystemLabel = clean(body.gradingSystemLabel, 180);
    if (!/^(?:[A-Z]{2}|OTHER)$/.test(countryCode)
      || ![requestedCountryName, university, college, department, gradingSystemId, gradingSystemLabel].every(validLabel)) {
      return json({ error: "Country, university, college, department, and grading system are required.", code: "INCOMPLETE_ACADEMIC_PROFILE" }, 400);
    }

    // Academic-directory contributions are pseudonymous for every tier. The
    // paid subscriber's private profile is part of their Firebase snapshot.
    const contributorId = `anon:${installId}`;
    const db = getAdminDb();
    const now = new Date().toISOString();
    const countryRecord = directory.countries.find((candidate) => candidate.code === countryCode);
    const countryName = countryRecord?.name || requestedCountryName;
    const universityRecord = (directory.universitiesByCountry as Record<string, Array<{ name: string }>>)[countryCode]
      ?.find((candidate) => normalized(candidate.name) === normalized(university));
    const collegeRecord = universityRecord
      ? (directory.collegesByUniversity as Record<string, Array<{ name: string; departments: string[] }>>)[universityRecord.name]
        ?.find((candidate) => normalized(candidate.name) === normalized(college))
      : null;
    const departmentRecord = collegeRecord?.departments
      .find((candidate) => normalized(candidate) === normalized(department));
    const universityNormalized = normalized(university);
    const universityId = `${countryCode.toLowerCase()}:${slug(university)}`;
    const directoryUniversity = Boolean(universityRecord);
    const directoryCollege = Boolean(collegeRecord);
    const directoryDepartment = Boolean(departmentRecord);
    const qualityStatus = directoryUniversity && directoryCollege && directoryDepartment
      ? "directory_verified"
      : directoryUniversity ? "mixed" : "user_submitted";
    const old = await db.prepare(`SELECT university_profile_id AS universityId, college_name AS college,
        department_name AS department FROM academic_profile_contributions WHERE contributor_id IN (?, ?)
        ORDER BY updated_at DESC LIMIT 1`)
      .bind(contributorId, `anon:${installId}`)
      .first<{ universityId: string; college: string; department: string }>();

    await db.prepare(`INSERT INTO university_profiles
      (id, country_code, country_name, university_name, university_normalized, university_slug,
       source_status, contributor_count, college_count, department_count, created_at, updated_at, last_contributed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)
      ON CONFLICT(country_code, university_normalized) DO UPDATE SET
        university_name = excluded.university_name,
        country_name = excluded.country_name,
        source_status = CASE WHEN university_profiles.source_status = 'directory_verified' THEN university_profiles.source_status ELSE excluded.source_status END,
        updated_at = excluded.updated_at,
        last_contributed_at = excluded.last_contributed_at`)
      .bind(universityId, countryCode, countryName, university, universityNormalized, slug(university),
        directoryUniversity ? "directory_verified" : "user_submitted", now, now, now).run();

    await db.prepare(`INSERT INTO academic_profile_contributions
      (contributor_id, user_id, install_id, university_profile_id, country_code, country_name,
       university_name, college_name, department_name, grading_system_id, grading_system_label,
       directory_university, directory_college, directory_department, quality_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(contributor_id) DO UPDATE SET
        user_id = excluded.user_id, install_id = excluded.install_id,
        university_profile_id = excluded.university_profile_id, country_code = excluded.country_code,
        country_name = excluded.country_name, university_name = excluded.university_name,
        college_name = excluded.college_name, department_name = excluded.department_name,
        grading_system_id = excluded.grading_system_id, grading_system_label = excluded.grading_system_label,
        directory_university = excluded.directory_university, directory_college = excluded.directory_college,
        directory_department = excluded.directory_department, quality_status = excluded.quality_status,
        updated_at = excluded.updated_at`)
      .bind(contributorId, null, installId, universityId, countryCode, countryName,
        university, college, department, gradingSystemId, gradingSystemLabel,
        directoryUniversity ? 1 : 0, directoryCollege ? 1 : 0, directoryDepartment ? 1 : 0,
        qualityStatus, now, now).run();

    const unitId = `${universityId}:${slug(college)}:${slug(department)}`;
    await db.prepare(`INSERT INTO university_academic_units
      (id, university_profile_id, college_name, college_slug, department_name, department_slug,
       quality_status, contributor_count, created_at, updated_at, last_contributed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(university_profile_id, college_slug, department_slug) DO UPDATE SET
        college_name = excluded.college_name, department_name = excluded.department_name,
        quality_status = CASE WHEN university_academic_units.quality_status = 'directory_verified' THEN university_academic_units.quality_status ELSE excluded.quality_status END,
        updated_at = excluded.updated_at, last_contributed_at = excluded.last_contributed_at`)
      .bind(unitId, universityId, college, slug(college), department, slug(department),
        directoryCollege && directoryDepartment ? "directory_verified" : "user_submitted", now, now, now).run();

    await refreshUniversityMetrics(db, universityId, now);
    await refreshUnitMetrics(db, universityId, college, department, now);
    if (old && old.universityId !== universityId) await refreshUniversityMetrics(db, old.universityId, now);
    if (old && (old.universityId !== universityId || old.college !== college || old.department !== department)) {
      await refreshUnitMetrics(db, old.universityId, old.college, old.department, now);
    }

    return json({
      ok: true,
      universityProfileId: universityId,
      qualityStatus,
      message: qualityStatus === "directory_verified"
        ? "Academic profile saved and matched to the verified directory."
        : "Academic profile saved for directory review.",
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
