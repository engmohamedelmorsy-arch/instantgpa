import {
  AdminHttpError,
  assertSameOrigin,
  authenticateFirebase,
  errorResponse,
  json,
} from "../../../_shared/admin-data";
import { getPayPalSubscription } from "../../../_shared/paypal";
import { reconcilePayPalSubscription } from "../../../_shared/paypal-entitlement";
import { upsertPremiumAccount } from "../../../_shared/premium-firestore";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await authenticateFirebase(request);
    await upsertPremiumAccount(user);
    const body = await request.json().catch(() => ({})) as { subscriptionId?: string };
    const subscriptionId = String(body.subscriptionId || "");
    if (!/^I-[A-Z0-9]+$/i.test(subscriptionId)) {
      throw new AdminHttpError("A valid PayPal subscription ID is required.", 400, "PAYPAL_SUBSCRIPTION_INVALID");
    }
    const subscription = await getPayPalSubscription(subscriptionId);
    const entitlement = await reconcilePayPalSubscription(user, subscription);
    return json({ ok: true, entitlement });
  } catch (error) {
    return errorResponse(error);
  }
}
