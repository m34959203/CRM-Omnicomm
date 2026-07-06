import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { actStatusBadge, fmtAlmaty } from "../../badges";
import { AttachmentsGallery, type AttachmentItem } from "../../attachments-gallery";
import { ActEditor } from "./act-editor";

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
  request_id: string | null;
  request_number: string | null;
  photo_required: boolean | null;
  performer_name: string | null;
  closed_at: string | null;
  created_at: string;
};

export default async function ActCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const s = d.service;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [act] = await query<ActRow>(
    `SELECT a.id, a.number, a.status, a.work_order_id, w.number AS wo_number,
            w.client_id, c.name AS client_name, w.object_id, o.name AS object_name,
            w.request_id, r.number AS request_number, r.photo_required,
            u.full_name AS performer_name, a.closed_at, a.created_at
     FROM maintenance_acts a
     JOIN work_orders w ON w.id = a.work_order_id
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN monitoring_objects o ON o.id = w.object_id
     LEFT JOIN requests r ON r.id = w.request_id
     LEFT JOIN users u ON u.id = a.performed_by
     WHERE a.id = $1::uuid`,
    [id]
  );
  if (!act) notFound();

  const editable = act.status === "in_preparation";
  const canEdit = editable && ["admin", "manager", "support", "head"].includes(user.role);
  const canClose = editable && ["admin", "manager", "head"].includes(user.role);

  const [lines, works, materials, simOps, attachments] = await Promise.all([
    query<{
      id: string; action: string; basis: string | null;
      installed_label: string | null; removed_label: string | null; note: string | null;
    }>(
      `SELECT l.id, l.action, l.basis, l.note,
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
    query<{
      id: string; work_name: string; performer_name: string; quantity: string; rate: string; amount: string;
    }>(
      `SELECT aw.id, wt.name AS work_name, u.full_name AS performer_name,
              aw.quantity, aw.rate, aw.amount
       FROM act_works aw
       JOIN work_types wt ON wt.id = aw.work_type_id
       JOIN users u ON u.id = aw.performer_id
       WHERE aw.act_id = $1::uuid ORDER BY aw.created_at`,
      [id]
    ),
    query<{ id: string; name: string; unit: string; quantity: string; by_norm: boolean }>(
      `SELECT m.id, n.name, n.unit, m.quantity, m.by_norm
       FROM act_materials m JOIN nomenclature n ON n.id = m.nomenclature_id
       WHERE m.act_id = $1::uuid ORDER BY m.by_norm DESC, n.name`,
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
    query<AttachmentItem>(
      `SELECT id, kind, place, filename FROM attachments
       WHERE entity_type = 'maintenance_act' AND entity_id = $1::uuid ORDER BY created_at DESC`,
      [id]
    ),
  ]);

  // справочники для редактора — только пока акт редактируется
  const [installCandidates, removeCandidates, workTypes, performers, materialNoms, simsFree, simsAtClient] =
    canEdit
      ? await Promise.all([
          query<{ id: string; label: string }>(
            `SELECT e.id, n.name || COALESCE(' · SN ' || e.serial_number, '')
                    || CASE WHEN e.status = 'with_technician'
                            THEN ' · ' || COALESCE(u.full_name, 'техник')
                            ELSE COALESCE(' · ' || w.name, '') END AS label
             FROM equipment_items e
             JOIN nomenclature n ON n.id = e.nomenclature_id
             LEFT JOIN warehouses w ON w.id = e.warehouse_id
             LEFT JOIN users u ON u.id = e.holder_id
             WHERE e.status IN ('in_stock', 'with_technician', 'reserved')
             ORDER BY e.status DESC, n.name LIMIT 300`
          ),
          query<{ id: string; label: string }>(
            `SELECT e.id, n.name || COALESCE(' · SN ' || e.serial_number, '')
                    || COALESCE(' · ' || o.name, '') AS label
             FROM equipment_items e
             JOIN nomenclature n ON n.id = e.nomenclature_id
             LEFT JOIN monitoring_objects o ON o.id = e.object_id
             WHERE e.status IN ('installed', 'on_testing') AND e.client_id = $1::uuid
             ORDER BY n.name LIMIT 300`,
            [act.client_id]
          ),
          query<{ id: string; name: string }>(
            `SELECT id, name FROM work_types WHERE is_active ORDER BY name`
          ),
          query<{ id: string; full_name: string }>(
            `SELECT DISTINCT u.id, u.full_name
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             LEFT JOIN work_order_performers p ON p.user_id = u.id AND p.work_order_id = $1::uuid
             WHERE u.is_active AND (r.code = 'installer' OR p.user_id IS NOT NULL)
             ORDER BY u.full_name`,
            [act.work_order_id]
          ),
          query<{ id: string; name: string; unit: string }>(
            `SELECT id, name, unit FROM nomenclature WHERE kind = 'material' AND is_active ORDER BY name`
          ),
          query<{ id: string; label: string }>(
            `SELECT s.id, s.icc || COALESCE(' · ' || s.msisdn, '') AS label
             FROM sim_cards s WHERE s.status IN ('in_stock', 'assigned') ORDER BY s.icc LIMIT 300`
          ),
          query<{ id: string; label: string }>(
            `SELECT s.id, s.icc || COALESCE(' · ' || s.msisdn, '') AS label
             FROM sim_cards s
             JOIN equipment_items e ON e.id = s.equipment_id
             WHERE e.client_id = $1::uuid ORDER BY s.icc LIMIT 300`,
            [act.client_id]
          ),
        ])
      : [[], [], [], [], [], [], []];

  const info: [string, React.ReactNode][] = [
    [
      s.workOrder,
      <Link
        key="wo"
        href={`/service/orders/${act.work_order_id}`}
        className="font-mono text-accent-ink hover:underline"
      >
        {act.wo_number}
      </Link>,
    ],
    [s.client, act.client_name ?? "—"],
    [s.object, act.object_name ?? "—"],
    [s.performedBy, act.performer_name ?? "—"],
    [s.createdAt, fmtAlmaty(act.created_at)],
  ];
  if (act.request_id) {
    info.splice(1, 0, [
      s.fromRequest,
      <Link
        key="req"
        href={`/service/requests/${act.request_id}`}
        className="font-mono text-accent-ink hover:underline"
      >
        {act.request_number}
      </Link>,
    ]);
  }

  return (
    <div className="max-w-5xl">
      <Link href="/service/acts" className="text-sm text-ink-dim hover:text-accent-ink">
        ← {s.actsTitle}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{act.number ?? act.wo_number}</h1>
        {actStatusBadge(act.status, s)}
        {act.photo_required && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
            {s.photoRequired}
          </span>
        )}
        {act.closed_at && <span className="text-sm text-ink-dim">{fmtAlmaty(act.closed_at)}</span>}
      </div>

      <div className="mt-5 rounded-lg border border-line bg-card p-5">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          {info.map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-xs uppercase tracking-wider text-ink-dim">{k}</dt>
              <dd className="mt-0.5 text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ActEditor
        actId={act.id}
        canEdit={canEdit}
        canClose={canClose}
        lines={lines}
        works={works}
        materials={materials}
        simOps={simOps}
        options={{
          installCandidates,
          removeCandidates,
          workTypes,
          performers,
          materialNoms,
          simsFree,
          simsAtClient,
        }}
        s={s}
        common={{ delete: d.common.delete }}
      />

      <div className="mt-6 rounded-lg border border-line bg-card p-5">
        <AttachmentsGallery
          entityType="maintenance_act"
          entityId={act.id}
          items={attachments}
          labels={{ title: s.photos, upload: s.uploadPhoto }}
          canUpload={
            act.status === "in_preparation" &&
            ["admin", "manager", "support", "installer", "head"].includes(user.role)
          }
        />
      </div>
    </div>
  );
}
