import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { NewServerForm } from "./form";

export default async function NewTelematicsServerPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "head") redirect("/telematics");
  return <NewServerForm />;
}
