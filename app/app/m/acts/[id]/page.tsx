import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { mActBadge } from "../../badges";
import { fmtDateTime } from "../../fmt";
import { ActSheet } from "./act-sheet";

/**
 * Акт ТО в PWA техника — единый прокручиваемый лист (референс ascan_T2).
 * Техник редактирует СВОЙ акт in_preparation; офисные роли — любой открытый.
 */

type ActRow = {
  id: string;
  number: string | null;
  status: string;
  work_order_id: string;
  wo_number: string;
  client_id: string | null;
  client_name: string | null;
  object_id: string | null;
  object_name: string | null;
  performed_by: string | null;
  client_signer_name: string | null;
  signed_by_client_at: string | null;
  created_at: string;
};

export default async function MobileActPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login?next=/m");
  const d = t(user.locale);
  const m = d.mobile;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [act] = await query<ActRow>(
    `SELECT a.id, a.number, a.status, a.work_order_id, w.number AS wo_number,
            w.client_id, c.name AS client_name, w.object_id, o.name AS object_name,
            a.performed_by, a.client_signer_name, a.signed_by_client_at, a.created_at
     FROM maintenance_acts a
     JOIN work_orders w ON w.id = a.work_order_id
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN monitoring_objects o ON o.id = w.object_id
     WHERE a.id = $1::uuid`,
    [id]
  );
  if (!act) notFound();

  const editable =
    act.status === "in_preparation" &&
    (user.role === "installer"
      ? act.performed_by === user.userId
      : ["admin", "manager", "support", "head"].includes(user.role));

  const [lines, works, materials, simOps, attachments] = await Promise.all([
    query<{
      id: string; action: string; basis: string | null;
      installed_label: string | null; removed_label: string | null;
    }>(
      `SELECT l.id, l.action, l.basis,
              ni.name || COALESCE(' · SN ' || ei.serial_number, '') AS installed_label,
              nr.name || COALESCE(' · SN ' || er.serial_number, '') AS removed_label
       FROM maintenance_act_lines l
       LEFT JOIN equipment_items ei ON ei.id = l.installed_equipment_id
       LEFT JOIN nomenclature ni ON ni.id = ei.nomenclature_id
       LEFT JOIN equipment_items er ON er.id = l.removed_equipment_id
       LEFT JOIN nomenclature nr ON nr.id = er.nomenclature_id
       WHERE l.act_id = $1::uuid ORDER BY l.created_at`,
      [id]
    ),
    query<{ id: string; work_name: string; quantity: string }>(
      `SELECT aw.id, wt.name AS work_name, aw.quantity
       FROM act_works aw JOIN work_types wt ON wt.id = aw.work_type_id
       WHERE aw.act_id = $1::uuid ORDER BY aw.created_at`,
      [id]
    ),
    query<{ id: string; name: string; unit: string; quantity: string; by_norm: boolean }>(
      `SELECT mt.id, n.name, n.unit, mt.quantity, mt.by_norm
       FROM act_materials mt JOIN nomenclature n ON n.id = mt.nomenclature_id
       WHERE mt.act_id = $1::uuid ORDER BY mt.by_norm DESC, n.name`,
      [id]
    ),
    query<{ id: string; icc: string; msisdn: string | null; op: string; eq_label: string | null }>(
      `SELECT so.id, sc.icc, sc.msisdn, so.op,
              n.name || COALESCE(' · SN ' || e.serial_number, '') AS eq_label
       FROM act_sim_ops so
       JOIN sim_cards sc ON sc.id = so.sim_id
       LEFT JOIN equipment_items e ON e.id = so.equipment_id
       LEFT JOIN nomenclature n ON n.id = e.nomenclature_id
       WHERE so.act_id = $1::uuid ORDER BY so.created_at`,
      [id]
    ),
    query<{ id: string; kind: string; filename: string | null }>(
      `SELECT id, kind, filename FROM attachments
       WHERE entity_type = 'maintenance_act' AND entity_id = $1::uuid
       ORDER BY created_at DESC`,
      [id]
    ),
  ]);

  // справочники под ТЕХНИКА: мой склад, установленное у клиента, мои SIM
  const [myUnits, clientUnits, workTypes, materialNoms, mySims, clientSims] = editable
    ? await Promise.all([
        query<{ id: string; label: string }>(
          `SELECT e.id, n.name || COALESCE(' · SN ' || e.serial_number, '') AS label
           FROM equipment_items e JOIN nomenclature n ON n.id = e.nomenclature_id
           WHERE e.status = 'with_technician' AND e.holder_id = $1::uuid
           ORDER BY n.name LIMIT 200`,
          [user.userId]
        ),
        query<{ id: string; label: string }>(
          `SELECT e.id, n.name || COALESCE(' · SN ' || e.serial_number, '')
                  || COALESCE(' · ' || o.name, '') AS label
           FROM equipment_items e
           JOIN nomenclature n ON n.id = e.nomenclature_id
           LEFT JOIN monitoring_objects o ON o.id = e.object_id
           WHERE e.status IN ('installed', 'on_testing') AND e.client_id = $1::uuid
           ORDER BY n.name LIMIT 200`,
          [act.client_id]
        ),
        query<{ id: string; name: string }>(
          `SELECT id, name FROM work_types WHERE is_active ORDER BY name`
        ),
        query<{ id: string; name: string; unit: string }>(
          `SELECT id, name, unit FROM nomenclature WHERE kind = 'material' AND is_active ORDER BY name`
        ),
        query<{ id: string; label: string }>(
          `SELECT s.id, s.icc || COALESCE(' · ' || s.msisdn, '') AS label
           FROM sim_cards s
           LEFT JOIN warehouses w ON w.id = s.warehouse_id
           WHERE s.status IN ('in_stock', 'assigned')
             AND (s.holder_id = $1::uuid OR (w.type = 'technician' AND w.holder_id = $1::uuid))
           ORDER BY s.icc LIMIT 200`,
          [user.userId]
        ),
        query<{ id: string; label: string }>(
          `SELECT s.id, s.icc || COALESCE(' · ' || s.msisdn, '') AS label
           FROM sim_cards s
           JOIN equipment_items e ON e.id = s.equipment_id
           WHERE e.client_id = $1::uuid ORDER BY s.icc LIMIT 200`,
          [act.client_id]
        ),
      ])
    : [[], [], [], [], [], []];

  const photos = attachments.filter((a) => a.kind === "photo");
  const signature = attachments.find((a) => a.kind === "signature") ?? null;

  return (
    <div>
      <Link
        href={`/m/orders/${act.work_order_id}`}
        className="text-sm text-chrome-dim active:text-accent"
      >
        ← {m.order.title} {act.wo_number}
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-white">
          {m.act.title}
          {act.number && <span className="ml-2 font-mono text-accent">{act.number}</span>}
        </h1>
        {mActBadge(act.status, d.service)}
      </div>
      <p className="mt-1 text-sm text-chrome-dim">
        {act.client_name ?? "—"}
        {act.object_name ? ` · ${act.object_name}` : ""}
        {" · "}
        <span className="font-mono">{fmtDateTime(act.created_at)}</span>
      </p>

      <ActSheet
        actId={act.id}
        editable={editable}
        signerName={act.client_signer_name}
        signedAt={act.signed_by_client_at ? fmtDateTime(act.signed_by_client_at) : null}
        lines={lines}
        works={works}
        materials={materials}
        simOps={simOps}
        photos={photos}
        signaturePhotoId={signature?.id ?? null}
        options={{ myUnits, clientUnits, workTypes, materialNoms, mySims, clientSims }}
        m={m.act}
        s={d.service}
        del={d.common.delete}
      />
    </div>
  );
}
