import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const argumentsList = new Set(process.argv.slice(2));
const environmentFlag = process.argv.indexOf("--environment");
const environment = environmentFlag >= 0
  ? String(process.argv[environmentFlag + 1] || "").toLowerCase()
  : String(process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const dryRun = argumentsList.has("--dry-run");

if (!["sandbox", "live"].includes(environment)) {
  throw new Error("Use --environment sandbox or --environment live.");
}
if (environment === "live" && !argumentsList.has("--confirm-live")) {
  throw new Error("Live setup requires --confirm-live. Run and verify Sandbox first.");
}

const priceBook = [
  { key: "PAYPAL_PLAN_ECONOMIC_MONTHLY", tier: "Economic", period: "Monthly", price: "2.99", interval: "MONTH" },
  { key: "PAYPAL_PLAN_ECONOMIC_ANNUAL", tier: "Economic", period: "Annual", price: "25.00", interval: "YEAR" },
  { key: "PAYPAL_PLAN_STANDARD_MONTHLY", tier: "Standard", period: "Monthly", price: "4.99", interval: "MONTH" },
  { key: "PAYPAL_PLAN_STANDARD_ANNUAL", tier: "Standard", period: "Annual", price: "50.00", interval: "YEAR" },
  { key: "PAYPAL_PLAN_HIGH_MONTHLY", tier: "High", period: "Monthly", price: "7.99", interval: "MONTH" },
  { key: "PAYPAL_PLAN_HIGH_ANNUAL", tier: "High", period: "Annual", price: "75.00", interval: "YEAR" },
].map((plan) => ({
  ...plan,
  name: `InstantGPA Premium ${plan.tier} ${plan.period} USD ${plan.price}`,
}));

if (dryRun) {
  console.log(JSON.stringify({ environment, plans: priceBook }, null, 2));
  process.exit(0);
}

const clientId = String(process.env.PAYPAL_CLIENT_ID || "").trim();
const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || "").trim();
if (!clientId || !clientSecret) {
  throw new Error(
    "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be present only in this terminal session. They are never saved by this script.",
  );
}

const baseUrl = environment === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

async function responseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
  method: "POST",
  headers: {
    authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  },
  body: "grant_type=client_credentials",
});
const tokenBody = await responseBody(tokenResponse);
if (!tokenResponse.ok || !tokenBody.access_token) {
  throw new Error(`PayPal authentication failed (${tokenResponse.status}): ${tokenBody.message || "check the Sandbox credentials"}`);
}
const accessToken = tokenBody.access_token;

async function paypal(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json", prefer: "return=representation" } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await responseBody(response);
  if (!response.ok) {
    const detail = body.details?.[0]?.description || body.message || "PayPal request failed";
    throw new Error(`${init.method || "GET"} ${path} failed (${response.status}): ${detail}`);
  }
  return body;
}

async function getOrCreateProduct() {
  const collection = await paypal("/v1/catalogs/products?page_size=20&page=1&total_required=true");
  const existing = collection.products?.find((product) => product.name === "InstantGPA Premium");
  if (existing?.id) return existing;
  return paypal("/v1/catalogs/products", {
    method: "POST",
    headers: { "PayPal-Request-Id": randomUUID() },
    body: JSON.stringify({
      name: "InstantGPA Premium",
      description: "Transcript review, GPA analysis, conversions, retake planning, and academic decision tools.",
      type: "SERVICE",
      category: "SOFTWARE",
      home_url: "https://instantgpa.com",
    }),
  });
}

function planPayload(productId, plan) {
  return {
    product_id: productId,
    name: plan.name,
    description: `InstantGPA Premium ${plan.period.toLowerCase()} subscription for the ${plan.tier.toLowerCase()} regional price tier.`,
    status: "ACTIVE",
    billing_cycles: [{
      frequency: { interval_unit: plan.interval, interval_count: 1 },
      tenure_type: "REGULAR",
      sequence: 1,
      total_cycles: 0,
      pricing_scheme: { fixed_price: { value: plan.price, currency_code: "USD" } },
    }],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: "0.00", currency_code: "USD" },
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3,
    },
  };
}

function planMatches(details, expected) {
  const regular = details.billing_cycles?.find((cycle) => cycle.tenure_type === "REGULAR");
  return details.status === "ACTIVE"
    && regular?.frequency?.interval_unit === expected.interval
    && Number(regular?.frequency?.interval_count) === 1
    && regular?.pricing_scheme?.fixed_price?.currency_code === "USD"
    && Number(regular?.pricing_scheme?.fixed_price?.value) === Number(expected.price);
}

async function getOrCreatePlans(productId) {
  const collection = await paypal(`/v1/billing/plans?product_id=${encodeURIComponent(productId)}&page_size=20&page=1&total_required=true`);
  const results = {};
  for (const definition of priceBook) {
    const candidate = collection.plans?.find((plan) => plan.name === definition.name);
    if (candidate?.id) {
      const details = await paypal(`/v1/billing/plans/${encodeURIComponent(candidate.id)}`);
      if (!planMatches(details, definition)) {
        throw new Error(`Existing plan ${candidate.id} has the expected name but different pricing. Rename or deactivate it before retrying.`);
      }
      results[definition.key] = candidate.id;
      continue;
    }
    const created = await paypal("/v1/billing/plans", {
      method: "POST",
      headers: { "PayPal-Request-Id": randomUUID() },
      body: JSON.stringify(planPayload(productId, definition)),
    });
    if (!created.id || !planMatches(created, definition)) {
      throw new Error(`PayPal created an invalid ${definition.tier} ${definition.period} plan.`);
    }
    results[definition.key] = created.id;
  }
  return results;
}

const product = await getOrCreateProduct();
const plans = await getOrCreatePlans(product.id);
const output = {
  environment,
  createdAt: new Date().toISOString(),
  productId: product.id,
  plans,
};
const outputDirectory = resolve("outputs");
const outputPath = resolve(outputDirectory, `paypal-${environment}-plans.json`);
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

console.log(`PayPal ${environment} product and plans are ready.`);
console.log(`Non-secret plan IDs were saved to: ${outputPath}`);
console.log("Add these six values to Cloudflare Variables and Secrets:");
for (const [key, value] of Object.entries(plans)) console.log(`${key}=${value}`);
