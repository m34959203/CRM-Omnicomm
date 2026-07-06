import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { settlementSheet } from "@/lib/billing/engine";
import { money } from "@/lib/billing/amount-words";
import { BillingTabs } from "../tabs";
import { PaymentForm } from "./settlements-client";

type PaymentRow = {
  id: string;
  amount: string;
  paid_at: string;
  method: string | null;
  bank_reference: string | null;
  client_name: string;
  document_number: string | null;
  created_by_name: string | null;
};

export default async function SettlementsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const b = d.billing;
  const canManage = ["admin", "accounting", "head"].includes(user.role);

  const [sheet, payments, clients, openDocs] = await Promise.all([
    settlementSheet(query),
    query<PaymentRow>(
      `SELECT p.id, p.amount::text, p.paid_at::text, p.method, p.bank_reference,
              c.name AS client_name, d.number AS document_number, u.full_name AS created_by_name
       FROM payments p
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN billing_documents d ON d.id = p.billing_document_id
       LEFT JOIN users u ON u.id = p.created_by
       ORDER BY p.paid_at DESC
       LIMIT 200`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name LIMIT 500`
    ),
    query<{ id: string; number: string | null; client_id: string; total: string; paid_amount: string }>(
      `SELECT id, number, client_id, total::text, paid_amount::text
       FROM billing_documents
       WHERE status NOT IN ('cancelled', 'paid')
       ORDER BY created_at DESC
       LIMIT 500`
    ),
  ]);

  const METHOD_LABEL: Record<string, string> = {
    bank: b.payBank,
    cash: b.payCash,
    card: b.payCard,
    offset: b.payOffset,
  };

  const th = "px-4 py-3 font-medium";
  const td = "px-4 py-2.5";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{b.title}</h1>
        <a
          href="/api/billing/settlements/export"
          className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
        >
          {d.common.exportExcel}
        </a>
      </div>
      <BillingTabs d={d} active="settlements" />

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section>
            <h2 className="text-lg font-semibold">{b.settlements}</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                    <th className={th}>{b.client}</th>
                    <th className={th}>{b.billed}</th>
                    <th className={th}>{b.paid}</th>
                    <th className={th}>{b.debt}</th>
                    <th className={th}>{b.oldestDue}</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-ink-dim">
                        {d.common.empty}
                      </td>
                    </tr>
                  )}
                  {sheet.map((s) => (
                    <tr key={s.client_id} className="border-b border-line last:border-0">
                      <td className={`${td} font-medium`}>{s.client_name}</td>
                      <td className={`${td} font-mono text-[13px]`}>{money(s.billed)} ₸</td>
                      <td className={`${td} font-mono text-[13px]`}>{money(s.paid)} ₸</td>
                      <td className={`${td} font-mono text-[13px]`}>
                        {s.debt > 0 ? (
                          <span className="font-semibold text-danger">{money(s.debt)} ₸</span>
                        ) : s.debt < 0 ? (
                          <span className="text-ok">
                            {b.overpay}: {money(-s.debt)} ₸
                          </span>
                        ) : (
                          "0,00 ₸"
                        )}
                      </td>
                      <td className={`${td} text-[13px]`}>
                        {s.debt > 0 && s.oldest_unpaid_due
                          ? new Date(s.oldest_unpaid_due).toLocaleDateString("ru-RU")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">{b.paymentsJournal}</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                    <th className={th}>{b.paymentDate}</th>
                    <th className={th}>{b.client}</th>
                    <th className={th}>{b.paymentAmount}</th>
                    <th className={th}>{b.paymentMethod}</th>
                    <th className={th}>{b.docNumber}</th>
                    <th className={th}>{d.telematics.performedBy}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-ink-dim">
                        {d.common.empty}
                      </td>
                    </tr>
                  )}
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className={`${td} whitespace-nowrap text-[13px]`}>
                        {new Date(p.paid_at).toLocaleDateString("ru-RU")}
                      </td>
                      <td className={`${td} font-medium`}>{p.client_name}</td>
                      <td className={`${td} font-mono text-[13px]`}>
                        {money(Number(p.amount))} ₸
                      </td>
                      <td className={`${td} text-[13px]`}>
                        {p.method ? (METHOD_LABEL[p.method] ?? p.method) : "—"}
                        {p.bank_reference ? ` · №${p.bank_reference}` : ""}
                      </td>
                      <td className={`${td} font-mono text-[13px]`}>
                        {p.document_number ?? "—"}
                      </td>
                      <td className={td}>{p.created_by_name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {canManage && <PaymentForm d={d} clients={clients} docs={openDocs} />}
      </div>
    </div>
  );
}
