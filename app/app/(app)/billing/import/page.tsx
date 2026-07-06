import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { BillingTabs } from "../tabs";
import { ImportClient } from "./import-client";

export default async function PaymentsImportPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  return (
    <div>
      <h1 className="text-2xl font-semibold">{d.billing.importTitle}</h1>
      <BillingTabs d={d} active="import" />
      <p className="mt-4 max-w-3xl text-sm text-ink-dim">{d.billing.importHint}</p>
      <ImportClient
        labels={{ preview: d.billing.importPreview, commit: d.billing.importCommit }}
      />
    </div>
  );
}
