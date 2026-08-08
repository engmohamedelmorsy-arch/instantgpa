import { AdminHttpError } from "../../../_shared/admin-data";
import {
  apiJson,
  requireInstitutionApiKey,
  runInstitutionBatch,
} from "../../../_shared/institution-api";

export function OPTIONS() {
  return apiJson({ ok: true });
}

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.toLocaleLowerCase("en").includes("application/json")) {
      return apiJson({ error: "Send application/json.", code: "JSON_REQUIRED" }, 415);
    }
    const identity = await requireInstitutionApiKey(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "").slice(0, 40);
    const records = Array.isArray(body.records) ? body.records : [];
    const batch = await runInstitutionBatch(identity.userId, identity.keyId, action, records);
    return apiJson({
      ok: true,
      batch,
      limits: { recordsPerRequest: 100, recordsPerMonth: identity.monthlyLimit },
    });
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return apiJson({ error: error.message, code: error.code }, error.status);
    }
    return apiJson({ error: "The institutional request could not be completed.", code: "INSTITUTION_API_ERROR" }, 500);
  }
}
