import {
  AdminHttpError,
  assertSameOrigin,
  authenticateFirebase,
  errorResponse,
  json,
} from "../../_shared/admin-data";
import { countryCodeFromRequest } from "../../location/route";
import {
  approvalUrl,
  configuredPayPalPlanForCountry,
  createPayPalSubscription,
  getPayPalPlan,
  sandboxCheckoutAllowedForOrigin,
} from "../../_shared/paypal";
import { getPayPalCheckout, setPayPalCheckout, upsertPremiumAccount } from "../../_shared/premium-firestore";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!sandboxCheckoutAllowedForOrigin(new URL(request.url).origin)) {
      throw new AdminHttpError(
        "Checkout is in PayPal Sandbox test mode. Real subscriptions stay disabled until Live credentials, plans, and a Live webhook are configured.",
        503,
        "PAYPAL_LIVE_REQUIRED",
      );
    }
    const user = await authenticateFirebase(request);
    await upsertPremiumAccount(user);
    if (!user.emailVerified) {
      throw new AdminHttpError("Verify your email before opening PayPal checkout.", 403, "EMAIL_VERIFICATION_REQUIRED");
    }
    const body = await request.json().catch(() => ({})) as { locale?: string; billingPeriod?: string };
    const countryCode = countryCodeFromRequest(request) || "XX";
    let selection: ReturnType<typeof configuredPayPalPlanForCountry>;
    try {
      selection = configuredPayPalPlanForCountry(countryCode, body.billingPeriod);
      await getPayPalPlan(selection);
    } catch (error) {
      if (error instanceof Error && error.message === "PAYPAL_COUNTRY_UNAVAILABLE") {
        throw new AdminHttpError("PayPal subscriptions are not available in your country. Free tools remain available.", 409, "PAYPAL_COUNTRY_UNAVAILABLE");
      }
      throw error;
    }
    const recent = await getPayPalCheckout(user.id);
    const createdAt = Date.parse(String(recent?.createdAt || ""));
    if (
      recent?.approvalUrl
      && recent.planId === selection.planId
      && ["approval_pending", "pending"].includes(String(recent.status || ""))
      && Number.isFinite(createdAt)
      && createdAt >= Date.now() - 2 * 60 * 60 * 1_000
    ) {
      return json({ ok: true, provider: "paypal", subscriptionId: recent.subscriptionId, checkoutUrl: recent.approvalUrl, reused: true });
    }

    const requestId = crypto.randomUUID();
    const subscription = await createPayPalSubscription({
      uid: user.id,
      email: user.email,
      locale: String(body.locale || "en-US").slice(0, 10),
      origin: new URL(request.url).origin,
      requestId,
      selection,
    });
    const checkoutUrl = approvalUrl(subscription);
    const now = new Date().toISOString();
    await setPayPalCheckout(user.id, {
      id: requestId,
      uid: user.id,
      subscriptionId: subscription.id,
      planId: selection.planId,
      approvalUrl: checkoutUrl,
      status: "approval_pending",
      createdAt: now,
      updatedAt: now,
    });
    return json({
      ok: true,
      provider: "paypal",
      subscriptionId: subscription.id,
      checkoutUrl,
      tier: selection.tier,
      billingPeriod: selection.billingPeriod,
      price: selection.price,
      currency: selection.currency,
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
