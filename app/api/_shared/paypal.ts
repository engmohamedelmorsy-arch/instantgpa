import {
  REGIONAL_PRICE_BOOK,
  paypalPlanEnvironmentKey,
  pricingTierForCountry,
  normalizeBillingPeriod,
  type BillingPeriod,
  type PricingTier,
  type RegionalPrice,
} from "./regional-pricing";

export type PayPalSubscription = {
  id: string;
  plan_id: string;
  status: string;
  custom_id?: string;
  start_time?: string;
  status_update_time?: string;
  subscriber?: {
    email_address?: string;
    payer_id?: string;
    name?: { given_name?: string; surname?: string };
  };
  billing_info?: { next_billing_time?: string };
  links?: Array<{ href?: string; rel?: string; method?: string }>;
};

type PayPalPlan = {
  id: string;
  name?: string;
  status?: string;
  billing_cycles?: Array<{
    tenure_type?: string;
    frequency?: { interval_unit?: string; interval_count?: number };
    pricing_scheme?: { fixed_price?: { value?: string; currency_code?: string } };
  }>;
};

export type PayPalPlanSelection = RegionalPrice & {
  planId: string;
};

type PayPalPlanDetails = PayPalPlanSelection & {
  id: string;
  name: string;
  status: string;
};

export function paypalEnvironment() {
  return process.env.PAYPAL_ENV?.toLowerCase() === "live" ? "live" : "sandbox";
}

function baseUrl() {
  return paypalEnvironment() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function sandboxCheckoutAllowedForOrigin(origin: string) {
  const hostname = new URL(origin).hostname.toLowerCase();
  return paypalEnvironment() === "live"
    || !["instantgpa.com", "www.instantgpa.com"].includes(hostname)
    || process.env.ALLOW_SANDBOX_CHECKOUT_ON_PRODUCTION === "true";
}

function credentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !secret) throw new Error("PAYPAL_NOT_CONFIGURED");
  return { clientId, secret };
}

function configuredPlanId(tier: PricingTier, billingPeriod: BillingPeriod) {
  const key = paypalPlanEnvironmentKey(tier, billingPeriod);
  const planId = process.env[key]?.trim();
  if (!planId || !/^P-[A-Z0-9-]+$/i.test(planId)) throw new Error(`${key}_NOT_CONFIGURED`);
  return planId;
}

export function configuredPayPalPlanForCountry(countryCode: unknown, billingPeriod: unknown): PayPalPlanSelection {
  const tier = pricingTierForCountry(countryCode);
  if (!tier) throw new Error("PAYPAL_COUNTRY_UNAVAILABLE");
  const period = normalizeBillingPeriod(billingPeriod);
  return { ...REGIONAL_PRICE_BOOK[tier][period], planId: configuredPlanId(tier, period) };
}

export function configuredPayPalPlanById(value: unknown): PayPalPlanSelection | null {
  const planId = String(value || "").trim();
  if (!/^P-[A-Z0-9-]+$/i.test(planId)) return null;
  for (const tier of Object.keys(REGIONAL_PRICE_BOOK) as PricingTier[]) {
    for (const billingPeriod of ["monthly", "annual"] as BillingPeriod[]) {
      try {
        if (configuredPlanId(tier, billingPeriod) === planId) {
          return { ...REGIONAL_PRICE_BOOK[tier][billingPeriod], planId };
        }
      } catch {
        // A missing unrelated regional plan must not invalidate this plan.
      }
    }
  }
  return null;
}

async function token() {
  const { clientId, secret } = credentials();
  const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
  if (!response.ok || !body.access_token) throw new Error("PAYPAL_AUTH_FAILED");
  return body.access_token;
}

async function paypalRequest<T>(path: string, init: RequestInit = {}) {
  const accessToken = await token();
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({})) as T & { message?: string; details?: Array<{ description?: string }> };
  if (!response.ok) throw new Error(body.details?.[0]?.description || body.message || "PAYPAL_API_FAILED");
  return body;
}

export async function getPayPalPlan(selection: PayPalPlanSelection) {
  const plan = await paypalRequest<PayPalPlan>(`/v1/billing/plans/${encodeURIComponent(selection.planId)}`);
  const regular = plan.billing_cycles?.find((cycle) => cycle.tenure_type === "REGULAR" && cycle.pricing_scheme?.fixed_price?.value);
  const details: PayPalPlanDetails = {
    ...selection,
    id: plan.id,
    name: plan.name || "InstantGPA Premium",
    status: plan.status || "",
  };
  const actualPrice = Number(regular?.pricing_scheme?.fixed_price?.value);
  const actualCurrency = regular?.pricing_scheme?.fixed_price?.currency_code || "";
  const actualInterval = regular?.frequency?.interval_unit?.toLowerCase() || "";
  const actualIntervalCount = Number(regular?.frequency?.interval_count) || 0;
  if (
    details.status !== "ACTIVE"
    || Math.round(actualPrice * 100) !== Math.round(selection.price * 100)
    || actualCurrency !== selection.currency
    || actualInterval !== selection.interval
    || actualIntervalCount !== selection.intervalCount
  ) {
    throw new Error("PAYPAL_PLAN_CONFIGURATION_MISMATCH");
  }
  return details;
}

export async function getPayPalPricingForCountry(countryCode: unknown) {
  const monthlySelection = configuredPayPalPlanForCountry(countryCode, "monthly");
  const annualSelection = configuredPayPalPlanForCountry(countryCode, "annual");
  const [monthly, annual] = await Promise.all([
    getPayPalPlan(monthlySelection),
    getPayPalPlan(annualSelection),
  ]);
  return { tier: monthly.tier, monthly, annual };
}

export async function createPayPalSubscription(input: {
  uid: string;
  email: string;
  locale?: string;
  origin: string;
  requestId: string;
  selection: PayPalPlanSelection;
}) {
  return paypalRequest<PayPalSubscription>("/v1/billing/subscriptions", {
    method: "POST",
    headers: { "PayPal-Request-Id": input.requestId },
    body: JSON.stringify({
      plan_id: input.selection.planId,
      custom_id: input.uid,
      subscriber: { email_address: input.email },
      application_context: {
        brand_name: "InstantGPA",
        locale: input.locale || "en-US",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        return_url: `${input.origin}/account?paypal=success`,
        cancel_url: `${input.origin}/pricing?paypal=cancelled`,
      },
    }),
  });
}

export async function getPayPalSubscription(subscriptionId: string) {
  if (!/^I-[A-Z0-9]+$/i.test(subscriptionId)) throw new Error("PAYPAL_SUBSCRIPTION_INVALID");
  return paypalRequest<PayPalSubscription>(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export async function cancelPayPalSubscription(subscriptionId: string, reason = "Cancelled by subscriber") {
  if (!/^I-[A-Z0-9]+$/i.test(subscriptionId)) throw new Error("PAYPAL_SUBSCRIPTION_INVALID");
  await paypalRequest<Record<string, never>>(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: reason.slice(0, 128) }),
  });
}

export function approvalUrl(subscription: PayPalSubscription) {
  const href = subscription.links?.find((link) => link.rel === "approve")?.href;
  if (!href) throw new Error("PAYPAL_APPROVAL_URL_MISSING");
  const parsed = new URL(href);
  if (parsed.protocol !== "https:" || !(parsed.hostname === "paypal.com" || parsed.hostname.endsWith(".paypal.com"))) {
    throw new Error("PAYPAL_APPROVAL_URL_INVALID");
  }
  return parsed.toString();
}

export function entitlementStatus(paypalStatus: string) {
  const status = String(paypalStatus || "").toUpperCase();
  if (status === "ACTIVE") return "active";
  if (["APPROVAL_PENDING", "APPROVED", "CREATED"].includes(status)) return "pending";
  if (status === "SUSPENDED") return "suspended";
  if (status === "CANCELLED") return "cancelled";
  if (status === "EXPIRED") return "expired";
  return "inactive";
}

export function webhookSubscriptionId(event: Record<string, unknown>) {
  const resource = event.resource && typeof event.resource === "object" ? event.resource as Record<string, unknown> : {};
  const direct = String(resource.id || "");
  if (/^I-[A-Z0-9]+$/i.test(direct)) return direct;
  const agreement = String(resource.billing_agreement_id || "");
  return /^I-[A-Z0-9]+$/i.test(agreement) ? agreement : "";
}

export async function verifyPayPalWebhook(request: Request, event: Record<string, unknown>) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_NOT_CONFIGURED");
  const requiredHeaders = {
    auth_algo: request.headers.get("paypal-auth-algo"),
    cert_url: request.headers.get("paypal-cert-url"),
    transmission_id: request.headers.get("paypal-transmission-id"),
    transmission_sig: request.headers.get("paypal-transmission-sig"),
    transmission_time: request.headers.get("paypal-transmission-time"),
  };
  if (Object.values(requiredHeaders).some((value) => !value)) return false;
  const result = await paypalRequest<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({ ...requiredHeaders, webhook_id: webhookId, webhook_event: event }),
  });
  return result.verification_status === "SUCCESS";
}
