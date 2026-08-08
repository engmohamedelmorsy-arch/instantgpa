import {
  createFirestoreDocument,
  getFirestoreDocument,
  setFirestoreDocument,
} from "./firebase-admin-rest";

export type PremiumIdentity = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  provider: string;
};

export type PremiumEntitlement = {
  uid: string;
  plan: string;
  status: string;
  source: string;
  subscriptionId?: string | null;
  paypalPlanId?: string | null;
  pricingTier?: string | null;
  billingPeriod?: string | null;
  price?: number | null;
  currency?: string | null;
  monthlyPageLimit: number;
  startsAt?: string | null;
  endsAt?: string | null;
  nextBillingAt?: string | null;
  updatedAt: string;
};

export async function upsertPremiumAccount(user: PremiumIdentity) {
  const path = `premiumUsers/${user.id}/account/current`;
  const existing = await getFirestoreDocument<Record<string, unknown>>(path);
  const now = new Date().toISOString();
  const account = {
    ...(existing || {}),
    uid: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    provider: user.provider,
    status: existing?.status || "active",
    createdAt: existing?.createdAt || now,
    lastSeenAt: now,
    updatedAt: now,
  };
  await Promise.all([
    setFirestoreDocument(path, account),
    setFirestoreDocument(`premiumAccounts/${user.id}`, account),
  ]);
  return account;
}

export function getPremiumAccount(uid: string) {
  return getFirestoreDocument<Record<string, unknown>>(`premiumUsers/${uid}/account/current`);
}

export function getPremiumEntitlement(uid: string) {
  return getFirestoreDocument<PremiumEntitlement>(`entitlements/${uid}`);
}

export async function setPremiumEntitlement(entitlement: PremiumEntitlement) {
  await setFirestoreDocument(`entitlements/${entitlement.uid}`, entitlement);
  return entitlement;
}

export function getPayPalSubscriptionRecord(subscriptionId: string) {
  return getFirestoreDocument<Record<string, unknown>>(`paypalSubscriptions/${subscriptionId}`);
}

export function setPayPalSubscriptionRecord(subscriptionId: string, data: Record<string, unknown>) {
  return setFirestoreDocument(`paypalSubscriptions/${subscriptionId}`, data);
}

export function getPayPalCheckout(uid: string) {
  return getFirestoreDocument<Record<string, unknown>>(`paypalCheckoutSessions/${uid}`);
}

export function setPayPalCheckout(uid: string, data: Record<string, unknown>) {
  return setFirestoreDocument(`paypalCheckoutSessions/${uid}`, data);
}

export function reservePayPalWebhook(eventId: string, data: Record<string, unknown>) {
  return createFirestoreDocument(`paypalWebhookEvents/${eventId}`, data);
}

export function setPayPalWebhook(eventId: string, data: Record<string, unknown>) {
  return setFirestoreDocument(`paypalWebhookEvents/${eventId}`, data);
}

export function getEmailDelivery(uid: string, type: string) {
  return getFirestoreDocument<Record<string, unknown>>(`premiumUsers/${uid}/emailDeliveries/${type}`);
}

export function setEmailDelivery(uid: string, type: string, data: Record<string, unknown>) {
  return setFirestoreDocument(`premiumUsers/${uid}/emailDeliveries/${type}`, data);
}

export function recordPremiumUsage(uid: string, action: string) {
  const id = crypto.randomUUID();
  return createFirestoreDocument(`premiumUsers/${uid}/usageEvents/${id}`, {
    id,
    action,
    units: 1,
    createdAt: new Date().toISOString(),
  });
}

export function setPremiumUsageEvent(uid: string, id: string, data: Record<string, unknown>) {
  return setFirestoreDocument(`premiumUsers/${uid}/usageEvents/${id}`, data);
}
