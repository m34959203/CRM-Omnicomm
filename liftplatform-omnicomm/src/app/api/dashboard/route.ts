// Omnicomm — рабочий стол (раздел 6 ТЗ): операционные показатели по заявкам и монтажникам.
// Использует доменные поля incidents (migration-020) и installer_status (migration-017).
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const oneNum = async (sql: string) => (await pool.query(sql)).rows[0].n as number;

  const [
    total, isNew, inWork, visitPlanned, atInstaller, waitClient,
    done, overdue, noResponsible, noPhoto, activeInstallers, onSite,
  ] = await Promise.all([
    oneNum(`SELECT COUNT(*)::int n FROM incidents`),
    oneNum(`SELECT COUNT(*)::int n FROM incidents WHERE omnicomm_status = 'new'`),
    oneNum(`SELECT COUNT(*)::int n FROM incidents WHERE omnicomm_status IN ('in_progress','working')`),
    oneNum(`SELECT COUNT(*)::int n FROM incidents WHERE omnicomm_status = 'visit_planned'`),
    oneNum(`SELECT COUNT(*)::int n FROM incidents WHERE omnicomm_status IN ('installer_departed','installer_on_site')`),
    oneNum(`SELECT COUNT(*)::int n FROM incidents WHERE omnicomm_status = 'wait_client'`),
    oneNum(`SELECT COUNT(*)::int n FROM incidents WHERE omnicomm_status IN ('completed','closed')`),
    oneNum(`SELECT COUNT(*)::int n FROM incidents WHERE omnicomm_status = 'overdue'`),
    oneNum(`SELECT COUNT(*)::int n FROM incidents WHERE manager_id IS NULL AND omnicomm_status NOT IN ('closed','cancelled')`),
    oneNum(`SELECT COUNT(*)::int n FROM incidents i WHERE i.omnicomm_status IN ('completed','closed')
              AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.incident_id = i.id AND d.document_type LIKE 'photo%')`),
    oneNum(`SELECT COUNT(*)::int n FROM users WHERE role = 'technician' AND installer_status NOT IN ('unavailable','day_off')`),
    oneNum(`SELECT COUNT(*)::int n FROM users WHERE role = 'technician' AND installer_status = 'on_site'`),
  ]);

  const byStatus = (await pool.query(
    `SELECT omnicomm_status AS status, COUNT(*)::int n FROM incidents GROUP BY omnicomm_status ORDER BY n DESC`
  )).rows;

  return NextResponse.json({
    data: {
      total, new: isNew, in_work: inWork, visit_planned: visitPlanned,
      at_installer: atInstaller, wait_client: waitClient, done, overdue,
      no_responsible: noResponsible, no_photo: noPhoto,
      active_installers: activeInstallers, on_site_installers: onSite,
      by_status: byStatus,
    },
  });
}
