import {
  assertSameOrigin,
  errorResponse,
  json,
  requireActiveSubscriber,
} from "../../_shared/admin-data";
import { clean, runProAnalysis } from "../../_shared/pro-analysis";
import { recordPremiumUsage } from "../../_shared/premium-firestore";
import { answerOfficialPolicyQuestion, semanticTransferAnalysis } from "../../_shared/grounded-intelligence";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveSubscriber(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = clean(body.action, 40);
    let result: unknown;
    try {
      result = action === "transfer"
        ? await semanticTransferAnalysis(body)
        : action === "policy_question"
          ? await answerOfficialPolicyQuestion(body)
          : runProAnalysis(action, body);
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN_PRO_ACTION";
      if ([
        "UNKNOWN_PRO_ACTION",
        "INVALID_SYLLABUS_QUESTION",
        "INVALID_CREDIT_SYSTEM",
        "INVALID_TRANSLATION_REQUEST",
      ].includes(code)) {
        return json({ error: "Review the Pro analysis inputs and try again.", code }, 400);
      }
      throw error;
    }

    await recordPremiumUsage(user.id, action);
    return json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
