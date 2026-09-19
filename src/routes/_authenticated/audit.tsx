import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Archive, FileUp, Pencil, Plus, RotateCcw, Settings as SettingsIcon, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import type { CurrentUser } from "@/lib/dashboard";

type AuditLog = {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  order_id: string | null;
  summary: string;
  changes: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  actor_name?: string;
};

const actionLabel: Record<string, string> = {
  CREATE: "إنشاء",
  UPDATE: "تعديل",
  DELETE: "حذف",
  RESTORE: "استعادة",
  STATUS_CHANGE: "تغيير حالة",
  UPLOAD: "رفع ملف",
  REPLACE: "استبدال ملف",
  CLOSE: "إغلاق",
  ARCHIVE: "أرشفة",
  ASSIGN: "تعيين",
};

const actionIcon: Record<string, React.ReactNode> = {
  CREATE: <Plus className="size-3.5 text-emerald-600" />,
  UPDATE: <Pencil className="size-3.5 text-blue-600" />,
  DELETE: <Trash2 className="size-3.5 text-rose-600" />,
  RESTORE: <RotateCcw className="size-3.5 text-emerald-600" />,
  STATUS_CHANGE: <SettingsIcon className="size-3.5 text-amber-600" />,
  UPLOAD: <FileUp className="size-3.5 text-primary" />,
  REPLACE: <FileUp className="size-3.5 text-primary" />,
  CLOSE: <Archive className="size-3.5 text-emerald-700" />,
  ARCHIVE: <Archive className="size-3.5 text-muted-foreground" />,
  ASSIGN: <UserCog className="size-3.5 text-blue-600" />,
};

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "سجل العمليات | مدار" },
      { name: "description", content: "سجل كامل لكل العمليات على النظام" },
    ],
  }),
  beforeLoad: ({ context }) => {
    const u = (context as { user: CurrentUser }).user;
    if (!u?.canViewAudit) throw redirect({ to: "/dashboard" });
  },
  component: AuditPage,
});

function AuditPage() {
  const { user } = Route.useRouteContext() as { user: CurrentUser };
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id,user_id,action,entity_type,entity_id,order_id,summary,changes,ip_address,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { toast.error("تعذر تحميل السجل"); setLoading(false); return; }

    // جلب أسماء المستخدمين
    const userIds = Array.from(new Set((data ?? []).map((l: { user_id: string }) => l.user_id)));
    const { data: profiles } = await supabase.from("profiles").select("id,full_name").in("id", userIds);
    const nameMap = new Map((profiles ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));

    const enriched = ((data ?? []) as AuditLog[]).map((l) => ({ ...l, actor_name: nameMap.get(l.user_id) ?? "مستخدم" }));
    setLogs(enriched);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(
    () => logs.filter((l) => {
      const matchQuery = `${l.summary} ${l.actor_name ?? ""} ${l.action}`.toLowerCase().includes(query.toLowerCase());
      const matchAction = actionFilter === "ALL" || l.action === actionFilter;
      return matchQuery && matchAction;
    }),
    [logs, query, actionFilter]
  );

  const stats = useMemo(() => ({
    total: logs.length,
    today: logs.filter((l) => new Date(l.created_at).toDateString() === new Date().toDateString()).length,
    createActions: logs.filter((l) => l.action === "CREATE").length,
    closeActions: logs.filter((l) => l.action === "CLOSE").length,
  }), [logs]);

  return (
    <DashboardShell user={user} search={query} onSearchChange={setQuery} activePath="/audit">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">سجل العمليات</h1>
          <p className="mt-1 text-sm text-muted-foreground">كل العمليات على النظام (آخر 500 سجل)</p>
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-10 w-48"><SelectValue placeholder="كل العمليات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل العمليات</SelectItem>
            <SelectItem value="CREATE">إنشاء</SelectItem>
            <SelectItem value="UPDATE">تعديل</SelectItem>
            <SelectItem value="STATUS_CHANGE">تغيير حالة</SelectItem>
            <SelectItem value="UPLOAD">رفع ملف</SelectItem>
            <SelectItem value="CLOSE">إغلاق</SelectItem>
            <SelectItem value="ARCHIVE">أرشفة</SelectItem>
            <SelectItem value="DELETE">حذف</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["إجمالي العمليات", stats.total, "text-foreground"],
          ["عمليات اليوم", stats.today, "text-primary"],
          ["إنشاء", stats.createActions, "text-emerald-600"],
          ["إغلاق", stats.closeActions, "text-amber-600"],
        ].map(([l, n, c]) => (
          <div key={String(l)} className="glass-panel rounded-2xl p-4 lg:p-5">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className={`num-font mt-2 text-3xl font-bold ${c}`}>{n as number}</p>
          </div>
        ))}
      </section>

      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 className="font-bold">السجل التفصيلي</h2>
            <p className="text-xs text-muted-foreground">{visible.length} سجل</p>
          </div>
        </div>
        <div className="divide-y divide-border/70">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">جارٍ التحميل...</div>
          ) : visible.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">لا توجد عمليات مسجلة</div>
          ) : visible.map((l) => (
            <div key={l.id} className="flex items-start gap-3 p-4">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">{actionIcon[l.action] ?? <Pencil className="size-3.5" />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{l.summary}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{actionLabel[l.action] ?? l.action}</span>
                  <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[10px] text-muted-foreground">{l.entity_type}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  بواسطة: <span className="font-medium">{l.actor_name ?? "مستخدم"}</span> · {new Date(l.created_at).toLocaleString("ar-IQ")}
                  {l.ip_address && <span className="num-font" dir="ltr"> · {l.ip_address}</span>}
                </p>
                {l.changes && Object.keys(l.changes).length > 0 && (
                  <div className="num-font mt-1 rounded-md bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground" dir="ltr">
                    {JSON.stringify(l.changes)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
