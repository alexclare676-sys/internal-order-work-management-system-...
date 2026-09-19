import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Download, TrendingUp, Users as UsersIcon, FileText, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { getWeekEnd, getWeekStart, statusClass, statusLabel, type CurrentUser } from "@/lib/dashboard";

type OrderRow = {
  id: string;
  order_number: string;
  title: string;
  status: string;
  created_at: string;
  work_start_at: string | null;
  work_end_at: string | null;
};

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "التقارير | مدار" },
      { name: "description", content: "تقارير وإحصائيات الطلبات" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { user } = Route.useRouteContext() as { user: CurrentUser };
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "last_week" | "month" | "all">("week");

  async function load() {
    setLoading(true);
    let q = supabase.from("orders").select("id,order_number,title,status,created_at,work_start_at,work_end_at").is("deleted_at", null);
    const now = new Date();
    if (period === "week") {
      const s = getWeekStart(now).toISOString();
      const e = getWeekEnd(now).toISOString();
      q = q.gte("created_at", s).lte("created_at", e);
    } else if (period === "last_week") {
      const startThis = getWeekStart(now);
      const startLast = new Date(startThis); startLast.setDate(startLast.getDate() - 7);
      const endLast = getWeekEnd(startLast);
      q = q.gte("created_at", startLast.toISOString()).lte("created_at", endLast.toISOString());
    } else if (period === "month") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      q = q.gte("created_at", s).lte("created_at", e);
    }
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) toast.error("تعذر تحميل البيانات");
    else setOrders(data ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [period]);

  const stats = useMemo(() => {
    const total = orders.length;
    const closed = orders.filter((o) => o.status === "CLOSED").length;
    const inProgress = orders.filter((o) => o.status === "IN_PROGRESS").length;
    const waiting = orders.filter((o) => o.status === "WAITING_DOCUMENTS").length;
    const pending = orders.filter((o) => o.status === "PENDING_REVIEW").length;
    const archived = orders.filter((o) => o.status === "ARCHIVED").length;
    const open = orders.filter((o) => o.status === "OPEN").length;
    const closureRate = total > 0 ? Math.round((closed / total) * 100) : 0;
    return { total, closed, inProgress, waiting, pending, archived, open, closureRate };
  }, [orders]);

  function exportCSV() {
    const headers = ["رقم الطلب", "العنوان", "الحالة", "تاريخ الإنشاء", "بدء العمل", "نهاية العمل"];
    const rows = orders.map((o) => [
      o.order_number,
      `"${o.title.replace(/"/g, '""')}"`,
      statusLabel[o.status] ?? o.status,
      new Date(o.created_at).toLocaleString("ar-IQ"),
      o.work_start_at ? new Date(o.work_start_at).toLocaleString("ar-IQ") : "",
      o.work_end_at ? new Date(o.work_end_at).toLocaleString("ar-IQ") : "",
    ]);
    const csv = "\uFEFF" + [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `madar-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير التقرير");
  }

  const periodLabel = { week: "هذا الأسبوع", last_week: "الأسبوع السابق", month: "هذا الشهر", all: "كل الفترات" }[period];
  const maxValue = Math.max(stats.open, stats.inProgress, stats.waiting, stats.pending, stats.closed, stats.archived, 1);

  return (
    <DashboardShell user={user} activePath="/reports">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">التقارير والإحصائيات</h1>
          <p className="mt-1 text-sm text-muted-foreground">نظرة تحليلية على أداء الطلبات</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger className="h-10 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">هذا الأسبوع</SelectItem>
              <SelectItem value="last_week">الأسبوع السابق</SelectItem>
              <SelectItem value="month">هذا الشهر</SelectItem>
              <SelectItem value="all">كل الفترات</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="brand" onClick={exportCSV} disabled={orders.length === 0}><Download className="size-4" />تصدير CSV</Button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["إجمالي الطلبات", stats.total, "text-foreground", <ClipboardCheck key="c" className="size-4" />],
          ["مغلقة", stats.closed, "text-emerald-600", <TrendingUp key="t" className="size-4" />],
          ["قيد التنفيذ", stats.inProgress, "text-primary", <FileText key="f" className="size-4" />],
          ["نسبة الإغلاق", `${stats.closureRate}%`, "text-amber-600", <TrendingUp key="r" className="size-4" />],
        ].map(([l, v, c, icon]) => (
          <div key={String(l)} className="glass-panel rounded-2xl p-4 lg:p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{l}</div>
            <p className={`num-font mt-2 text-3xl font-bold ${c as string}`}>{v as React.ReactNode}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {/* Distribution by status */}
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">توزيع الطلبات حسب الحالة</h2>
            <span className="text-xs text-muted-foreground">{periodLabel}</span>
          </div>
          <div className="mt-6 space-y-4">
            {[
              { key: "OPEN", label: "مفتوح", color: "bg-muted-foreground" },
              { key: "IN_PROGRESS", label: "قيد التنفيذ", color: "bg-primary" },
              { key: "WAITING_DOCUMENTS", label: "بانتظار المستندات", color: "bg-amber-500" },
              { key: "PENDING_REVIEW", label: "بانتظار المراجعة", color: "bg-blue-500" },
              { key: "CLOSED", label: "مغلق", color: "bg-emerald-500" },
              { key: "ARCHIVED", label: "مؤرشف", color: "bg-muted-foreground/50" },
            ].map((s) => {
              const value = orders.filter((o) => o.status === s.key).length;
              const pct = (value / maxValue) * 100;
              return (
                <div key={s.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span>{s.label}</span>
                    <span className="num-font font-medium">{value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${s.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Weekly timeline */}
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">توزيع الطلبات حسب اليوم</h2>
            <Calendar className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-6 flex items-end justify-between gap-2" style={{ height: 200 }}>
            {["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"].map((day, i) => {
              const dayOrders = orders.filter((o) => {
                const d = new Date(o.created_at).getDay();
                // 0=Sun, 6=Sat. Map our labels: السبت=6, الأحد=0, الاثنين=1...
                const map = [0, 1, 2, 3, 4, 5, 6]; // i=0→6 (Sat), i=1→0 (Sun)...
                const targetDay = i === 0 ? 6 : i - 1;
                return d === targetDay;
              }).length;
              const h = (dayOrders / maxValue) * 100;
              return (
                <div key={day} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full rounded-t-lg bg-primary/80 transition-all hover:bg-primary" style={{ height: `${Math.max(h, 2)}%` }} title={`${dayOrders} طلب`} />
                  </div>
                  <span className="num-font text-xs text-muted-foreground">{dayOrders}</span>
                  <span className="text-[10px] text-muted-foreground">{day}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Detailed table */}
      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 className="font-bold">تفاصيل الطلبات</h2>
            <p className="text-xs text-muted-foreground">{orders.length} سجل · {periodLabel}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-right text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-4">رقم الطلب</th>
                <th>العنوان</th>
                <th>الحالة</th>
                <th>تاريخ الإنشاء</th>
                <th>بدء العمل</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-12 text-center text-muted-foreground">جارٍ التحميل...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={5} className="p-12 text-center text-muted-foreground">لا توجد طلبات في هذه الفترة</td></tr>
              ) : orders.map((o) => (
                <tr key={o.id} className="border-b border-border/70 hover:bg-card">
                  <td className="num-font p-4 font-semibold text-primary">{o.order_number}</td>
                  <td className="font-medium">{o.title}</td>
                  <td><span className={`status-badge ${statusClass[o.status]}`}>{statusLabel[o.status]}</span></td>
                  <td className="num-font text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("ar-IQ")}</td>
                  <td className="num-font text-xs text-muted-foreground">{o.work_start_at ? new Date(o.work_start_at).toLocaleString("ar-IQ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
