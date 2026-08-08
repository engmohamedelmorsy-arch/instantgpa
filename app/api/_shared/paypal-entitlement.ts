import type { FirebaseIdentity } from "./admin-data";
import { AdminHttpError } from "./admin-data";
import { configuredPayPalPlanById, entitlementStatus, type PayPalSubscription } from "./paypal";
import {
  setPayPalCheckout,
  setPayPalSubscriptionRecord,
  setPremiumEntitlement,
} from "./premium-firestore";

export async function reconcilePayPalSubscription(user: FirebaseIdentity, subscription: PayPalSubscription) {
  const selection = configuredPayPalPlanById(subscription.plan_id);
  if (!selection) {
    throw new AdminHttpError("This PayPal subscription belongs to a different plan.", 409, "PAYPAL_PLAN_MISMATCH");
  }
  if (subscription.custom_id !== user.id) {
    throw new AdminHttpError("This PayPal subscription belongs to a different account.", 403, "PAYPAL_ACCOUNT_MISMATCH");
  }
  const payerEmail = subscription.subscriber?.email_address?.trim().toLowerCase() || "";

  const status = entitlementStatus(subscription.status);
  const now = new Date().toISOString();
  const startsAt = subscription.start_time || now;
  const monthlyPageLimit = Math.max(30, Number(process.env.PREMIUM_MONTHLY_PAGE_LIMIT) || 90);
  const tierLabel = selection.tier === "high" ? "High" : selection.tier[0].toUpperCase() + selection.tier.slice(1);
  const periodLabel = selection.billingPeriod === "annual" ? "Annual" : "Monthly";
  const plan = `InstantGPA Premium · ${tierLabel} ${periodLabel}`;
  const firestoreEntitlement = {
    uid: user.id,
    plan,
    status,
    source: "paypal",
    subscriptionId: subscription.id,
    paypalPlanId: selection.planId,
    pricingTier: selection.tier,
    billingPeriod: selection.billingPeriod,
    price: selection.price,
    currency: selection.currency,
    monthlyPageLimit,
    startsAt,
    nextBillingAt: subscription.billing_info?.next_billing_time || null,
    updatedAt: now,
  };

  await Promise.all([
    setPremiumEntitlement(firestoreEntitlement),
    setPayPalSubscriptionRecord(subscription.id, {
      subscriptionId: subscription.id,
      uid: user.id,
      planId: subscription.plan_id,
      status: subscription.status,
      entitlementStatus: status,
      payerId: subscription.subscriber?.payer_id || null,
      payerEmail: payerEmail || null,
      startedAt: subscription.start_time || null,
      nextBillingAt: subscription.billing_info?.next_billing_time || null,
      cancelledAt: status === "cancelled" ? (subscription.status_update_time || now) : null,
      providerUpdatedAt: subscription.status_update_time || now,
      updatedAt: now,
    }),
    setPayPalCheckout(user.id, {
      uid: user.id,
      subscriptionId: subscription.id,
      planId: subscription.plan_id,
      status,
      updatedAt: now,
    }),
  ]);
  return firestoreEntitlement;
}
