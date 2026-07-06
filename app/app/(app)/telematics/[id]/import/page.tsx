import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { ImportClient } from "./import-client";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "head") redirect("/telematics");
  const d = t(user.locale);
  const { id } = await params;

  const [server] = await query<{ id: string; name: string; base_url: string }>(
    `SELECT id, name, base_url FROM telematics_servers WHERE id = $1::uuid`,
    [id]
  );
  if (!server) notFound();

  const clients = await query<{ id: string; name: string }>(
    `SELECT id, name FROM clients WHERE is_active ORDER BY name LIMIT 500`
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        {d.telematics.importAction}: {server.name}
      </h1>
      <p className="mt-1 font-mono text-sm text-ink-dim">{server.base_url}</p>
      <ImportClient
        serverId={server.id}
        clients={clients}
        labels={{
          preview: d.telematics.importPreview,
          run: d.telematics.runImport,
          toCreate: d.telematics.toCreate,
          toUpdate: d.telematics.toUpdate,
          total: d.telematics.totalInSm,
          externalName: d.telematics.externalName,
          regNumber: d.objects.regNumber,
          brandModel: d.objects.brandModel,
          client: d.telematics.client,
        }}
      />
    </div>
  );
}
