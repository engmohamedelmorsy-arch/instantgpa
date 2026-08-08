import { errorResponse, json, requireActiveSubscriber } from "../../_shared/admin-data";
import { POLICY_CATALOG, POLICY_DATA_SOURCES } from "../../_shared/policy-catalog";

const normalize = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();

export async function GET(request: Request) {
  try {
    const user = await requireActiveSubscriber(request);
    const url = new URL(request.url);
    const query = normalize(url.searchParams.get("q") || "").slice(0, 120);
    const region = normalize(url.searchParams.get("region") || "").slice(0, 40);
    const entries = POLICY_CATALOG.filter((entry) => {
      if (region && normalize(entry.region) !== region) return false;
      if (!query) return true;
      const searchable = normalize([
        entry.institution,
        entry.country,
        entry.region,
        entry.scale,
        entry.scope,
        ...entry.rules.map((rule) => `${rule.type} ${rule.summary}`),
      ].join(" "));
      return searchable.includes(query);
    });
    return json({
      entries,
      sources: POLICY_DATA_SOURCES,
      reviewedAt: "2026-08-08",
      coverage: {
        totalInstitutions: POLICY_CATALOG.length,
        regions: [...new Set(POLICY_CATALOG.map((entry) => entry.region))],
        message: "Curated official-source registry. Degree and course equivalency decisions remain institutional.",
      },
      entitlement: { plan: user.entitlement.plan, status: user.entitlement.status },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
