function normalizedCountryCode(value: string | null | undefined) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : "";
}

export function countryCodeFromRequest(request: Request) {
  const edgeCountry = normalizedCountryCode(
    (request as Request & { cf?: { country?: string } }).cf?.country,
  );
  if (edgeCountry) return edgeCountry;
  // Cloudflare adds/overwrites this value at the edge. Do not accept generic
  // client-controlled country headers for regional pricing.
  return normalizedCountryCode(request.headers.get("cf-ipcountry"));
}

export function GET(request: Request) {
  const countryCode = countryCodeFromRequest(request);
  return Response.json(
    {
      countryCode: countryCode || null,
      source: countryCode ? "approximate-ip" : "unavailable",
    },
    {
      headers: {
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
