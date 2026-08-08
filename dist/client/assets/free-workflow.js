import { Storage } from "./storage.js";

const KEY = "freeWorkflow:v1";

function state() {
  return Storage.get(KEY, { transcriptReviewedAt: "", gpaCompletedAt: "", lastGpa: null });
}

function emitChange(value) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("instantgpa:workflow-changed", { detail: value }));
}

export const FreeWorkflow = {
  get: state,

  transcriptReviewed() {
    return Boolean(state().transcriptReviewedAt);
  },

  gpaCompleted() {
    return Boolean(state().gpaCompletedAt);
  },

  markTranscriptReviewed() {
    const next = {
      ...state(),
      transcriptReviewedAt: new Date().toISOString(),
      gpaCompletedAt: "",
      lastGpa: null,
    };
    Storage.set(KEY, next);
    emitChange(next);
  },

  markGpaCompleted(result) {
    const next = {
      ...state(),
      gpaCompletedAt: new Date().toISOString(),
      lastGpa: result && result.ok ? {
        gpa: Number(result.gpa),
        credits: Number(result.totalCredits),
      } : null,
    };
    Storage.set(KEY, next);
    emitChange(next);
  },

  reset() {
    Storage.remove(KEY);
    emitChange(null);
  },
};
