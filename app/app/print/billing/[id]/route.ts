import { getSession } from "@/lib/auth";
import { loadPrintData, renderForm, type PrintForm } from "@/lib/billing/print";

/**
 * Печатная форма расчётного документа как самостоятельная HTML-страница
 * (вне (app)-layout, свой print-CSS): ?form=invoice|act|breakdown.
 * Открывается кнопкой «Печать» из карточки документа; PDF — /api/billing/documents/[id]/pdf.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) {
    return Response.redirect(new URL("/login", req.url), 302);
  }
  const { id } = await params;
  const form = (new URL(req.url).searchParams.get("form") ?? "invoice") as PrintForm;
  if (!["invoice", "act", "breakdown"].includes(form)) {
    return new Response("form: invoice | act | breakdown", { status: 400 });
  }
  const data = await loadPrintData(id);
  if (!data) return new Response("not found", { status: 404 });

  return new Response(renderForm(data, form), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
