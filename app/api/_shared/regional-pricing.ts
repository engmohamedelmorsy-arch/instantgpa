export type PricingTier = "economic" | "standard" | "high";
export type BillingPeriod = "monthly" | "annual";

export type RegionalPrice = {
  tier: PricingTier;
  billingPeriod: BillingPeriod;
  price: number;
  currency: "USD";
  interval: "month" | "year";
  intervalCount: 1;
};

const ECONOMIC_COUNTRIES = new Set(`
  AO BJ BT BO BF BI KH CM TD KM CG CD CI DJ EG ER ET GM GN GW HN IN KE KI KG
  LA LS MG MW ML MR MA MZ NA NP NI NE NG PG RW ST SN SL SB SO SZ TJ TZ TG TN
  UG VU VE YE ZM ZW
`.trim().split(/\s+/));

const STANDARD_COUNTRIES = new Set(`
  AL DZ AR AM AZ BY BZ BA BW BR CV CN CO DM DO EC SV FJ GA GE GD GT ID JM JO KZ
  MY MV MH MU MX FM MD MN ME MK PY PE PH WS RS ZA LK LC VC SR TH TO TM TV UA VN
  YT SH WF
`.trim().split(/\s+/));

// PayPal does not currently expose a normal country checkout for these
// economies, or current service restrictions make a paid subscription unsafe
// to promise. Free tools remain available.
const PAYPAL_UNAVAILABLE_COUNTRIES = new Set(`
  AF BD CF CU GQ GH HT IR IQ XK LB LR LY MM KP PK RU SS SD SY TL TR UZ PS
`.trim().split(/\s+/));

export const REGIONAL_PRICE_BOOK: Record<PricingTier, Record<BillingPeriod, RegionalPrice>> = {
  economic: {
    monthly: { tier: "economic", billingPeriod: "monthly", price: 2.99, currency: "USD", interval: "month", intervalCount: 1 },
    annual: { tier: "economic", billingPeriod: "annual", price: 25, currency: "USD", interval: "year", intervalCount: 1 },
  },
  standard: {
    monthly: { tier: "standard", billingPeriod: "monthly", price: 4.99, currency: "USD", interval: "month", intervalCount: 1 },
    annual: { tier: "standard", billingPeriod: "annual", price: 50, currency: "USD", interval: "year", intervalCount: 1 },
  },
  high: {
    monthly: { tier: "high", billingPeriod: "monthly", price: 7.99, currency: "USD", interval: "month", intervalCount: 1 },
    annual: { tier: "high", billingPeriod: "annual", price: 75, currency: "USD", interval: "year", intervalCount: 1 },
  },
};

export function normalizeBillingPeriod(value: unknown): BillingPeriod {
  return String(value || "").toLowerCase() === "annual" ? "annual" : "monthly";
}

export function normalizePricingCountry(value: unknown) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : "";
}

export function pricingTierForCountry(value: unknown): PricingTier | null {
  const countryCode = normalizePricingCountry(value);
  if (PAYPAL_UNAVAILABLE_COUNTRIES.has(countryCode)) return null;
  if (ECONOMIC_COUNTRIES.has(countryCode)) return "economic";
  if (STANDARD_COUNTRIES.has(countryCode)) return "standard";
  // A missing edge country receives the middle price. Any other country code
  // follows the approved high-income/default tier and PayPal still performs
  // its own account-country eligibility check during approval.
  return countryCode ? "high" : "standard";
}

export function regionalPriceForCountry(countryCode: unknown, billingPeriod: unknown) {
  const tier = pricingTierForCountry(countryCode);
  if (!tier) return null;
  return REGIONAL_PRICE_BOOK[tier][normalizeBillingPeriod(billingPeriod)];
}

export function paypalPlanEnvironmentKey(tier: PricingTier, billingPeriod: BillingPeriod) {
  return `PAYPAL_PLAN_${tier.toUpperCase()}_${billingPeriod.toUpperCase()}`;
}
