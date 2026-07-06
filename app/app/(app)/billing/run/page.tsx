import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { currentAlmatyPeriod } from "@/lib/billing/dates";
import { BillingTabs } from "../tabs";
import { RunForm } from "./run-client";

export default async function BillingRunPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!["admin", "accounting", "head"].includes(user.role)) redirect("/billing/documents");
  const d = t(user.locale);

  const [clients, categories] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name LIMIT 500`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM service_categories WHERE is_active ORDER BY name`
    ),
  ]);

  // Период по умолчанию — текущий месяц (Алматы).
  const defaultPeriod = currentAlmatyPeriod();

  return (
    <div>
      <h1 className="text-2xl font-semibold">{d.billing.title}</h1>
      <BillingTabs d={d} active="run" />
      <RunForm d={d} clients={clients} categories={categories} defaultPeriod={defaultPeriod} />
    </div>
  );
}
