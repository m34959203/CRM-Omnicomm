import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { SUPPORT_WRITE_ROLES, TICKET_CHANNELS } from "@/lib/support/common";
import { TicketForm } from "./form";

export default async function NewTicketPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!SUPPORT_WRITE_ROLES.includes(user.role)) redirect("/support/tickets");
  const d = t(user.locale);
  const s = d.support;

  const clients = await query<{ id: string; name: string }>(
    `SELECT id, name FROM clients WHERE is_active ORDER BY name`
  );

  return (
    <div>
      <Link href="/support/tickets" className="text-sm text-ink-dim hover:text-accent-ink">
        ← {s.ticketsTitle}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{s.newTicket}</h1>
      <TicketForm
        clients={clients}
        channels={TICKET_CHANNELS.map((ch) => [
          ch,
          (s.channels as Record<string, string>)[ch] ?? ch,
        ])}
        labels={{
          client: s.client,
          noClient: s.noClient,
          contact: s.contact,
          channel: s.channel,
          subject: s.subject,
          description: s.description,
          save: d.common.create,
        }}
      />
    </div>
  );
}
