/** RBAC и константы раздела «Поддержка» (этап 6). */
import type { Role } from "@/lib/auth";

export const SUPPORT_READ_ROLES: Role[] = ["admin", "manager", "support", "head", "boss"];
export const SUPPORT_WRITE_ROLES: Role[] = ["admin", "manager", "support", "head"];

export const TICKET_CHANNELS = ["phone", "whatsapp", "telegram", "email", "site", "manual"];
export const TICKET_STATUSES = ["new", "in_progress", "on_service", "done", "rejected"];
export const CALL_DIRECTIONS = ["incoming", "outgoing", "missed"];
export const MESSAGE_CHANNELS = ["whatsapp", "telegram", "email", "site", "chat", "sms"];
export const NOTIFY_CHANNELS = ["email", "telegram", "whatsapp", "web_push", "sms"];
