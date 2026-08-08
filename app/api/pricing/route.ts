import { countryCodeFromRequest } from "../location/route";
import { getPayPalPricingForCountry, paypalEnvironment, sandboxCheckoutAllowedForOrigin } from "../_shared/paypal";
import { pricingTierForCountry } from "../_shared/regional-pricing";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      // Country-specific, so this must never be cached by a shared/CDN cache.
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}

// Returns pricing for the caller's own country only, derived server-side from
// edge geolocation headers. There is no country parameter this endpoint will
// accept from the client — a visitor can never request another country's price.
export async function GET(request: Request) {
  try {
    const countryCode = countryCodeFromRequest(request) || "XX";
    if (!pricingTierForCountry(countryCode)) {
      return json({
        countryCode,
        configured: false,
        paymentAvailable: false,
        error: "PayPal subscriptions are not currently available in this country. Free tools remain available.",
      }, 409);
    }
    try {
      const pricing = await getPayPalPricingForCountry(countryCode);
      return json({
        countryCode,
        configured: true,
        paymentAvailable: sandboxCheckoutAllowedForOrigin(new URL(request.url).origin),
        paymentMode: paypalEnvironment(),
        tier: pricing.tier,
        paymentProvider: "paypal",
        plan: "InstantGPA Premium",
        monthly: {
          price: pricing.monthly.price,
          currency: pricing.monthly.currency,
          interval: pricing.monthly.interval,
          intervalCount: pricing.monthly.intervalCount,
        },
        annual: {
          price: pricing.annual.price,
          currency: pricing.annual.currency,
          interval: pricing.annual.interval,
          intervalCount: pricing.annual.intervalCount,
        },
      });
    } catch {
      return json({ countryCode, configured: false, error: "PayPal pricing is temporarily unavailable." }, 503);
    }
  } catch {
    return json({ error: "Pricing is temporarily unavailable.", code: "PRICING_ERROR" }, 502);
  }
}
