/** RBAC раздела «Зарплата» (этап 5). */
import type { Role } from "@/lib/auth";

export const PAYROLL_READ_ROLES: Role[] = ["admin", "accounting", "head", "boss"];
export const PAYROLL_WRITE_ROLES: Role[] = ["admin", "accounting", "head"];
/** Утверждение и отметка «выплачена» — только руководство. */
export const PAYROLL_APPROVE_ROLES: Role[] = ["admin", "head"];

export const PAYROLL_SCOPES = ["default", "category", "performer"] as const;
export const ENTRY_KINDS = ["work", "compensation", "deduction"] as const;
