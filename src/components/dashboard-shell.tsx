/**
 * ============================================================
 * DashboardShell - Shared layout for all authenticated pages
 * يحافظ على نفس تصميم الـ dashboard الأصلي بالضبط
 * ============================================================
 */
import { useEffect, useState, type ComponentType } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Archive,
  Bell,
  BriefcaseBusiness,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sun,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentUser, formatWeekLabel, roleBadgeClass, roleLabel, type CurrentUser } from "@/lib/dashboard";
import { toast } from "sonner";

interface NavItem {
  icon: ComponentType<{ className?: string }>;
  label: string;
  to: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "لوحة التحكم", to: "/dashboard" },
  { icon: BriefcaseBusiness, label: "الطلبات", to: "/dashboard?tab=orders" },
  { icon: Users, label: "العمال", to: "/workers" },
  { icon: FileText, label: "المستندات", to: "/dashboard?tab=documents" },
  { icon: ClipboardCheck, label: "التقارير", to: "/reports" },
  { icon: Archive, label: "سجل العمليات", to: "/audit", adminOnly: false },
  { icon: SettingsIcon, label: "إعدادات النظام", to: "/settings", adminOnly: true },
];

interface Props {
  user: CurrentUser;
  children: React.ReactNode;
  search?: string;
  onSearchChange?: (v: string) => void;
  activePath?: string;
}

export function DashboardShell({ user, children, search = "", onSearchChange, activePath }: Props) {
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("تم تسجيل الخروج");
    await navigate({ to: "/auth", replace: true });
  }

  const navItems = NAV.filter((item) => !item.adminOnly || user.canManageUsers);
  const weekLabel = formatWeekLabel();

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_10%,color-mix(in_oklab,var(--primary)_15%,transparent),transparent_34%),radial-gradient(circle_at_90%_60%,color-mix(in_oklab,var(--accent)_13%,transparent),transparent_32%)]" />
      <div className="relative flex min-h-screen">
        <aside className={`${mobile ? "flex" : "hidden"} fixed inset-y-0 right-0 z-40 w-64 flex-col border-l border-border bg-card/95 p-3 backdrop-blur-xl md:sticky md:flex`}>
          <div className="flex items-center gap-3 px-3 py-4">
            <div className="grid size-10 place-items-center rounded-xl bg-primary font-bold text-primary-foreground shadow-lg shadow-primary/20">م</div>
            <div>
              <p className="font-bold">نظام مدار</p>
              <p className="num-font text-[11px] text-muted-foreground">Order & Work OS</p>
            </div>
            <button className="mr-auto md:hidden" onClick={() => setMobile(false)} aria-label="إغلاق القائمة">
              <X className="size-5" />
            </button>
          </div>
          <nav className="mt-3 flex-1 space-y-1">
            <p className="px-3 py-2 text-[10px] font-semibold text-muted-foreground">القوائم الرئيسية</p>
            {navItems.map(({ icon: Icon, label, to }) => {
              const active = activePath === to;
              return (
                <button
                  key={label}
                  onClick={() => {
                    void navigate({ to });
                    setMobile(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              );
            })}
          </nav>
          <div className="glass-panel rounded-2xl p-3">
            <p className="truncate text-sm font-semibold">{user.fullName}</p>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${roleBadgeClass[user.role]}`}>{roleLabel[user.role]}</span>
            <button onClick={signOut} className="mt-2 text-xs text-muted-foreground hover:text-foreground">تسجيل الخروج</button>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/75 px-4 backdrop-blur-xl lg:px-6">
            <button onClick={() => setMobile(true)} className="md:hidden" aria-label="فتح القائمة"><Menu /></button>
            {onSearchChange ? (
              <div className="relative max-w-xl flex-1">
                <Search className="absolute right-3 top-2.5 size-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="بحث سريع..." className="h-10 rounded-xl bg-card/70 pr-10" />
              </div>
            ) : <div className="flex-1" />}
            <span className="hidden rounded-xl border border-border bg-card/70 px-3 py-2 text-xs text-muted-foreground lg:block">{weekLabel}</span>
            <Button variant="glass" size="icon" aria-label="الإشعارات"><Bell /></Button>
            <Button variant="glass" size="icon" onClick={() => setDark(!dark)} aria-label="تبديل المظهر">{dark ? <Sun /> : <Moon />}</Button>
          </header>
          <main className="space-y-5 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

// Helper to load current user in any route's beforeLoad
export async function loadCurrentUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Promise<CurrentUser> {
  return fetchCurrentUser(user as never);
}
