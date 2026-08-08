import type { Page } from "@playwright/test";

export const gradingSystem = {
  presetId: "us-4.0",
  label: "United States (4.0 scale)",
  maxGpa: 4,
  scaleType: "letter",
  retakePolicy: "all",
  grades: [
    { label: "A", min: 93, points: 4 },
    { label: "A-", min: 90, points: 3.7 },
    { label: "B+", min: 87, points: 3.3 },
    { label: "B", min: 83, points: 3 },
    { label: "C", min: 73, points: 2 },
    { label: "D", min: 63, points: 1 },
    { label: "F", min: 0, points: 0 },
  ],
};

export const academicProfile = {
  schemaVersion: 4,
  confirmedAt: "2026-08-08T00:00:00.000Z",
  countryCode: "US",
  countryName: "United States",
  university: "InstantGPA Test University",
  college: "College of Engineering",
  department: "Computer Science",
  presetId: "us-4.0",
  gradingSystemId: "us-4.0",
  gradingSystemLabel: "United States (4.0 scale)",
};

export async function seedAcademicContext(page: Page, withRecord = false) {
  await page.addInitScript(({ profile, system, includeRecord }) => {
    localStorage.setItem("instantgpa:academicProfile", JSON.stringify(profile));
    localStorage.setItem("instantgpa:gradingSystem", JSON.stringify(system));
    localStorage.setItem("instantgpa:analyticsConsent", "denied");
    if (includeRecord) {
      localStorage.setItem("instantgpa:academicRecord:v2", JSON.stringify({
        version: 2,
        updatedAt: "2026-08-08T00:00:00.000Z",
        courses: [
          { id: "cs101", attemptId: "cs101", term: "Fall 2025", code: "CS101", name: "Introduction to Programming", credits: 3, grade: "A", status: "graded", type: "Core", prerequisites: [], prerequisiteGroups: [], source: "transcript" },
          { id: "cs201", attemptId: "cs201", term: "Spring 2026", code: "CS201", name: "Data Structures", credits: 3, grade: "U", status: "in_progress", type: "Core", prerequisites: ["CS101"], prerequisiteGroups: [["CS101"]], source: "transcript" },
        ],
      }));
    }
  }, { profile: academicProfile, system: gradingSystem, includeRecord: withRecord });
}

export async function mockPremiumFirebase(page: Page) {
  await page.route("**/firebase-app.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: "export const initializeApp=(config)=>({config}); export const getApps=()=>[]; export const getApp=()=>({});",
  }));
  await page.route("**/firebase-auth.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      export const browserLocalPersistence={};
      const user={uid:"premium-e2e",email:"premium@example.test",displayName:"Premium Student",emailVerified:true,getIdToken:async()=>"e2e-token",reload:async()=>{}};
      export const getAuth=()=>({currentUser:user,authStateReady:async()=>{},languageCode:"en"});
      export const setPersistence=async()=>{};
    `,
  }));
  await page.route("**/firebase-firestore.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      export const getFirestore=()=>({});
      export const doc=(db,...parts)=>parts.join("/");
      export const getDoc=async()=>({exists:()=>true,data:()=>({version:1,workspace:{syllabi:[],syllabusChats:[],advisorLinks:[]}})});
      export const serverTimestamp=()=>"2026-08-08T00:00:00.000Z";
      export const runTransaction=async(db,callback)=>callback({get:getDoc,set:()=>{}});
      export const setDoc=async()=>{};
    `,
  }));
  await page.route("**/firebase-app-check.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: "export class ReCaptchaEnterpriseProvider{constructor(key){this.key=key}} export const initializeAppCheck=()=>({}); export const getToken=async()=>({token:'e2e-app-check'});",
  }));
  await page.route("**/api/account/status", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      isOwner: false,
      entitlement: { plan: "InstantGPA Premium", status: "active", source: "paypal", monthlyPageLimit: 90, startsAt: "2026-08-01T00:00:00.000Z", endsAt: null },
      usage: { pagesConsumed: 2, pagesRemaining: 88 },
      emailDelivery: { status: "sent" },
    }),
  }));
  await page.route("**/api/pro/policies**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ entries: [], sources: [], reviewedAt: "2026-08-08", coverage: { totalInstitutions: 0 } }),
  }));
}

export async function mockSignedOutFirebase(page: Page) {
  await page.route("**/firebase-app.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: "export const initializeApp=(config)=>({config}); export const getApps=()=>[]; export const getApp=()=>({});",
  }));
  await page.route("**/firebase-auth.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      export const browserLocalPersistence={};
      export const getAuth=()=>({currentUser:null,authStateReady:async()=>{},languageCode:"en"});
      export const setPersistence=async()=>{};
      export const getRedirectResult=async()=>null;
    `,
  }));
  await page.route("**/firebase-firestore.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: "export const getFirestore=()=>({});",
  }));
  await page.route("**/firebase-app-check.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: "export class ReCaptchaEnterpriseProvider{constructor(key){this.key=key}} export const initializeAppCheck=()=>({}); export const getToken=async()=>({token:'e2e-app-check'});",
  }));
  await page.route("**/api/site-config", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ registration: "checkout_only" }),
  }));
}
