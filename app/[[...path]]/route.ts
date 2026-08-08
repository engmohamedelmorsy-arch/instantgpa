import { siteResponse } from "../site-html";

export function GET(request: Request) {
  return siteResponse(request);
}
