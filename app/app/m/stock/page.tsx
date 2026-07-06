import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";

/** Мой склад: оборудование у техника (holder_id = я, with_technician) + мои SIM. */

type Eq = { id: string; name: string; serial_number: string | null; imei: string | null; condition: string };
type Sim = { id: string; icc: string; msisdn: string | null; operator: string | null; status: string };

export default async function MobileStockPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login?next=/m");
  const d = t(user.locale);
  const m = d.mobile;
  const simFirst = (await searchParams).tab === "sim";

  const [equipment, sims] = await Promise.all([
    query<Eq>(
      `SELECT e.id, n.name, e.serial_number, e.imei, e.condition
       FROM equipment_items e JOIN nomenclature n ON n.id = e.nomenclature_id
       WHERE e.status = 'with_technician' AND e.holder_id = $1::uuid
       ORDER BY n.name, e.serial_number`,
      [user.userId]
    ),
    query<Sim>(
      `SELECT s.id, s.icc, s.msisdn, op.name AS operator, s.status
       FROM sim_cards s
       LEFT JOIN sim_operators op ON op.id = s.operator_id
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       WHERE s.status IN ('in_stock', 'assigned')
         AND (s.holder_id = $1::uuid OR (w.type = 'technician' AND w.holder_id = $1::uuid))
       ORDER BY s.icc`,
      [user.userId]
    ),
  ]);

  const sectionHead = (label: string, count: number) => (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">{label}</span>
      <span className="rounded bg-chrome-raised px-1.5 py-0.5 font-mono text-[11px] font-semibold text-chrome-text">
        {count}
      </span>
      <span className="h-px flex-1 bg-chrome-line" aria-hidden />
    </div>
  );

  const equipmentSection = (
    <section>
      {sectionHead(m.stock.equipment, equipment.length)}
      <div className="mt-3 space-y-2">
        {equipment.length === 0 && (
          <p className="rounded-xl border border-dashed border-chrome-line px-4 py-6 text-center text-sm text-chrome-dim">
            {m.stock.empty}
          </p>
        )}
        {equipment.map((e) => (
          <div key={e.id} className="rounded-xl border border-chrome-line bg-chrome-raised px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-white">{e.name}</span>
              {e.condition === "used" && (
                <span className="rounded bg-warn/20 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">
                  БУ
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-xs text-chrome-dim">
              {e.serial_number && <span>SN {e.serial_number}</span>}
              {e.imei && <span>{e.serial_number ? " · " : ""}IMEI {e.imei}</span>}
              {!e.serial_number && !e.imei && "—"}
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const simSection = (
    <section>
      {sectionHead(m.stock.sim, sims.length)}
      <div className="mt-3 space-y-2">
        {sims.length === 0 && (
          <p className="rounded-xl border border-dashed border-chrome-line px-4 py-6 text-center text-sm text-chrome-dim">
            {m.stock.empty}
          </p>
        )}
        {sims.map((s) => (
          <div key={s.id} className="rounded-xl border border-chrome-line bg-chrome-raised px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm text-white">{s.icc}</span>
              {s.operator && <span className="text-xs text-chrome-dim">{s.operator}</span>}
            </div>
            {s.msisdn && <div className="mt-1 font-mono text-xs text-chrome-dim">{s.msisdn}</div>}
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">{m.myStock}</h1>
      <div className="mt-4 space-y-6">
        {simFirst ? (
          <>
            {simSection}
            {equipmentSection}
          </>
        ) : (
          <>
            {equipmentSection}
            {simSection}
          </>
        )}
      </div>
    </div>
  );
}
