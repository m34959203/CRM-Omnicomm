import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { money } from "@/lib/billing/amount-words";
import { kindBadge, statusBadge, type DocKind } from "../../badges";
import { DocActions } from "./doc-actions";

type Doc = {
  id: string;
  number: string | null;
  kind: DocKind;
  scheme: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  subtotal: string;
  extra_charge: string;
  discount_amount: string;
  prepaid_amount: string;
  vat_rate: string | null;
  vat_amount: string;
  total: string;
  paid_amount: string;
  issued_at: string | null;
  sent_at: string | null;
  created_at: string;
  client_id: string;
  client_name: string;
  manager_name: string | null;
};

type Accrual = {
  id: string;
  object_name: string | null;
  equipment_serial: string | null;
  method: "activity" | "subscription" | "one_time";
  date_from: string;
  date_to: string;
  days: number | null;
  amount: string;
  status: string;
  note: string | null;
};

export default async function BillingDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const b = d.billing;
  const { id } = await params;
  const canManage = ["admin", "accounting", "head"].includes(user.role);

  const [doc] = await query<Doc>(
    `SELECT d.id, d.number, d.kind, d.scheme, d.status,
            d.period_start::text, d.period_end::text,
            d.subtotal::text, d.extra_charge::text, d.discount_amount::text,
            d.prepaid_amount::text, d.vat_rate::text, d.vat_amount::text,
            d.total::text, d.paid_amount::text,
            d.issued_at::text, d.sent_at::text, d.created_at::text,
            d.client_id, c.name AS client_name, u.full_name AS manager_name
     FROM billing_documents d
     JOIN clients c ON c.id = d.client_id
     LEFT JOIN users u ON u.id = d.manager_id
     WHERE d.id = $1::uuid`,
    [id]
  );
  if (!doc) notFound();

  const accruals = await query<Accrual>(
    `SELECT a.id, o.name AS object_name, e.serial_number AS equipment_serial,
            a.method, a.date_from::text, a.date_to::text, a.days, a.amount::text,
            a.status, a.note
     FROM accruals a
     LEFT JOIN monitoring_objects o ON o.id = a.object_id
     LEFT JOIN equipment_items e ON e.id = a.equipment_id
     WHERE a.billing_document_id = $1::uuid
     ORDER BY o.name NULLS LAST, a.date_from`,
    [id]
  );

  const METHOD_LABEL: Record<Accrual["method"], string> = {
    activity: b.methodActivity,
    subscription: b.methodSubscription,
    one_time: b.methodOneTime,
  };

  const fmt = (s: string | null) =>
    s ? new Date(s).toLocaleDateString("ru-RU") : "—";

  const stat = (label: string, value: React.ReactNode) => (
    <div>
      <div className="text-xs uppercase tracking-wider text-ink-dim">{label}</div>
      <div className="mt-0.5 font-mono text-[15px]">{value}</div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/billing/documents" className="text-sm text-ink-dim hover:text-accent-ink">
            ← {b.documents}
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            {doc.number ?? doc.id.slice(0, 8)}
            {kindBadge(doc.kind, b)}
            {statusBadge(doc.status, b)}
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            {b.client}: <span className="font-medium text-ink">{doc.client_name}</span>
            {" · "}
            {b.periodCol}: {fmt(doc.period_start)} — {fmt(doc.period_end)}
            {doc.issued_at ? ` · ${b.statusIssued}: ${fmt(doc.issued_at)}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-line bg-card p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
              {stat(b.subtotal, `${money(Number(doc.subtotal))} ₸`)}
              {stat(b.discount, `${money(Number(doc.discount_amount))} ₸`)}
              {stat(b.prepaid, `${money(Number(doc.prepaid_amount))} ₸`)}
              {stat(
                `${b.vatAmount}${doc.vat_rate ? ` ${Number(doc.vat_rate)}%` : ""}`,
                `${money(Number(doc.vat_amount))} ₸`
              )}
              {stat(b.total, <b>{money(Number(doc.total))} ₸</b>)}
              {stat(b.paid, `${money(Number(doc.paid_amount))} ₸`)}
              {stat(
                b.debt,
                `${money(Math.max(0, Number(doc.total) - Number(doc.paid_amount)))} ₸`
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">{b.breakdown}</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                    <th className="px-4 py-3 font-medium">{b.object}</th>
                    <th className="px-4 py-3 font-medium">{d.equipment.serial}</th>
                    <th className="px-4 py-3 font-medium">{b.method}</th>
                    <th className="px-4 py-3 font-medium">{b.periodCol}</th>
                    <th className="px-4 py-3 font-medium">{b.days}</th>
                    <th className="px-4 py-3 font-medium">{b.amount}</th>
                  </tr>
                </thead>
                <tbody>
                  {accruals.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-ink-dim">
                        {d.common.empty}
                      </td>
                    </tr>
                  )}
                  {accruals.map((a) => (
                    <tr
                      key={a.id}
                      className={`border-b border-line last:border-0 ${a.status === "cancelled" ? "opacity-50 line-through" : ""}`}
                    >
                      <td className="px-4 py-2.5 font-medium">
                        {a.object_name ?? "—"}
                        {a.note && (
                          <div className="text-[11px] font-normal text-ink-dim no-underline">
                            {a.note}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[13px]">
                        {a.equipment_serial ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[13px]">{METHOD_LABEL[a.method]}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-[13px]">
                        {fmt(a.date_from)} — {fmt(a.date_to)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[13px]">{a.days ?? "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-[13px]">
                        {money(Number(a.amount))} ₸
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <DocActions
          d={d}
          doc={{
            id: doc.id,
            client_id: doc.client_id,
            status: doc.status,
            kind: doc.kind,
            total: Number(doc.total),
            paid: Number(doc.paid_amount),
          }}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
