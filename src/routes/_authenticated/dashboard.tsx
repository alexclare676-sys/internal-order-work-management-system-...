import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Archive, BriefcaseBusiness, ChevronLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { statusClass, statusLabel, type CurrentUser } from "@/lib/dashboard";

type Order = {
  id: string;
  order_number: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  work_start_at: string | null;
  work_end_at: string | null;
  updated_at: string;
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم | مدار" },
      { name: "description", content: "لوحة إدارة الطلبات والعمال والمستندات" },
      { property: "og:title", content: "لوحة التحكم | مدار" },
      { property: "og:description", content: "لوحة إدارة الطلبات والعمال والمستندات" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext() as { user: CurrentUser };
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadOrders() {
    const { data, error } = await supabase
      .from("orders")
      .select("id,order_number,title,description,status,created_at,work_start_at,work_end_at,updated_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error("تعذر تحميل الطلبات");
    else setOrders(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadOrders();
    const channel = supabase
      .channel("orders-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void loadOrders())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(
    () => orders.filter((o) => `${o.order_number} ${o.title} ${o.description} ${statusLabel[o.status]}`.toLowerCase().includes(query.toLowerCase())),
    [orders, query]
  );
  const count = (s: string) => orders.filter((o) => o.status === s).length;

  async function createOrder(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("orders")
      .insert({
        title,
        description,
        work_start_at: start ? new Date(start).toISOString() : null,
        created_by: user.id,
        updated_by: user.id,
      });
    setSaving(false);
    if (error) {
      toast.error("تعذر إنشاء الطلب: " + error.message);
      return;
    }
    toast.success("تم إنشاء الطلب بنجاح");
    setDialog(false);
    setTitle(""); setDescription(""); setStart("");
    void loadOrders();
  }

  return (
    <DashboardShell user={user} search={query} onSearchChange={setQuery} activePath="/dashboard">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">لوحة التحكم</h1>
          <p className="mt-1 text-sm text-muted-foreground">نظرة شاملة على دورة حياة الطلبات</p>
        </div>
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogTrigger asChild>
            <Button variant="brand"><Plus />طلب جديد</Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>إنشاء طلب جديد</DialogTitle>
              <DialogDescription>أدخل المعلومات الأساسية. يمكنك إضافة العمال والمستندات بعد الحفظ.</DialogDescription>
            </DialogHeader>
            <form onSubmit={createOrder} className="space-y-4">
              <div>
                <Label>عنوان الطلب</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-2" />
              </div>
              <div>
                <Label>تفاصيل الطلب</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} required className="mt-2 min-h-28" />
              </div>
              <div>
                <Label>تاريخ ووقت بدء العمل</Label>
                <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required className="mt-2" />
              </div>
              <Button variant="brand" className="w-full" disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ الطلب"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <section className="glass-panel flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <span className="px-2 text-xs font-semibold text-muted-foreground">فلترة:</span>
        {["هذا الأسبوع", "الأسبوع السابق", "الشهر الحالي", "الحالة: الكل", "العامل: الكل"].map((x, i) => (
          <Button key={x} variant={i === 0 ? "default" : "glass"} size="sm">{x}</Button>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["إجمالي الطلبات", orders.length, "text-foreground"],
          ["قيد التنفيذ", count("IN_PROGRESS"), "text-primary"],
          ["بانتظار المستندات", count("WAITING_DOCUMENTS"), "text-amber-600"],
          ["مغلقة / مؤرشفة", count("CLOSED") + count("ARCHIVED"), "text-emerald-600"],
        ].map(([l, n, c]) => (
          <div key={String(l)} className="glass-panel rounded-2xl p-4 lg:p-5">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className={`num-font mt-2 text-3xl font-bold ${c}`}>{n as number}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">بيانات مباشرة</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <div className="glass-panel overflow-hidden rounded-2xl xl:col-span-2">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="font-bold">أحدث الطلبات</h2>
              <p className="text-xs text-muted-foreground">{visible.length} سجل</p>
            </div>
            <Button variant="glass" size="sm">تصدير تقرير</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-right text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-4">رقم الطلب</th>
                  <th>العنوان</th>
                  <th>الحالة</th>
                  <th>تاريخ الإنشاء</th>
                  <th className="pl-4">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="p-12 text-center text-muted-foreground">جارٍ تحميل الطلبات...</td></tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center">
                      <BriefcaseBusiness className="mx-auto mb-3 size-8 text-muted-foreground" />
                      <p className="font-semibold">لا توجد طلبات بعد</p>
                      <p className="mt-1 text-xs text-muted-foreground">ابدأ بإنشاء أول طلب عمل</p>
                    </td>
                  </tr>
                ) : (
                  visible.map((o) => (
                    <tr key={o.id} className="border-b border-border/70 hover:bg-card">
                      <td className="num-font p-4 font-semibold text-primary">{o.order_number}</td>
                      <td className="font-medium">{o.title}</td>
                      <td><span className={`status-badge ${statusClass[o.status]}`}>{statusLabel[o.status]}</span></td>
                      <td className="num-font text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("ar-IQ")}</td>
                      <td className="pl-4">
                        <Link to="/orders/$id" params={{ id: o.id }}>
                          <Button variant="glass" size="icon"><ChevronLeft /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">قائمة الإغلاق</h2>
            <span className="text-xs text-muted-foreground">نموذج التحقق</span>
          </div>
          <div className="mt-5 space-y-3">
            {[
              [true, "بيانات الطلب الأساسية"],
              [true, "العمال المرتبطون"],
              [true, "توثيق رقم الطلب"],
              [false, "أوراق التواقيع"],
              [false, "إثبات عمل العمال"],
            ].map(([ok, label]) => (
              <div key={String(label)} className="flex items-center gap-2 text-sm">
                <span className={`grid size-5 place-items-center rounded-full text-xs ${ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{ok ? "✓" : "×"}</span>
                {label}
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            لا يمكن إغلاق الطلب قبل استكمال المستندات الإلزامية.
          </div>
          <Button className="mt-4 w-full" disabled><Archive className="size-4" />إغلاق الطلب</Button>
        </div>
      </section>
    </DashboardShell>
  );
}
