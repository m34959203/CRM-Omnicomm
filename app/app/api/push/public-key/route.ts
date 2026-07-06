import { requireUser, authErrorResponse } from "@/lib/auth";

/** VAPID public key для pushManager.subscribe в PWA техника. */
export async function GET() {
  try {
    await requireUser();
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  return Response.json({ key: process.env.VAPID_PUBLIC_KEY ?? null });
}
