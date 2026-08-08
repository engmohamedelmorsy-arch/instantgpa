import { waitUntil } from "cloudflare:workers";
import { AdminHttpError, errorResponse, json, type FirebaseIdentity } from "../../../_shared/admin-data";
import { sendSubscriptionLifecycleEmail } from "../../../_shared/email";
import { getPayPalSubscription, verifyPayPalWebhook, webhookSubscriptionId } from "../../../_shared/paypal";
import { reconcilePayPalSubscription } from "../../../_shared/paypal-entitlement";
import {
  getPremiumAccount,
  reservePayPalWebhook,
  setPayPalWebhook,
} from "../../../_shared/premium-firestore";

const MAX_WEBHOOK_BYTES = 256 * 1024;

export async function POST(request: Request) {
  let eventId = "";
  let eventType = "";
  let subscriptionId = "";
  let receivedAt = "";
  try {
    const declaredSize = Number(request.headers.get("content-length") || 0);
    if (declaredSize > MAX_WEBHOOK_BYTES) throw new AdminHttpError("Webhook body is too large.", 413, "WEBHOOK_TOO_LARGE");
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_WEBHOOK_BYTES) throw new AdminHttpError("Webhook body is too large.", 413, "WEBHOOK_TOO_LARGE");
    const event = JSON.parse(raw) as Record<string, unknown>;
    eventId = String(event.id || "");
    eventType = String(event.event_type || "");
    if (!/^[A-Z0-9-]{8,80}$/i.test(eventId) || !eventType) throw new AdminHttpError("Invalid PayPal webhook event.", 400, "WEBHOOK_INVALID");
    if (!(await verifyPayPalWebhook(request, event))) throw new AdminHttpError("PayPal webhook signature verification failed.", 400, "WEBHOOK_SIGNATURE_INVALID");

    subscriptionId = webhookSubscriptionId(event);
    receivedAt = new Date().toISOString();
    const reserved = await reservePayPalWebhook(eventId, {
      eventId,
      eventType,
      subscriptionId: subscriptionId || null,
      status: "processing",
      receivedAt,
      processedAt: null,
      error: null,
    });
    if (!reserved) return json({ ok: true, duplicate: true });
    if (!subscriptionId) {
      await setPayPalWebhook(eventId, { eventId, eventType, subscriptionId: null, status: "ignored", receivedAt, processedAt: new Date().toISOString(), error: null });
      return json({ ok: true, ignored: true });
    }

    const subscription = await getPayPalSubscription(subscriptionId);
    const uid = String(subscription.custom_id || "");
    const account = uid ? await getPremiumAccount(uid) : null;
    if (!account) throw new AdminHttpError("PayPal subscription account was not found in Firebase.", 404, "PAYPAL_ACCOUNT_NOT_FOUND");
    const identity: FirebaseIdentity = {
      id: uid,
      email: String(account.email || subscription.subscriber?.email_address || ""),
      displayName: String(account.displayName || ""),
      emailVerified: Boolean(account.emailVerified),
      provider: String(account.provider || "firebase"),
    };
    const entitlement = await reconcilePayPalSubscription(identity, subscription);
    await setPayPalWebhook(eventId, { eventId, eventType, subscriptionId, uid, status: "processed", receivedAt, processedAt: new Date().toISOString(), error: null });
    const lifecycleEvent = eventType === "BILLING.SUBSCRIPTION.CANCELLED" ? "cancelled"
      : eventType === "BILLING.SUBSCRIPTION.SUSPENDED" ? "suspended"
        : eventType === "BILLING.SUBSCRIPTION.EXPIRED" ? "expired"
          : eventType === "BILLING.SUBSCRIPTION.PAYMENT.FAILED" ? "payment_failed"
            : null;
    if (lifecycleEvent && identity.email) waitUntil(sendSubscriptionLifecycleEmail(identity.email, lifecycleEvent).catch(() => ({ sent: false, configured: true })));
    return json({ ok: true, status: entitlement.status });
  } catch (error) {
    if (eventId && receivedAt) {
      try {
        await setPayPalWebhook(eventId, {
          eventId,
          eventType,
          subscriptionId: subscriptionId || null,
          status: "failed",
          receivedAt,
          processedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message.slice(0, 500) : "UNKNOWN_ERROR",
        });
      } catch { /* Firebase may be unavailable; PayPal will retry the webhook. */ }
    }
    return errorResponse(error);
  }
}
