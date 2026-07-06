import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { kindBadge, statusBadge, type DocKind } from "../../billing/badges";
import { fmtMoney, fmtDate } from "../../payroll/badges";
import { ParkActions, type Option } from "./park-actions";

const MUTATE_ROLES = ["admin", "manager", "head"];

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  billing_scheme: "advance" | "credit";
  is_active: boolean;
  category_name: string | null;
  manager_name: string | null;
  tariff_plan_name: string | null;
};

type CounterpartyRow = {
  name: string;
  legal_form: string | null;
  bin_iin: string | null;
  kbe: string | null;
  is_vat_payer: boolean;
  legal_address: string | null;
  iik: string | null;
  bik: string | null;
  bank_name: string | null;
};

type ParkRow = {
  id: string;
  serial_number: string | null;
  imei: string | null;
  billing_state: string | null;
  nomenclature: string;
  object_id: string | null;
  object_name: string | null;
  reg_number: string | null;
  external_name: string | null;
  sync_status: string | null;
  data_reception_enabled: boolean | null;
  days_here: number;
};

type ContractRow = {
  id: string;
  number: string;
  kind: string;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
};

type DocRow = {
  id: string;
  number: string | null;
  kind: DocKind;
  period_start: string | null;
  period_end: string | null;
  total: string;
  paid_amount: string;
  status: string;
};

type RequestRow = {
  id: string;
  number: string;
  type: string;
  status: string;
  due_at: string | null;
};

function stateBadge(state: string | null, c: { stateActive: string; stateConservation: string; stateDisabled: string }) {
  if (!state) return <span className="rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim">—</span>;
  const cls: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    conservation: "bg-amber-100 text-amber-800",
    disabled: "bg-red-100 text-red-700",
  };
  const label: Record<string, string> = {
    active: c.stateActive,
    conservation: c.stateConservation,
    disabled: c.stateDisabled,
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls[state] ?? "bg-paper text-ink-dim"}`}>
      {label[state] ?? state}
    </span>
  );
}

export default async function ClientCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const c = d.clientCard;
  const { id } = await params;
  const canMutate = MUTATE_ROLES.includes(user.role);

  const [client] = await query<ClientRow>(
    `SELECT cl.id, cl.name, cl.phone, cl.email, cl.billing_scheme, cl.is_active,
            sc.name AS category_name, u.full_name AS manager_name, tp.name AS tariff_plan_name
     FROM clients cl
     LEFT JOIN service_categories sc ON sc.id = cl.category_id
     LEFT JOIN users u ON u.id = cl.manager_id
     LEFT JOIN tariff_plans tp ON tp.id = cl.tariff_plan_id
     WHERE cl.id = $1::uuid`,
    [id]
  );
  if (!client) notFound();

  const [[counterparty], park, contracts, docs, requests, objects, otherClients] =
    await Promise.all([
      query<CounterpartyRow>(
        `SELECT cp.name, cp.legal_form, cp.bin_iin, cp.kbe, cp.is_vat_payer, cp.legal_address,
                ba.iik, ba.bik, ba.bank_name
         FROM counterparties cp
         LEFT JOIN LATERAL (
           SELECT iik, bik, bank_name FROM counterparty_bank_accounts
           WHERE counterparty_id = cp.id ORDER BY is_primary DESC, created_at LIMIT 1
         ) ba ON true
         WHERE cp.client_id = $1::uuid ORDER BY cp.created_at LIMIT 1`,
        [id]
      ),
      query<ParkRow>(
        `SELECT e.id, e.serial_number, e.imei, e.billing_state, n.name AS nomenclature,
                o.id AS object_id, o.name AS object_name, o.reg_number,
                l.external_name, l.sync_status, l.data_reception_enabled,
                GREATEST(0, floor(extract(epoch FROM now() - COALESCE(m.last_move, e.created_at)) / 86400))::int AS days_here
         FROM equipment_items e
         JOIN nomenclature n ON n.id = e.nomenclature_id
         LEFT JOIN monitoring_objects o ON o.id = e.object_id
         LEFT JOIN LATERAL (
           SELECT external_name, sync_status, data_reception_enabled
           FROM telematics_object_links
           WHERE equipment_id = e.id AND sync_status <> 'deleted'
           ORDER BY created_at DESC LIMIT 1
         ) l ON true
         LEFT JOIN LATERAL (
           SELECT max(created_at) AS last_move FROM equipment_movements WHERE equipment_id = e.id
         ) m ON true
         WHERE e.client_id = $1::uuid AND e.status = 'installed'
         ORDER BY o.name NULLS LAST, n.name, e.serial_number`,
        [id]
      ),
      query<ContractRow>(
        `SELECT id, number, kind, status, valid_from::text, valid_to::text
         FROM contracts WHERE client_id = $1::uuid ORDER BY created_at DESC LIMIT 20`,
        [id]
      ),
      query<DocRow>(
        `SELECT id, number, kind, period_start::text, period_end::text,
                total::text, paid_amount::text, status
         FROM billing_documents WHERE client_id = $1::uuid
         ORDER BY created_at DESC LIMIT 5`,
        [id]
      ),
      query<RequestRow>(
        `SELECT id, number, type, status, due_at::text
         FROM requests
         WHERE client_id = $1::uuid AND status NOT IN ('closed','cancelled','completed')
         ORDER BY created_at DESC LIMIT 10`,
        [id]
      ),
      query<Option>(
        `SELECT id, name FROM monitoring_objects
         WHERE client_id = $1::uuid AND status = 'active' ORDER BY name`,
        [id]
      ),
      canMutate
        ? query<Option>(
            `SELECT id, name FROM clients
             WHERE id <> $1::uuid AND is_active ORDER BY name LIMIT 500`,
            [id]
          )
        : Promise.resolve([] as Option[]),
    ]);

  const reqLabels = d.service.requestStatuses as Record<string, string>;
  const typeLabels = d.service.requestTypes as Record<string, string>;

  const parkLabels = {
    setState: c.setState,
    stateActive: c.stateActive,
    stateConservation: c.stateConservation,
    stateDisabled: c.stateDisabled,
    transferClient: c.transferClient,
    moveObject: c.moveObject,
    targetClient: c.targetClient,
    targetObject: c.targetObject,
    apply: c.apply,
    confirmTransfer: c.confirmTransfer,
    confirmMove: c.confirmMove,
    cancel: d.common.cancel,
  };

  const box = "rounded-lg border border-line bg-card";
  const h2 = "text-sm font-semibold uppercase tracking-wider text-ink-dim";
  const th = "px-4 py-2.5 font-medium";
  const td = "px-4 py-2.5";

  return (
    <div>
      {/* шапка */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-ink-dim">
            <Link href="/clients" className="hover:text-accent-ink">
              {d.clients.title}
            </Link>{" "}
            /
          </div>
          <h1 className="mt-0.5 text-2xl font-semibold">
            {client.name}
            {!client.is_active && (
              <span className="ml-2 align-middle rounded bg-paper px-1.5 py-0.5 text-xs text-ink-dim">
                архив
              </span>
            )}
          </h1>
        </div>
        <Link
          href="/billing/settlements"
          className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
        >
          {c.settlements}
        </Link>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className={`${box} p-4`}>
          <h2 className={h2}>{c.requisites}</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-ink-dim">{c.scheme}</dt>
            <dd>{client.billing_scheme === "advance" ? c.schemeAdvance : c.schemeCredit}</dd>
            <dt className="text-ink-dim">{c.category}</dt>
            <dd>{client.category_name ?? "—"}</dd>
            <dt className="text-ink-dim">{c.manager}</dt>
            <dd>{client.manager_name ?? "—"}</dd>
            <dt className="text-ink-dim">{d.clients.phone}</dt>
            <dd className="font-mono text-[13px]">{client.phone ?? "—"}</dd>
            <dt className="text-ink-dim">{d.clients.email}</dt>
            <dd className="font-mono text-[13px]">{client.email ?? "—"}</dd>
            {client.tariff_plan_name && (
              <>
                <dt className="text-ink-dim">{d.billing.plans}</dt>
                <dd>{client.tariff_plan_name}</dd>
              </>
            )}
          </dl>
        </div>

        <div className={`${box} p-4`}>
          <h2 className={h2}>{c.counterparty}</h2>
          {counterparty ? (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-ink-dim">{d.clients.name}</dt>
              <dd>
                {counterparty.name}
                {counterparty.legal_form ? ` · ${counterparty.legal_form}` : ""}
              </dd>
              <dt className="text-ink-dim">{d.clients.binIin}</dt>
              <dd className="font-mono text-[13px]">{counterparty.bin_iin ?? "—"}</dd>
              <dt className="text-ink-dim">{d.clients.kbe}</dt>
              <dd className="font-mono text-[13px]">{counterparty.kbe ?? "—"}</dd>
              <dt className="text-ink-dim">{d.clients.iik}</dt>
              <dd className="font-mono text-[13px]">
                {counterparty.iik ?? "—"}
                {counterparty.bik ? ` · ${counterparty.bik}` : ""}
                {counterparty.bank_name ? ` · ${counterparty.bank_name}` : ""}
              </dd>
              <dt className="text-ink-dim">{d.clients.vatPayer}</dt>
              <dd>{counterparty.is_vat_payer ? "✓" : "—"}</dd>
              <dt className="text-ink-dim">{c.legalAddress}</dt>
              <dd>{counterparty.legal_address ?? "—"}</dd>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-ink-dim">{c.noCounterparty}</p>
          )}
        </div>
      </div>

      {/* парк клиента */}
      <div className="mt-4">
        <h2 className="text-lg font-semibold">{c.park}</h2>
        {canMutate && <p className="mt-1 text-xs text-ink-dim">{c.syncNote}</p>}
        <div className={`mt-3 overflow-x-auto ${box}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                <th className={th}>{c.object}</th>
                <th className={th}>{c.equipment}</th>
                <th className={th}>{d.equipment.serial}</th>
                <th className={th}>{c.state}</th>
                <th className={th}>{c.telematics}</th>
                <th className={`${th} text-right`}>{d.reports.daysHere}</th>
                {canMutate && <th className={th}>{d.common.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {park.length === 0 && (
                <tr>
                  <td colSpan={canMutate ? 7 : 6} className="px-4 py-10 text-center text-ink-dim">
                    {d.common.empty}
                  </td>
                </tr>
              )}
              {park.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-line last:border-0 align-top transition hover:bg-accent-soft/40"
                >
                  <td className={td}>
                    {e.object_name ?? "—"}
                    {e.reg_number && (
                      <span className="ml-1.5 font-mono text-[12px] text-ink-dim">
                        {e.reg_number}
                      </span>
                    )}
                  </td>
                  <td className={td}>{e.nomenclature}</td>
                  <td className={`${td} font-mono text-[13px]`}>
                    {e.serial_number ?? e.imei ?? "—"}
                  </td>
                  <td className={td}>{stateBadge(e.billing_state, c)}</td>
                  <td className={td}>
                    {e.sync_status ? (
                      <span className="text-[12px]">
                        {e.external_name ?? "—"}{" "}
                        <span
                          className={
                            e.data_reception_enabled
                              ? "rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-800"
                              : "rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
                          }
                        >
                          {c.reception}: {e.data_reception_enabled ? c.recOn : c.recOff}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[12px] text-ink-dim">{c.noLink}</span>
                    )}
                  </td>
                  <td className={`${td} text-right`}>{e.days_here}</td>
                  {canMutate && (
                    <td className={td}>
                      <ParkActions
                        equipmentId={e.id}
                        currentState={e.billing_state}
                        objectId={e.object_id}
                        objects={objects}
                        clients={otherClients}
                        labels={parkLabels}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* договоры */}
        <div className={box}>
          <div className="border-b border-line px-4 py-3">
            <h2 className={h2}>{c.contracts}</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                <th className={th}>{c.contractNumber}</th>
                <th className={th}>{c.kind}</th>
                <th className={th}>{c.validFrom}</th>
                <th className={th}>{c.validTo}</th>
                <th className={th}>{c.status}</th>
              </tr>
            </thead>
            <tbody>
              {contracts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-dim">
                    {d.common.empty}
                  </td>
                </tr>
              )}
              {contracts.map((x) => (
                <tr key={x.id} className="border-b border-line last:border-0">
                  <td className={`${td} font-mono text-[13px]`}>{x.number}</td>
                  <td className={td}>{x.kind}</td>
                  <td className={td}>{fmtDate(x.valid_from)}</td>
                  <td className={td}>{fmtDate(x.valid_to)}</td>
                  <td className={td}>
                    <span
                      className={
                        x.status === "active"
                          ? "rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-800"
                          : "rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim"
                      }
                    >
                      {x.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* последние документы биллинга */}
        <div className={box}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className={h2}>{c.recentDocs}</h2>
            <Link
              href="/billing/documents"
              className="text-xs font-medium text-accent-ink hover:underline"
            >
              {d.billing.documents} →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                <th className={th}>{d.billing.docNumber}</th>
                <th className={th}>{d.billing.periodCol}</th>
                <th className={`${th} text-right`}>{d.billing.total}</th>
                <th className={th}>{d.billing.status}</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-ink-dim">
                    {d.common.empty}
                  </td>
                </tr>
              )}
              {docs.map((x) => (
                <tr key={x.id} className="border-b border-line last:border-0 transition hover:bg-accent-soft/40">
                  <td className={`${td} font-mono text-[13px]`}>
                    <Link href={`/billing/documents/${x.id}`} className="hover:text-accent-ink">
                      {x.number ?? "—"}
                    </Link>{" "}
                    {kindBadge(x.kind, d.billing)}
                  </td>
                  <td className={td}>
                    {fmtDate(x.period_start)}–{fmtDate(x.period_end)}
                  </td>
                  <td className={`${td} text-right font-mono text-[13px]`}>{fmtMoney(x.total)}</td>
                  <td className={td}>{statusBadge(x.status, d.billing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* открытые заявки */}
      <div className={`mt-4 ${box}`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className={h2}>{c.openRequests}</h2>
          <Link
            href="/service/requests"
            className="text-xs font-medium text-accent-ink hover:underline"
          >
            {d.service.requestsTitle} →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className={th}>{d.service.number}</th>
              <th className={th}>{d.service.type}</th>
              <th className={th}>{d.service.status}</th>
              <th className={th}>{d.service.dueAt}</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {requests.map((x) => (
              <tr key={x.id} className="border-b border-line last:border-0 transition hover:bg-accent-soft/40">
                <td className={`${td} font-mono text-[13px]`}>
                  <Link href={`/service/requests/${x.id}`} className="hover:text-accent-ink">
                    {x.number}
                  </Link>
                </td>
                <td className={td}>{typeLabels[x.type] ?? x.type}</td>
                <td className={td}>{reqLabels[x.status] ?? x.status}</td>
                <td className={td}>{fmtDate(x.due_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
