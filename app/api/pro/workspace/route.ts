import {
  assertSameOrigin,
  errorResponse,
  json,
  requireActiveSubscriber,
} from "../../_shared/admin-data";

const movedResponse = () => json({
  error: "Premium workspace storage has moved to the user's private Firebase record.",
  code: "WORKSPACE_MOVED_TO_FIREBASE",
}, 410);

export async function GET(request: Request) {
  try {
    await requireActiveSubscriber(request);
    return movedResponse();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await requireActiveSubscriber(request);
    return movedResponse();
  } catch (error) {
    return errorResponse(error);
  }
}
