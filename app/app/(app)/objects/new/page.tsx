import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { NewObjectForm } from "./form";

export default async function NewObjectPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const clients = await query<{ id: string; name: string }>(
    `SELECT id, name FROM clients WHERE is_active ORDER BY name`
  );
  return <NewObjectForm clients={clients} />;
}
