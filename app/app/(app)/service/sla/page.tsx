import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { ServiceTabs } from "../tabs";
import { SlaEditor } from "./sla-editor";

export default async function SlaPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);

  const rows = await query<{
    id: string; request_type: string; reaction_minutes: number | null;
    execution_hours: number; is_active: boolean;
  }>(`SELECT id, request_type, reaction_minutes, execution_hours, is_active
      FROM request_sla ORDER BY request_type`);

  const typeLabels = d.service.requestTypes as Record<string, string>;
  const canEdit = ["admin", "head"].includes(user.role);

  return (
    <div>
      <h1 className="text-2xl font-semibold">{d.service.title}</h1>
      <ServiceTabs d={d} active="sla" />
      <p className="mt-4 max-w-2xl text-sm text-ink-dim">{d.service.slaHint}</p>
      <SlaEditor
        rows={rows.map((r) => ({ ...r, label: typeLabels[r.request_type] ?? r.request_type }))}
        canEdit={canEdit}
        d={{
          type: d.service.slaType,
          reaction: d.service.slaReaction,
          execution: d.service.slaExecution,
          active: d.service.slaActive,
          save: d.common.save,
        }}
      />
    </div>
  );
}
