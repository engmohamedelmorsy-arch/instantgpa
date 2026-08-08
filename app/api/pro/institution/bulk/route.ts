import {
  assertSameOrigin,
  errorResponse,
  json,
  requireOwner,
} from "../../../_shared/admin-data";
import { runInstitutionBatch } from "../../../_shared/institution-api";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "").slice(0, 40);
    const records = Array.isArray(body.records) ? body.records : [];
    const batch = await runInstitutionBatch(user.id, null, action, records);
    return json({ ok: true, batch });
  } catch (error) {
    return errorResponse(error);
  }
}
