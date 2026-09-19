import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { canTransitionTo, statusClass, statusLabel, validTransitions, type CurrentUser } from "@/lib/dashboard";

type OrderStatus = "OPEN" | "IN_PROGRESS" | "WAITING_DOCUMENTS" | "PENDING_REVIEW" | "CLOSED" | "ARCHIVED";

type Order = {
  id: string;
  order_number: string;
  title: string;
  description: string;
  work_details: string | null;
  notes: string | null;
  status: OrderStatus;
  work_start_at: string | null;
  work_end_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
};

type Worker = { id: string; worker_number: string | null; full_name: string; specialty: string | null; is_active: boolean };

type OrderWorker = {
  id: string;
  worker_id: string;
  assigned_at: string;
  worker: Worker;
};

type DocumentType = {
  id: string;
  code: string;
  name_ar: string;
  is_required_for_closure: boolean;
  allowed_mime_types: string[];
  max_size_mb: number;
  is_active: boolean;
};

type OrderDocument = {
  id: string;
  document_type_id: string;
  current_version: number;
  updated_at: string;
  latest_version: {
    file_name: string;
    mime_type: string;
    file_size: number;
    storage_path: string;
    uploaded_at: string;
    uploaded_by: string;
  } | null;
};

type StatusHistoryEntry = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  changed_by: string;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/orders/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل الطلب | مدار" },
      { name: "description", content: "عرض وتعديل تفاصيل الطلب" },
    ],
  }),
  component: OrderDetailsPage,
});

function OrderDetailsPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext() as { user: CurrentUser };
  const navigate = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderWorkers, setOrderWorkers] = useState<OrderWorker[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [documents, setDocuments] = useState<OrderDocument[]>([]);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [allWorkers, setAllWorkers] = useState<Worker[]>([]);
  const [addWorkerDialog, setAddWorkerDialog] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [editDialog, setEditDialog] = useState(false);
  const [statusDialog, setStatusDialog] = useState(false);
  const [targetStatus, setTargetStatus] = useState<OrderStatus | "">("");
  const [statusNote, setStatusNote] = useState("");

  // edit form
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editWorkDetails, setEditWorkDetails] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    setLoading(true);
    // load order
    const { data: o, error: oErr } = await supabase.from("orders").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
    if (oErr || !o) { toast.error("تعذر تحميل الطلب"); setLoading(false); return; }
    setOrder(o as Order);
    setEditTitle(o.title);
    setEditDesc(o.description);
    setEditWorkDetails(o.work_details ?? "");
    setEditNotes(o.notes ?? "");
    setEditStart(o.work_start_at ? new Date(o.work_start_at).toISOString().slice(0, 16) : "");
    setEditEnd(o.work_end_at ? new Date(o.work_end_at).toISOString().slice(0, 16) : "");

    // load workers on order
    const { data: ow } = await supabase
      .from("order_workers")
      .select("id,worker_id,assigned_at,worker:workers(id,worker_number,full_name,specialty,is_active)")
      .eq("order_id", id)
      .is("deleted_at", null);
    setOrderWorkers((ow ?? []) as unknown as OrderWorker[]);

    // load all active workers for dropdown
    const { data: w } = await supabase.from("workers").select("id,worker_number,full_name,specialty,is_active").is("deleted_at", null).eq("is_active", true).order("full_name");
    setAllWorkers((w ?? []) as Worker[]);

    // load document types
    const { data: dt } = await supabase.from("document_types").select("*").eq("is_active", true).order("is_required_for_closure", { ascending: false });
    setDocumentTypes((dt ?? []) as DocumentType[]);

    // load documents with their latest version
    const { data: docs } = await supabase.from("documents").select("id,document_type_id,current_version,updated_at").eq("order_id", id).is("deleted_at", null);
    const docsList = (docs ?? []) as OrderDocument[];
    // fetch latest version for each
    const withVersions: OrderDocument[] = [];
    for (const d of docsList) {
      const { data: v } = await supabase
        .from("document_versions")
        .select("file_name,mime_type,file_size,storage_path,uploaded_at,uploaded_by")
        .eq("document_id", d.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      withVersions.push({ ...d, latest_version: v as OrderDocument["latest_version"] });
    }
    setDocuments(withVersions);

    // load history
    const { data: h } = await supabase.from("order_status_history").select("id,from_status,to_status,note,changed_by,created_at").eq("order_id", id).order("created_at", { ascending: false });
    setHistory((h ?? []) as StatusHistoryEntry[]);

    setLoading(false);
  }

  useEffect(() => { void loadAll(); }, [id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const closureChecklist = useMemo(() => {
    if (!order) return [];
    const required = documentTypes.filter((dt) => dt.is_required_for_closure);
    return required.map((dt) => {
      const doc = documents.find((d) => d.document_type_id === dt.id);
      return { typeId: dt.id, name: dt.name_ar, code: dt.code, done: !!doc };
    });
  }, [order, documentTypes, documents]);

  const allRequiredUploaded = closureChecklist.length > 0 && closureChecklist.every((c) => c.done);
  const hasWorkers = orderWorkers.length > 0;
  const canClose = allRequiredUploaded && hasWorkers && order?.status === "PENDING_REVIEW";

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    setSaving(true);
    const { error } = await supabase.from("orders").update({
      title: editTitle,
      description: editDesc,
      work_details: editWorkDetails || null,
      notes: editNotes || null,
      work_start_at: editStart ? new Date(editStart).toISOString() : null,
      work_end_at: editEnd ? new Date(editEnd).toISOString() : null,
      updated_by: user.id,
    }).eq("id", order.id);
    setSaving(false);
    if (error) { toast.error("تعذر الحفظ: " + error.message); return; }
    toast.success("تم تحديث الطلب");
    setEditDialog(false);
    void loadAll();
  }

  async function addWorker() {
    if (!selectedWorkerId || !order) return;
    const already = orderWorkers.some((ow) => ow.worker_id === selectedWorkerId);
    if (already) { toast.warning("العامل مضاف مسبقاً"); return; }
    const { error } = await supabase.from("order_workers").insert({
      order_id: order.id,
      worker_id: selectedWorkerId,
      created_by: user.id,
      updated_by: user.id,
    });
    if (error) { toast.error("تعذر إضافة العامل: " + error.message); return; }
    toast.success("تمت إضافة العامل للطلب");
    setAddWorkerDialog(false); setSelectedWorkerId("");
    void loadAll();
  }

  async function removeWorker(owId: string) {
    const { error } = await supabase.from("order_workers").update({ deleted_at: new Date().toISOString(), deleted_by: user.id }).eq("id", owId);
    if (error) { toast.error("تعذر الحذف"); return; }
    toast.success("تمت إزالة العامل");
    void loadAll();
  }

  async function handleFileUpload(file: File, docTypeId: string) {
    if (!order) return;
    const dt = documentTypes.find((d) => d.id === docTypeId);
    if (!dt) return;
    if (!dt.allowed_mime_types.includes(file.type)) {
      toast.error(`صيغة غير مدعومة. المسموح: ${dt.allowed_mime_types.join(", ")}`);
      return;
    }
    if (file.size > dt.max_size_mb * 1024 * 1024) {
      toast.error(`حجم الملف يتجاوز ${dt.max_size_mb}MB`);
      return;
    }
    setUploadingFor(docTypeId);
    try {
      // check if document exists
      const { data: existing } = await supabase.from("documents").select("id,current_version").eq("order_id", order.id).eq("document_type_id", docTypeId).maybeSingle();
      let docId: string;
      let versionNumber: number;
      if (existing) {
        docId = (existing as { id: string; current_version: number }).id;
        versionNumber = (existing as { current_version: number }).current_version + 1;
      } else {
        const { data: newDoc, error: newDocErr } = await supabase.from("documents").insert({
          order_id: order.id,
          document_type_id: docTypeId,
          current_version: 1,
          created_by: user.id,
          updated_by: user.id,
        }).select().single();
        if (newDocErr || !newDoc) { toast.error("تعذر إنشاء المستند"); setUploadingFor(null); return; }
        docId = (newDoc as { id: string }).id;
        versionNumber = 1;
      }
      const filePath = `${order.id}/${docTypeId}/v${versionNumber}-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("order-documents").upload(filePath, file, { cacheControl: "3600", upsert: false });
      if (upErr) { toast.error("تعذر رفع الملف: " + upErr.message); setUploadingFor(null); return; }
      const { error: verErr } = await supabase.from("document_versions").insert({
        document_id: docId,
        version_number: versionNumber,
        file_name: file.name,
        storage_path: filePath,
        mime_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
      });
      if (verErr) { toast.error("تعذر تسجيل الإصدار"); setUploadingFor(null); return; }
      await supabase.from("documents").update({ current_version: versionNumber, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", docId);
      toast.success(`تم رفع الملف (إصدار ${versionNumber})`);
      void loadAll();
    } catch (e) {
      toast.error("خطأ غير متوقع");
    } finally {
      setUploadingFor(null);
    }
  }

  async function changeStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!order || !targetStatus) return;
    if (!canTransitionTo(order.status, targetStatus)) {
      toast.error("انتقال غير صالح");
      return;
    }
    const updatePayload: {
      status: OrderStatus;
      updated_by: string;
      notes?: string;
    } = {
      status: targetStatus as OrderStatus,
      updated_by: user.id,
    };
    if (statusNote) {
      updatePayload.notes = (order.notes ?? "") + `\n[${new Date().toISOString()}] ${statusNote}`;
    }
    const { error } = await supabase.from("orders").update(updatePayload).eq("id", order.id);
    if (error) {
      toast.error("تعذر تغيير الحالة: " + error.message);
      return;
    }
    toast.success("تم تحديث حالة الطلب");
    setStatusDialog(false); setTargetStatus(""); setStatusNote("");
    void loadAll();
  }

  if (loading || !order) {
    return (
      <DashboardShell user={user} activePath="/dashboard">
        <div className="glass-panel rounded-2xl p-12 text-center text-muted-foreground">جارٍ تحميل الطلب...</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell user={user} activePath="/dashboard">
      {/* Breadcrumb + Title */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={() => void navigate({ to: "/dashboard" })}>
            <ArrowRight className="size-3.5" /> رجوع للوحة
          </Button>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="num-font rounded-lg bg-primary/10 px-3 py-1 text-sm font-bold text-primary">{order.order_number}</span>
              <span className={`status-badge ${statusClass[order.status]}`}>{statusLabel[order.status]}</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold">{order.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{order.description}</p>
          </div>
          <div className="flex gap-2">
            {user.canManageOrders && (
              <Button variant="glass" onClick={() => setEditDialog(true)}><FileText className="size-4" />تعديل</Button>
            )}
            {user.canManageOrders && order.status !== "ARCHIVED" && (
              <Button variant="brand" onClick={() => { setTargetStatus((validTransitions[order.status]?.[0] ?? "") as OrderStatus | ""); setStatusDialog(true); }}>
                <Clock className="size-4" />تغيير الحالة
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Quick info */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["العمال", orderWorkers.length, "text-primary", <Users key="u" className="size-4" />],
          ["المستندات", documents.length, "text-emerald-600", <FileText key="f" className="size-4" />],
          ["بدء العمل", order.work_start_at ? new Date(order.work_start_at).toLocaleString("ar-IQ") : "—", "text-foreground", <Clock key="c" className="size-4" />],
          ["آخر تحديث", new Date(order.updated_at).toLocaleDateString("ar-IQ"), "text-muted-foreground", <History key="h" className="size-4" />],
        ].map(([l, v, c, icon]) => (
          <div key={String(l)} className="glass-panel rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{l}</div>
            <p className={`num-font mt-2 text-xl font-bold ${c as string}`}>{v as React.ReactNode}</p>
          </div>
        ))}
      </section>

      {/* Main grid: workers + documents */}
      <section className="grid gap-5 xl:grid-cols-3">
        {/* Workers */}
        <div className="glass-panel overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="font-bold">العمال المرتبطون</h2>
              <p className="text-xs text-muted-foreground">{orderWorkers.length} عامل</p>
            </div>
            {user.canManageOrders && (
              <Button variant="glass" size="sm" onClick={() => setAddWorkerDialog(true)}><UserPlus className="size-3.5" />إضافة</Button>
            )}
          </div>
          <div className="divide-y divide-border/70">
            {orderWorkers.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Users className="mx-auto mb-2 size-7 text-muted-foreground/50" />
                لا يوجد عمال مرتبطون
              </div>
            ) : orderWorkers.map((ow) => (
              <div key={ow.id} className="flex items-center gap-3 p-4">
                <div className="grid size-9 place-items-center rounded-lg bg-muted text-xs font-bold">{ow.worker.full_name.charAt(0)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{ow.worker.full_name}</p>
                  <p className="text-xs text-muted-foreground">{ow.worker.specialty ?? "—"}</p>
                </div>
                <span className="num-font text-[11px] text-muted-foreground">{ow.worker.worker_number ?? ""}</span>
                {user.canManageOrders && (
                  <Button variant="ghost" size="icon" onClick={() => void removeWorker(ow.id)}><Trash2 className="size-3.5 text-rose-600" /></Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Documents */}
        <div className="glass-panel overflow-hidden rounded-2xl xl:col-span-2">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="font-bold">المستندات والتواقيع</h2>
              <p className="text-xs text-muted-foreground">{documents.length} / {documentTypes.length} مستند مرفوع</p>
            </div>
          </div>
          <div className="divide-y divide-border/70">
            {documentTypes.map((dt) => {
              const doc = documents.find((d) => d.document_type_id === dt.id);
              return (
                <div key={dt.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {doc?.latest_version ? (
                        <CheckCircle2 className="size-5 text-emerald-600" />
                      ) : (
                        <XCircle className="size-5 text-rose-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{dt.name_ar}</p>
                        <p className="text-xs text-muted-foreground">
                          {dt.is_required_for_closure ? "إلزامي للإغلاق" : "اختياري"} ·
                          الحد الأقصى {dt.max_size_mb}MB ·
                          {dt.allowed_mime_types.map((m) => m.split("/")[1]).join(", ")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc?.latest_version && (
                        <div className="text-left">
                          <p className="num-font text-[11px] font-medium">{doc.latest_version.file_name}</p>
                          <p className="num-font text-[10px] text-muted-foreground">
                            v{doc.current_version} · {(doc.latest_version.file_size / 1024).toFixed(1)} KB · {new Date(doc.latest_version.uploaded_at).toLocaleDateString("ar-IQ")}
                          </p>
                        </div>
                      )}
                      {user.canManageOrders && (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept={dt.allowed_mime_types.join(",")}
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f, dt.id); e.currentTarget.value = ""; }}
                          />
                          <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${uploadingFor === dt.id ? "bg-muted text-muted-foreground" : "border border-border bg-card/70 hover:bg-card"}`}>
                            <Upload className="size-3.5" />
                            {uploadingFor === dt.id ? "جارٍ الرفع..." : doc ? "استبدال" : "رفع"}
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Closure checklist + status history */}
      <section className="grid gap-5 xl:grid-cols-3">
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">قائمة التحقق للإغلاق</h2>
            <span className="text-xs text-muted-foreground">{closureChecklist.filter((c) => c.done).length}/{closureChecklist.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {closureChecklist.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مستندات إلزامية.</p>
            ) : closureChecklist.map((c) => (
              <div key={c.typeId} className="flex items-center gap-2 text-sm">
                <span className={`grid size-5 place-items-center rounded-full text-xs ${c.done ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{c.done ? "✓" : "×"}</span>
                {c.name}
              </div>
            ))}
            <div className="flex items-center gap-2 text-sm">
              <span className={`grid size-5 place-items-center rounded-full text-xs ${hasWorkers ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{hasWorkers ? "✓" : "×"}</span>
              عمال مرتبطون ({orderWorkers.length})
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {!allRequiredUploaded ? "استكمل المستندات الإلزامية أولاً." : !hasWorkers ? "أضف عمالاً للطلب." : order.status !== "PENDING_REVIEW" ? "حوّل الحالة إلى بانتظار المراجعة." : "الطلب جاهز للإغلاق ✅"}
          </div>
          <Button
            className="mt-4 w-full"
            variant={canClose ? "brand" : "default"}
            disabled={!canClose}
            onClick={async () => {
              if (!order) return;
              setTargetStatus("CLOSED"); setStatusDialog(true);
            }}
          >
            <Archive className="size-4" />إغلاق الطلب
          </Button>
        </div>

        <div className="glass-panel rounded-2xl p-5 xl:col-span-2">
          <h2 className="font-bold">سجل حالة الطلب</h2>
          <div className="mt-5 space-y-3">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد سجل.</p>
            ) : history.map((h) => (
              <div key={h.id} className="flex items-start gap-3 border-r-2 border-border pr-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`status-badge ${statusClass[h.to_status]}`}>{statusLabel[h.to_status]}</span>
                    {h.from_status && <span className="text-xs text-muted-foreground">من {statusLabel[h.from_status]}</span>}
                  </div>
                  <p className="num-font mt-1 text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("ar-IQ")}</p>
                  {h.note && <p className="mt-1 text-xs">{h.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Add Worker Dialog */}
      <Dialog open={addWorkerDialog} onOpenChange={setAddWorkerDialog}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة عامل للطلب</DialogTitle>
            <DialogDescription>اختر عاملاً من قائمة العمال النشطين</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
              <SelectTrigger><SelectValue placeholder="اختر العامل..." /></SelectTrigger>
              <SelectContent>
                {allWorkers.filter((w) => !orderWorkers.some((ow) => ow.worker_id === w.id)).map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.full_name} {w.worker_number ? `(${w.worker_number})` : ""} — {w.specialty ?? "بدون تخصص"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="brand" className="w-full" disabled={!selectedWorkerId} onClick={() => void addWorker()}>
              <UserPlus className="size-4" />إضافة للطلب
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent dir="rtl" className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>تعديل الطلب</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div>
              <Label>العنوان</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required className="mt-2" />
            </div>
            <div>
              <Label>الوصف</Label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} required className="mt-2 min-h-24" />
            </div>
            <div>
              <Label>تفاصيل العمل</Label>
              <Textarea value={editWorkDetails} onChange={(e) => setEditWorkDetails(e.target.value)} className="mt-2 min-h-20" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>بدء العمل</Label>
                <Input type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label>نهاية العمل</Label>
                <Input type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="mt-2" />
              </div>
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="mt-2 min-h-20" />
            </div>
            <Button variant="brand" className="w-full" disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Status Dialog */}
      <Dialog open={statusDialog} onOpenChange={setStatusDialog}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تغيير حالة الطلب</DialogTitle>
            <DialogDescription>الحالة الحالية: {statusLabel[order.status]}</DialogDescription>
          </DialogHeader>
          <form onSubmit={changeStatus} className="space-y-4">
            <div>
              <Label>الحالة الجديدة</Label>
              <Select value={targetStatus} onValueChange={(v) => setTargetStatus(v as OrderStatus)}>
                <SelectTrigger className="mt-2"><SelectValue placeholder="اختر الحالة..." /></SelectTrigger>
                <SelectContent>
                  {(validTransitions[order.status] ?? []).map((s) => (
                    <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ملاحظة (اختياري)</Label>
              <Textarea value={statusNote} onChange={(e) => setStatusNote(e.target.value)} className="mt-2 min-h-20" placeholder="سبب التغيير..." />
            </div>
            {targetStatus === "CLOSED" && !canClose && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                ⚠️ لا يمكن إغلاق الطلب: يجب استكمال المستندات الإلزامية وإضافة عمال أولاً.
              </div>
            )}
            <Button variant="brand" className="w-full" type="submit" disabled={!targetStatus}>تأكيد التغيير</Button>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
