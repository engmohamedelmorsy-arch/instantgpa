import {
  AdminHttpError,
  assertSameOrigin,
  authenticateFirebase,
  errorResponse,
  json,
} from "../../../_shared/admin-data";
import { cancelPayPalSubscription, getPayPalSubscription } from "../../../_shared/paypal";
import { reconcilePayPalSubscription } from "../../../_shared/paypal-entitlement";
import { getPremiumEntitlement, upsertPremiumAccount } from "../../../_shared/premium-firestore";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await authenticateFirebase(request);
    await upsertPremiumAccount(user);
    const stored = await getPremiumEntitlement(user.id);
    const subscriptionId = String(stored?.subscriptionId || "");
    if (!/^I-[A-Z0-9]+$/i.test(subscriptionId)) throw new AdminHttpError("No active PayPal subscription was found.", 404, "PAYPAL_SUBSCRIPTION_NOT_FOUND");
    await cancelPayPalSubscription(subscriptionId);
    const subscription = await getPayPalSubscription(subscriptionId);
    const entitlement = await reconcilePayPalSubscription(user, subscription);
    return json({ ok: true, entitlement });
  } catch (error) {
    return errorResponse(error);
  }
}
