import { requireRole, authErrorResponse } from "@/lib/auth";
import { loadPrintData, renderForm, type PrintForm } from "@/lib/billing/print";
import { htmlToPdf } from "@/lib/pdf";

const READ_ROLES = ["admin", "manager", "accounting", "head", "boss"] as const;

const FORM_NAMES: Record<PrintForm, string> = {
  invoice: "Счёт",
  act: "АВР",
  breakdown: "Расшифровка",
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole([...READ_ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const form = (new URL(req.url).searchParams.get("form") ?? "invoice") as PrintForm;
  if (!["invoice", "act", "breakdown"].includes(form)) {
    return Response.json({ error: "form: invoice | act | breakdown" }, { status: 400 });
  }
  const data = await loadPrintData(id);
  if (!data) return Response.json({ error: "not found" }, { status: 404 });

  const pdf = await htmlToPdf(renderForm(data, form));
  const filename = `${FORM_NAMES[form]}-${data.doc.number ?? id.slice(0, 8)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
