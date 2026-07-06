import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { createSession, type Role } from "@/lib/auth";

type UserRow = {
  id: string;
  full_name: string;
  role_code: Role;
  password_hash: string;
  locale: "ru" | "kk";
  is_active: boolean;
};

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  if (!email || !password) {
    return Response.json({ error: "email and password required" }, { status: 400 });
  }

  const [user] = await query<UserRow>(
    `SELECT u.id, u.full_name, r.code AS role_code, u.password_hash, u.locale, u.is_active
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE lower(u.email) = lower($1)`,
    [email]
  );
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    return Response.json({ error: "invalid credentials" }, { status: 401 });
  }

  await createSession({
    userId: user.id,
    fullName: user.full_name,
    role: user.role_code,
    locale: user.locale,
  });
  await query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
     VALUES ($1, 'login', 'user', $1)`,
    [user.id]
  );
  // role — для клиентского редиректа (installer → /m, PWA техника)
  return Response.json({ ok: true, role: user.role_code });
}
