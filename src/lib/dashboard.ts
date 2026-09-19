/**
 * ============================================================
 * helpers for the dashboard pages (auth/role + RTL layout)
 * ============================================================
 */
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "administrator" | "manager" | "employee" | "viewer";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  canManageOrders: boolean;
  canManageUsers: boolean;
  canViewAudit: boolean;
}

const roleRank: Record<AppRole, number> = {
  administrator: 4,
  manager: 3,
  employee: 2,
  viewer: 1,
};

export async function fetchCurrentUser(user: User): Promise<CurrentUser> {
  // ensure profile exists (claim role if first time)
  const fullName = (user.user_metadata?.["full_name"] as string | undefined)
    ?? user.email?.split("@")[0]
    ?? "مستخدم النظام";

  await supabase.rpc("claim_initial_administrator", { _full_name: fullName });

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const role: AppRole = roles && roles.length > 0
    ? roles.sort((a, b) => roleRank[(b.role as AppRole) ?? "viewer"] - roleRank[(a.role as AppRole) ?? "viewer"])[0]?.role as AppRole
    : "viewer";

  if (!role) return {
    id: user.id,
    email: user.email ?? "",
    fullName,
    role: "viewer",
    canManageOrders: false,
    canManageUsers: false,
    canViewAudit: false,
  };

  return {
    id: user.id,
    email: user.email ?? "",
    fullName,
    role,
    canManageOrders: role === "administrator" || role === "manager" || role === "employee",
    canManageUsers: role === "administrator",
    canViewAudit: role === "administrator" || role === "manager",
  };
}

export const roleLabel: Record<AppRole, string> = {
  administrator: "مدير النظام",
  manager: "مدير",
  employee: "موظف",
  viewer: "مشاهد",
};

export const roleBadgeClass: Record<AppRole, string> = {
  administrator: "bg-primary/15 text-primary",
  manager: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  employee: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  viewer: "bg-muted text-muted-foreground",
};

// order status helpers
export const statusLabel: Record<string, string> = {
  OPEN: "مفتوح",
  IN_PROGRESS: "قيد التنفيذ",
  WAITING_DOCUMENTS: "بانتظار المستندات",
  PENDING_REVIEW: "بانتظار المراجعة",
  CLOSED: "مغلق",
  ARCHIVED: "مؤرشف",
};

export const statusClass: Record<string, string> = {
  OPEN: "status-open",
  IN_PROGRESS: "status-progress",
  WAITING_DOCUMENTS: "status-waiting",
  PENDING_REVIEW: "status-review",
  CLOSED: "status-closed",
  ARCHIVED: "status-archived",
};

export const validTransitions: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_DOCUMENTS"],
  IN_PROGRESS: ["WAITING_DOCUMENTS", "PENDING_REVIEW"],
  WAITING_DOCUMENTS: ["IN_PROGRESS", "PENDING_REVIEW"],
  PENDING_REVIEW: ["WAITING_DOCUMENTS", "CLOSED"],
  CLOSED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionTo(current: string, target: string): boolean {
  return (validTransitions[current] ?? []).includes(target);
}

// week helpers (Mon–Fri work cycle)
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon ...
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekEnd(date: Date = new Date()): Date {
  const end = new Date(getWeekStart(date));
  end.setDate(end.getDate() + 5); // Friday end-of-day
  end.setHours(23, 59, 59, 999);
  return end;
}

export function formatWeekLabel(date: Date = new Date()): string {
  const start = getWeekStart(date);
  const end = getWeekEnd(date);
  const weekNum = Math.ceil(((start.getTime() - new Date(start.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
  return `الأسبوع ${weekNum} · ${start.getFullYear()}`;
}
