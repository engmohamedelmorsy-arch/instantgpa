import { errorResponse, getAdminDb, json, requireOwner } from "../../_shared/admin-data";
import { ensureObservabilitySchema } from "../../_shared/product-observability";

const FUNNEL = [
  ["onboarding_started", "Setup started"],
  ["academic_context_confirmed", "Setup completed"],
  ["transcript_import_started", "Transcript started"],
  ["transcript_review_started", "Transcript review"],
  ["transcript_import_completed", "Transcript approved"],
  ["gpa_calculated", "GPA result"],
  ["cgpa_calculated", "CGPA result"],
  ["pricing_viewed", "Pricing viewed"],
  ["checkout_started", "Checkout started"],
  ["premium_activated", "Premium activated"],
] as const;

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    await ensureObservabilitySchema();
    const db = getAdminDb();
    const [eventRows, daily, errors, feedback] = await Promise.all([
      db.prepare(`SELECT event_name AS eventName, count(DISTINCT session_hash) AS sessions, count(*) AS events
        FROM product_events WHERE created_at >= datetime('now', '-30 days') GROUP BY event_name`).all<{ eventName: string; sessions: number; events: number }>(),
      db.prepare(`SELECT substr(created_at, 1, 10) AS day, count(*) AS events, count(DISTINCT session_hash) AS sessions
        FROM product_events WHERE created_at >= datetime('now', '-30 days') GROUP BY day ORDER BY day`).all(),
      db.prepare(`SELECT fingerprint, category, path, message, count(*) AS occurrences, max(created_at) AS lastSeenAt
        FROM product_error_events WHERE created_at >= datetime('now', '-30 days')
        GROUP BY fingerprint, category, path, message ORDER BY occurrences DESC, lastSeenAt DESC LIMIT 25`).all(),
      db.prepare(`SELECT answer, count(*) AS responses FROM result_feedback
        WHERE created_at >= datetime('now', '-30 days') GROUP BY answer`).all<{ answer: string; responses: number }>(),
    ]);
    const byEvent = new Map((eventRows.results || []).map((row) => [row.eventName, row]));
    const funnel = FUNNEL.map(([eventName, label], index) => {
      const sessions = Number(byEvent.get(eventName)?.sessions || 0);
      const previous = index ? Number(byEvent.get(FUNNEL[index - 1][0])?.sessions || 0) : sessions;
      return {
        eventName,
        label,
        sessions,
        conversionFromPrevious: previous ? Math.round((sessions / previous) * 1_000) / 10 : null,
        dropOffFromPrevious: previous ? Math.max(0, previous - sessions) : 0,
      };
    });
    return json({
      periodDays: 30,
      funnel,
      daily: daily.results || [],
      errors: errors.results || [],
      feedback: Object.fromEntries((feedback.results || []).map((row) => [row.answer, Number(row.responses || 0)])),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
