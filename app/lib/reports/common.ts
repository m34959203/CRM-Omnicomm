import type { Role } from "@/lib/auth";

/** Чтение отчётов — все офисные роли (без техника: у него PWA /m). */
export const REPORT_READ_ROLES: Role[] = [
  "admin",
  "manager",
  "support",
  "accounting",
  "head",
  "boss",
];
