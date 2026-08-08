import { AcademicProfile } from "./academic-profile.js";
import { AcademicRecord } from "./academic-record.js";
import { GradingEngine } from "./grading-engine.js";
import { Storage } from "./storage.js";

let timer = null;
let syncing = null;
let hydrating = null;
let restoring = false;
const SYNC_STATUS_KEY = "academicCloudSyncStatus:v1";
const PREMIUM_STATE_KEYS = [
  "previousAcademicRecord",
  "degreeAuditGroups",
  "degreeAuditAssignments",
  "scenarioLabSaved:v1",
  "scenarioLabScenarios:v2",
  "weightedGrade:v1",
  "graduationGoal:v1",
  "latestCgpa:v1",
  "latestRetake:v1",
  "premiumSyllabi:v1",
  "transcriptFingerprint:v1",
  "adviserNotes:v1",
  "commandCenterSettings:v1",
];
const SYNC_TRIGGER_KEYS = new Set([
  "academicProfile",
  "gradingSystem",
  "academicRecord:v2",
  "transcriptHistory:v2",
  "programRequirements:v1",
  "currentTermGpa:v1",
  "freeWorkflow:v1",
  ...PREMIUM_STATE_KEYS,
]);

function publishSyncStatus(status, details = {}) {
  const value = { status, ...details, updatedAt: new Date().toISOString() };
  Storage.set(SYNC_STATUS_KEY, value);
  window.dispatchEvent(new CustomEvent("instantgpa:academic-sync-status", { detail: value }));
  return value;
}

function snapshot(tier = "free") {
  const system = GradingEngine.getActive();
  const value = {
    schemaVersion: 1,
    privacyPolicyVersion: "2026-08-08",
    processingPurpose: "service-operation-and-product-improvement",
    profile: AcademicProfile.get(),
    gradingSystem: system,
    record: AcademicRecord.get(),
    programRequirements: AcademicRecord.programRequirements(),
    summary: AcademicRecord.summary(system),
    currentTermGpa: Storage.get("currentTermGpa:v1", null),
    freeWorkflow: Storage.get("freeWorkflow:v1", null),
    capturedAt: new Date().toISOString(),
  };
  if (tier === "premium") {
    value.transcriptHistory = AcademicRecord.history();
    value.savedState = Object.fromEntries(PREMIUM_STATE_KEYS.map((key) => [key, Storage.get(key, null)]));
  }
  return value;
}

function localAcademicTimestamp() {
  const timestamps = [
    AcademicProfile.get()?.confirmedAt,
    AcademicRecord.get()?.updatedAt,
    Storage.get("currentTermGpa:v1", null)?.updatedAt,
    Storage.get(SYNC_STATUS_KEY, null)?.status === "synced" ? Storage.get(SYNC_STATUS_KEY, null)?.updatedAt : null,
  ].map((value) => Date.parse(value || "")).filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : 0;
}

function hasLocalAcademicData() {
  return Boolean(AcademicProfile.get() || AcademicRecord.courses().length || Storage.get("currentTermGpa:v1", null));
}

function restorePremiumSnapshot(cloudSnapshot) {
  if (!cloudSnapshot || typeof cloudSnapshot !== "object") return false;
  restoring = true;
  try {
    const entries = [
      ["academicProfile", cloudSnapshot.profile],
      ["gradingSystem", cloudSnapshot.gradingSystem],
      ["academicRecord:v2", cloudSnapshot.record],
      ["transcriptHistory:v2", cloudSnapshot.transcriptHistory],
      ["programRequirements:v1", cloudSnapshot.programRequirements],
      ["currentTermGpa:v1", cloudSnapshot.currentTermGpa],
      ["freeWorkflow:v1", cloudSnapshot.freeWorkflow],
      ...PREMIUM_STATE_KEYS.map((key) => [key, cloudSnapshot.savedState?.[key]]),
    ];
    entries.forEach(([key, value]) => {
      if (value == null) Storage.remove(key);
      else Storage.set(key, value);
    });
    publishSyncStatus("synced", {
      destination: "firebase",
      direction: "download",
      courseCount: cloudSnapshot.record?.courses?.length || 0,
    });
    window.dispatchEvent(new CustomEvent("instantgpa:academic-cloud-restored", { detail: cloudSnapshot }));
    return true;
  } finally {
    restoring = false;
  }
}

export async function syncAcademicCloudRecord() {
  if (syncing) return syncing;
  if (hydrating) return hydrating.then(() => syncAcademicCloudRecord());
  syncing = (async () => {
    publishSyncStatus("syncing");
    let signedIn = false;
    try {
      const { CloudSync } = await import("./cloud-sync.js");
      const session = await Promise.race([
        CloudSync.getSession(),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false }), 1500)),
      ]);
      if (session.ok && session.session) {
        signedIn = true;
        const status = await CloudSync.getAccountStatus();
        if (!status.ok) throw new Error(status.error || "Premium status could not be verified.");
        if (status.ok && (status.data?.isOwner || status.data?.entitlement?.status === "active")) {
          const academicSnapshot = snapshot("premium");
          const result = await CloudSync.savePremiumAcademicRecord(academicSnapshot);
          if (!result.ok) throw new Error(result.error || "Firebase academic record sync failed.");
          publishSyncStatus("synced", { destination: "firebase", courseCount: result.data.courseCount });
          return result.data;
        }
      }
    } catch (error) {
      // Signed Premium data must never fall back into D1. Surface the failure
      // and let the scheduled retry try Firebase again.
      if (signedIn) {
        publishSyncStatus("failed", { destination: "firebase", error: error?.message || "Firebase synchronization failed." });
        throw error;
      }
    }

    const response = await fetch("/api/academic-record", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installId: AcademicProfile.installId(), snapshot: snapshot("free") }),
      keepalive: true,
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Academic record sync failed.");
    const data = await response.json();
    publishSyncStatus("synced", { destination: "d1", courseCount: data.courseCount });
    return data;
  })().finally(() => { syncing = null; });
  return syncing;
}

export async function hydratePremiumAcademicRecord() {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const { CloudSync } = await import("./cloud-sync.js");
      const session = await CloudSync.getSession();
      if (!session.ok || !session.session) return { ok: false, reason: "signed_out" };
      const loaded = await CloudSync.loadPremiumAcademicRecord();
      if (!loaded.ok) return loaded;
      const cloudSnapshot = loaded.data.snapshot;
      if (!cloudSnapshot) {
        if (hasLocalAcademicData()) scheduleAcademicCloudRecordSync(0);
        return { ok: true, restored: false, empty: true };
      }
      const cloudTimestamp = Date.parse(cloudSnapshot.capturedAt || "") || 0;
      const localTimestamp = localAcademicTimestamp();
      if (!hasLocalAcademicData() || cloudTimestamp > localTimestamp) {
        restorePremiumSnapshot(cloudSnapshot);
        return { ok: true, restored: true };
      }
      if (localTimestamp > cloudTimestamp) scheduleAcademicCloudRecordSync(0);
      return { ok: true, restored: false };
    } catch (error) {
      publishSyncStatus("failed", { destination: "firebase", direction: "download", error: error?.message || "Firebase restore failed." });
      return { ok: false, reason: "FIRESTORE_UNAVAILABLE", error: error?.message || "Firebase restore failed." };
    }
  })().finally(() => { hydrating = null; });
  return hydrating;
}

export function scheduleAcademicCloudRecordSync(delay = 500, retry = 0) {
  clearTimeout(timer);
  timer = setTimeout(() => syncAcademicCloudRecord().catch((error) => {
    publishSyncStatus("failed", { error: error?.message || "Academic record sync failed.", retry });
    if (retry < 2) scheduleAcademicCloudRecordSync(5_000 * (retry + 1), retry + 1);
  }), delay);
}

export function installAcademicCloudRecordSync() {
  window.addEventListener("instantgpa:academic-record-changed", () => scheduleAcademicCloudRecordSync());
  window.addEventListener("instantgpa:academic-profile-confirmed", () => scheduleAcademicCloudRecordSync());
  window.addEventListener("instantgpa:workflow-changed", () => scheduleAcademicCloudRecordSync());
  window.addEventListener("instantgpa:storage-changed", (event) => {
    if (!restoring && SYNC_TRIGGER_KEYS.has(event.detail?.key)) scheduleAcademicCloudRecordSync();
  });
  window.addEventListener("instantgpa:auth-changed", () => hydratePremiumAcademicRecord());
  window.setTimeout(() => hydratePremiumAcademicRecord(), 900);
  if (AcademicProfile.get() || AcademicRecord.courses().length) scheduleAcademicCloudRecordSync(1_800);
}
