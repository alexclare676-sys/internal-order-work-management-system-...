import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Archive, Bell, BriefcaseBusiness, ChevronLeft, ClipboardCheck, FileText, LayoutDashboard, Menu, Moon, Plus, Search, Settings, Sun, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type Order = { id:string; order_number:string; title:string; description:string; status:string; created_at:string; work_start_at:string|null; work_end_at:string|null; updated_at:string };
const statusLabel: Record<string,string> = { OPEN:"مفتوح", IN_PROGRESS:"قيد التنفيذ", WAITING_DOCUMENTS:"بانتظار المستندات", PENDING_REVIEW:"بانتظار المراجعة", CLOSED:"مغلق", ARCHIVED:"مؤرشف" };
const statusClass: Record<string,string> = { OPEN:"status-open", IN_PROGRESS:"status-progress", WAITING_DOCUMENTS:"status-waiting", PENDING_REVIEW:"status-review", CLOSED:"status-closed", ARCHIVED:"status-archived" };

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "لوحة التحكم | مدار" }, { name:"description", content:"لوحة إدارة الطلبات والعمال والمستندات" },
    { property:"og:title", content:"لوحة التحكم | مدار" }, { property:"og:description", content:"لوحة إدارة الطلبات والعمال والمستندات" },
    { property:"og:type", content:"website" }, { name:"twitter:card", content:"summary_large_image" },
  ]}), component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [orders,setOrders] = useState<Order[]>([]); const [loading,setLoading] = useState(true);
  const [query,setQuery] = useState(""); const [dark,setDark] = useState(false); const [dialog,setDialog] = useState(false); const [mobile,setMobile] = useState(false);
  const [title,setTitle] = useState(""); const [description,setDescription] = useState(""); const [start,setStart] = useState(""); const [saving,setSaving] = useState(false);
  const fullName = (user.user_metadata?.["full_name"] as string | undefined) ?? user.email?.split("@")[0] ?? "مستخدم النظام";

  async function loadOrders() { const { data,error } = await supabase.from("orders").select("id,order_number,title,description,status,created_at,work_start_at,work_end_at,updated_at").is("deleted_at",null).order("created_at",{ascending:false}).limit(50); if(error) toast.error("تعذر تحميل الطلبات"); else setOrders(data ?? []); setLoading(false); }
  useEffect(() => { void supabase.rpc("claim_initial_administrator",{_full_name:fullName}).then(() => loadOrders()); const channel=supabase.channel("orders-dashboard").on("postgres_changes",{event:"*",schema:"public",table:"orders"},()=>void loadOrders()).subscribe(); return()=>{void supabase.removeChannel(channel)}; },[]);
  useEffect(() => { document.documentElement.classList.toggle("dark",dark); },[dark]);
  const visible=useMemo(()=>orders.filter(o=>`${o.order_number} ${o.title} ${o.description} ${statusLabel[o.status]}`.toLowerCase().includes(query.toLowerCase())),[orders,query]);
  const count=(s:string)=>orders.filter(o=>o.status===s).length;
  async function createOrder(e:React.FormEvent){e.preventDefault();setSaving(true);const {error}=await supabase.from("orders").insert({title,description,work_start_at:start?new Date(start).toISOString():null,created_by:user.id,updated_by:user.id});setSaving(false);if(error){toast.error("تعذر إنشاء الطلب: "+error.message);return;}toast.success("تم إنشاء الطلب بنجاح");setDialog(false);setTitle("");setDescription("");setStart("");void loadOrders();}
  async function signOut(){await supabase.auth.signOut();await navigate({to:"/auth",replace:true});}

  const nav=[{icon:LayoutDashboard,label:"لوحة التحكم"},{icon:BriefcaseBusiness,label:"الطلبات"},{icon:Users,label:"العمال"},{icon:FileText,label:"المستندات"},{icon:ClipboardCheck,label:"التقارير"},{icon:Archive,label:"سجل العمليات"},{icon:Settings,label:"إعدادات النظام"}];
  return <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_10%,color-mix(in_oklab,var(--primary)_15%,transparent),transparent_34%),radial-gradient(circle_at_90%_60%,color-mix(in_oklab,var(--accent)_13%,transparent),transparent_32%)]"/>
    <div className="relative flex min-h-screen">
      <aside className={`${mobile?"flex":"hidden"} fixed inset-y-0 right-0 z-40 w-64 flex-col border-l border-border bg-card/95 p-3 backdrop-blur-xl md:sticky md:flex`}>
        <div className="flex items-center gap-3 px-3 py-4"><div className="grid size-10 place-items-center rounded-xl bg-primary font-bold text-primary-foreground shadow-lg shadow-primary/20">م</div><div><p className="font-bold">نظام مدار</p><p className="num-font text-[11px] text-muted-foreground">Order & Work OS</p></div><button className="mr-auto md:hidden" onClick={()=>setMobile(false)} aria-label="إغلاق القائمة"><X className="size-5"/></button></div>
        <nav className="mt-3 flex-1 space-y-1"><p className="px-3 py-2 text-[10px] font-semibold text-muted-foreground">القوائم الرئيسية</p>{nav.map(({icon:Icon,label},i)=><button key={label} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${i===0?"bg-primary text-primary-foreground shadow-md shadow-primary/20":"text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="size-4"/>{label}</button>)}</nav>
        <div className="glass-panel rounded-2xl p-3"><p className="truncate text-sm font-semibold">{fullName}</p><p className="text-xs text-primary">Administrator</p><button onClick={signOut} className="mt-2 text-xs text-muted-foreground hover:text-foreground">تسجيل الخروج</button></div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/75 px-4 backdrop-blur-xl lg:px-6"><button onClick={()=>setMobile(true)} className="md:hidden" aria-label="فتح القائمة"><Menu/></button><div className="relative max-w-xl flex-1"><Search className="absolute right-3 top-2.5 size-4 text-muted-foreground"/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="بحث سريع: رقم الطلب، العنوان، الحالة..." className="h-10 rounded-xl bg-card/70 pr-10"/></div><span className="hidden rounded-xl border border-border bg-card/70 px-3 py-2 text-xs text-muted-foreground lg:block">الأسبوع 38 · 2026</span><Button variant="glass" size="icon" aria-label="الإشعارات"><Bell/></Button><Button variant="glass" size="icon" onClick={()=>setDark(!dark)} aria-label="تبديل المظهر">{dark?<Sun/>:<Moon/>}</Button></header>
        <main className="space-y-5 p-4 lg:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold">لوحة التحكم</h1><p className="mt-1 text-sm text-muted-foreground">نظرة شاملة على دورة حياة الطلبات</p></div><Dialog open={dialog} onOpenChange={setDialog}><DialogTrigger asChild><Button variant="brand"><Plus/>طلب جديد</Button></DialogTrigger><DialogContent dir="rtl" className="sm:max-w-lg"><DialogHeader><DialogTitle>إنشاء طلب جديد</DialogTitle><DialogDescription>أدخل المعلومات الأساسية. يمكنك إضافة العمال والمستندات بعد الحفظ.</DialogDescription></DialogHeader><form onSubmit={createOrder} className="space-y-4"><div><Label>عنوان الطلب</Label><Input value={title} onChange={e=>setTitle(e.target.value)} required className="mt-2"/></div><div><Label>تفاصيل الطلب</Label><Textarea value={description} onChange={e=>setDescription(e.target.value)} required className="mt-2 min-h-28"/></div><div><Label>تاريخ ووقت بدء العمل</Label><Input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} required className="mt-2"/></div><Button variant="brand" className="w-full" disabled={saving}>{saving?"جارٍ الحفظ...":"حفظ الطلب"}</Button></form></DialogContent></Dialog></div>
          <section className="glass-panel flex flex-wrap items-center gap-2 rounded-2xl p-3"><span className="px-2 text-xs font-semibold text-muted-foreground">فلترة:</span>{["هذا الأسبوع","الأسبوع السابق","الشهر الحالي","الحالة: الكل","العامل: الكل"].map((x,i)=><Button key={x} variant={i===0?"default":"glass"} size="sm">{x}</Button>)}</section>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["إجمالي الطلبات",orders.length,"text-foreground"],["قيد التنفيذ",count("IN_PROGRESS"),"text-primary"],["بانتظار المستندات",count("WAITING_DOCUMENTS"),"text-amber-600"],["مغلقة / مؤرشفة",count("CLOSED")+count("ARCHIVED"),"text-emerald-600"]].map(([l,n,c])=><div key={String(l)} className="glass-panel rounded-2xl p-4 lg:p-5"><p className="text-xs text-muted-foreground">{l}</p><p className={`num-font mt-2 text-3xl font-bold ${c}`}>{n}</p><p className="mt-1 text-[11px] text-muted-foreground">بيانات مباشرة</p></div>)}</section>
          <section className="grid gap-5 xl:grid-cols-3"><div className="glass-panel overflow-hidden rounded-2xl xl:col-span-2"><div className="flex items-center justify-between border-b border-border p-5"><div><h2 className="font-bold">أحدث الطلبات</h2><p className="text-xs text-muted-foreground">{visible.length} سجل</p></div><Button variant="glass" size="sm">تصدير تقرير</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-right text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-4">رقم الطلب</th><th>العنوان</th><th>الحالة</th><th>تاريخ الإنشاء</th><th className="pl-4">إجراء</th></tr></thead><tbody>{loading?<tr><td colSpan={5} className="p-12 text-center text-muted-foreground">جارٍ تحميل الطلبات...</td></tr>:visible.length===0?<tr><td colSpan={5} className="p-12 text-center"><BriefcaseBusiness className="mx-auto mb-3 size-8 text-muted-foreground"/><p className="font-semibold">لا توجد طلبات بعد</p><p className="mt-1 text-xs text-muted-foreground">ابدأ بإنشاء أول طلب عمل</p></td></tr>:visible.map(o=><tr key={o.id} className="border-b border-border/70 hover:bg-card"><td className="num-font p-4 font-semibold text-primary">{o.order_number}</td><td className="font-medium">{o.title}</td><td><span className={`status-badge ${statusClass[o.status]}`}>{statusLabel[o.status]}</span></td><td className="num-font text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("ar-IQ")}</td><td className="pl-4"><Button variant="glass" size="icon"><ChevronLeft/></Button></td></tr>)}</tbody></table></div></div>
            <div className="glass-panel rounded-2xl p-5"><div className="flex items-center justify-between"><h2 className="font-bold">قائمة الإغلاق</h2><span className="text-xs text-muted-foreground">نموذج التحقق</span></div><div className="mt-5 space-y-3">{[[true,"بيانات الطلب الأساسية"],[true,"العمال المرتبطون"],[true,"توثيق رقم الطلب"],[false,"أوراق التواقيع"],[false,"إثبات عمل العمال"]].map(([ok,label])=><div key={String(label)} className="flex items-center gap-2 text-sm"><span className={`grid size-5 place-items-center rounded-full text-xs ${ok?"bg-emerald-100 text-emerald-700":"bg-rose-100 text-rose-700"}`}>{ok?"✓":"×"}</span>{label}</div>)}</div><div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">لا يمكن إغلاق الطلب قبل استكمال المستندات الإلزامية.</div><Button className="mt-4 w-full" disabled>إغلاق الطلب</Button></div>
          </section>
        </main>
      </div>
    </div>
  </div>;
}