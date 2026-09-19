import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import type { CurrentUser } from "@/lib/dashboard";

type Worker = {
  id: string;
  worker_number: string | null;
  full_name: string;
  phone: string | null;
  specialty: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/workers")({
  head: () => ({
    meta: [
      { title: "إدارة العمال | مدار" },
      { name: "description", content: "إدارة بيانات العمال والشغيلة" },
    ],
  }),
  component: WorkersPage,
});

function WorkersPage() {
  const { user } = Route.useRouteContext() as { user: CurrentUser };
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Worker | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [fullName, setFullName] = useState("");
  const [workerNumber, setWorkerNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [notes, setNotes] = useState("");

  async function loadWorkers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("workers")
      .select("id,worker_number,full_name,phone,specialty,is_active,notes,created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) toast.error("تعذر تحميل العمال");
    else setWorkers(data ?? []);
    setLoading(false);
  }

  useEffect(() => { void loadWorkers(); }, []);

  const visible = useMemo(
    () => workers.filter((w) => `${w.worker_number ?? ""} ${w.full_name} ${w.phone ?? ""} ${w.specialty ?? ""}`.toLowerCase().includes(query.toLowerCase())),
    [workers, query]
  );

  const stats = useMemo(() => ({
    total: workers.length,
    active: workers.filter((w) => w.is_active).length,
    inactive: workers.filter((w) => !w.is_active).length,
    specialties: new Set(workers.map((w) => w.specialty).filter(Boolean)).size,
  }), [workers]);

  function resetForm() {
    setFullName(""); setWorkerNumber(""); setPhone(""); setSpecialty(""); setNotes(""); setEditing(null);
  }

  function openNew() {
    resetForm();
    setDialog(true);
  }

  function openEdit(w: Worker) {
    setEditing(w);
    setFullName(w.full_name);
    setWorkerNumber(w.worker_number ?? "");
    setPhone(w.phone ?? "");
    setSpecialty(w.specialty ?? "");
    setNotes(w.notes ?? "");
    setDialog(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user.canManageOrders) { toast.error("ليس لديك صلاحية"); return; }
    setSaving(true);
    const payload = {
      full_name: fullName.trim(),
      worker_number: workerNumber.trim() || null,
      phone: phone.trim() || null,
      specialty: specialty.trim() || null,
      notes: notes.trim() || null,
      updated_by: user.id,
    };
    let result;
    if (editing) {
      result = await supabase.from("workers").update(payload).eq("id", editing.id);
    } else {
      result = await supabase.from("workers").insert({ ...payload, created_by: user.id });
    }
    setSaving(false);
    if (result.error) {
      toast.error("تعذر الحفظ: " + result.error.message);
      return;
    }
    toast.success(editing ? "تم تحديث بيانات العامل" : "تمت إضافة العامل بنجاح");
    setDialog(false);
    resetForm();
    void loadWorkers();
  }

  async function toggleActive(w: Worker) {
    const { error } = await supabase.from("workers").update({ is_active: !w.is_active, updated_by: user.id }).eq("id", w.id);
    if (error) toast.error("تعذر التحديث");
    else { toast.success(w.is_active ? "تم تعطيل العامل" : "تم تفعيل العامل"); void loadWorkers(); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("workers").update({ deleted_at: new Date().toISOString(), deleted_by: user.id, is_active: false }).eq("id", deleteTarget.id);
    setDeleteTarget(null);
    if (error) toast.error("تعذر الحذف: " + error.message);
    else { toast.success("تم حذف العامل"); void loadWorkers(); }
  }

  return (
    <DashboardShell user={user} search={query} onSearchChange={setQuery} activePath="/workers">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إدارة العمال</h1>
          <p className="mt-1 text-sm text-muted-foreground">إدارة بيانات العمال والشغيلة المرتبطين بالطلبات</p>
        </div>
        {user.canManageOrders && (
          <Button variant="brand" onClick={openNew}><Plus />عامل جديد</Button>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["إجمالي العمال", stats.total, "text-foreground"],
          ["عامل نشط", stats.active, "text-emerald-600"],
          ["عامل معطّل", stats.inactive, "text-rose-600"],
          ["التخصصات", stats.specialties, "text-primary"],
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
            <h2 className="font-bold">قائمة العمال</h2>
            <p className="text-xs text-muted-foreground">{visible.length} سجل</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-right text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-4">الاسم</th>
                <th>رقم العامل</th>
                <th>التخصص</th>
                <th>الهاتف</th>
                <th>الحالة</th>
                <th className="pl-4">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">جارٍ التحميل...</td></tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <Users className="mx-auto mb-3 size-8 text-muted-foreground" />
                    <p className="font-semibold">لا يوجد عمال</p>
                    <p className="mt-1 text-xs text-muted-foreground">أضف أول عامل للبدء</p>
                  </td>
                </tr>
              ) : visible.map((w) => (
                <tr key={w.id} className="border-b border-border/70 hover:bg-card">
                  <td className="p-4 font-medium">{w.full_name}</td>
                  <td className="num-font text-xs text-muted-foreground">{w.worker_number ?? "—"}</td>
                  <td className="text-xs">{w.specialty ?? "—"}</td>
                  <td className="num-font text-xs" dir="ltr">{w.phone ?? "—"}</td>
                  <td>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${w.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                      {w.is_active ? "نشط" : "معطّل"}
                    </span>
                  </td>
                  <td className="pl-4">
                    <div className="flex items-center gap-1">
                      <Button variant="glass" size="icon" onClick={() => openEdit(w)} aria-label="تعديل"><Pencil className="size-3.5" /></Button>
                      <Button variant="glass" size="icon" onClick={() => void toggleActive(w)} aria-label={w.is_active ? "تعطيل" : "تفعيل"}>
                        {w.is_active ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
                      </Button>
                      {user.canManageUsers && (
                        <Button variant="glass" size="icon" onClick={() => setDeleteTarget(w)} aria-label="حذف"><Trash2 className="size-3.5 text-rose-600" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={(o) => { setDialog(o); if (!o) resetForm(); }}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل بيانات العامل" : "إضافة عامل جديد"}</DialogTitle>
            <DialogDescription>{editing ? "عدّل بيانات العامل واضغط حفظ" : "أدخل بيانات العامل الجديد"}</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الاسم الكامل *</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-2" />
              </div>
              <div>
                <Label>رقم العامل</Label>
                <Input value={workerNumber} onChange={(e) => setWorkerNumber(e.target.value)} placeholder="W-0001" className="mt-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>التخصص</Label>
                <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="كهربائي، نجار..." className="mt-2" />
              </div>
              <div>
                <Label>رقم الهاتف</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="07XX XXX XXXX" className="mt-2" />
              </div>
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2 min-h-20" />
            </div>
            <Button variant="brand" className="w-full" disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف العامل "{deleteTarget?.full_name}"؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف نهائي</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
}
