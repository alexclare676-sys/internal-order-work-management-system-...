import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Calendar, Clock, Hash, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import type { CurrentUser } from "@/lib/dashboard";

type SettingRow = {
  key: string;
  value: unknown;
  label_ar: string;
};

const DAY_OPTIONS = [
  { value: 0, label: "الأحد" },
  { value: 1, label: "الاثنين" },
  { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" },
  { value: 4, label: "الخميس" },
  { value: 5, label: "الجمعة" },
  { value: 6, label: "السبت" },
];

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات | مدار" },
      { name: "description", content: "إعدادات النظام" },
    ],
  }),
  beforeLoad: ({ context }) => {
    const u = (context as { user: CurrentUser }).user;
    if (!u?.canManageUsers) throw redirect({ to: "/dashboard" });
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext() as { user: CurrentUser };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("settings").select("key,value,label_ar");
    if (error) { toast.error("تعذر تحميل الإعدادات"); setLoading(false); return; }
    const map: Record<string, unknown> = {};
    const lbl: Record<string, string> = {};
    (data ?? []).forEach((r: SettingRow) => {
      map[r.key] = r.value;
      lbl[r.key] = r.label_ar;
    });
    // defaults
    if (!("company_name" in map)) map["company_name"] = "المؤسسة";
    if (!("timezone" in map)) map["timezone"] = "Asia/Baghdad";
    if (!("work_days" in map)) map["work_days"] = [1, 2, 3, 4, 5];
    if (!("work_hours" in map)) map["work_hours"] = { start: "08:00", end: "16:00" };
    if (!("order_numbering" in map)) map["order_numbering"] = { prefix: "ORD-", padding: 6 };
    setSettings(map);
    setLabels(lbl);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function set<K extends string>(key: K, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value: value as never,
      label_ar: labels[key] ?? key,
      updated_by: user.id,
    }));
    const { error } = await supabase.from("settings").upsert(updates, { onConflict: "key" });
    setSaving(false);
    if (error) { toast.error("تعذر الحفظ: " + error.message); return; }
    toast.success("تم حفظ الإعدادات بنجاح");
  }

  const workDays = (settings["work_days"] as number[]) ?? [];
  const workHours = (settings["work_hours"] as { start: string; end: string }) ?? { start: "08:00", end: "16:00" };
  const orderNumbering = (settings["order_numbering"] as { prefix: string; padding: number }) ?? { prefix: "ORD-", padding: 6 };

  return (
    <DashboardShell user={user} activePath="/settings">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إعدادات النظام</h1>
          <p className="mt-1 text-sm text-muted-foreground">تعديل إعدادات النظام الأساسية</p>
        </div>
        <Button variant="brand" onClick={() => void save()} disabled={loading || saving}>
          <Save className="size-4" />
          {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
        </Button>
      </div>

      {loading ? (
        <div className="glass-panel rounded-2xl p-12 text-center text-muted-foreground">جارٍ التحميل...</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Company info */}
          <Card className="glass-panel">
            <CardHeader>
              <div className="flex items-center gap-2"><Building2 className="size-5 text-primary" /><CardTitle>معلومات الشركة</CardTitle></div>
              <CardDescription>الاسم والمنطقة الزمنية</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>اسم الشركة</Label>
                <Input value={String(settings["company_name"] ?? "")} onChange={(e) => set("company_name", e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label>المنطقة الزمنية</Label>
                <Select value={String(settings["timezone"] ?? "Asia/Baghdad")} onValueChange={(v) => set("timezone", v)}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Baghdad">بغداد (GMT+3)</SelectItem>
                    <SelectItem value="Asia/Riyadh">الرياض (GMT+3)</SelectItem>
                    <SelectItem value="Asia/Dubai">دبي (GMT+4)</SelectItem>
                    <SelectItem value="Asia/Amman">عمّان (GMT+3)</SelectItem>
                    <SelectItem value="Asia/Beirut">بيروت (GMT+3)</SelectItem>
                    <SelectItem value="Asia/Cairo">القاهرة (GMT+2)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Work days */}
          <Card className="glass-panel">
            <CardHeader>
              <div className="flex items-center gap-2"><Calendar className="size-5 text-primary" /><CardTitle>أيام العمل</CardTitle></div>
              <CardDescription>أيام الأسبوع التي يعمل فيها النظام</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {DAY_OPTIONS.map((d) => {
                  const checked = workDays.includes(d.value);
                  return (
                    <label key={d.value} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm cursor-pointer hover:bg-muted">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = v ? [...workDays, d.value].sort() : workDays.filter((x) => x !== d.value);
                          set("work_days", next);
                        }}
                      />
                      {d.label}
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Work hours */}
          <Card className="glass-panel">
            <CardHeader>
              <div className="flex items-center gap-2"><Clock className="size-5 text-primary" /><CardTitle>ساعات العمل</CardTitle></div>
              <CardDescription>بداية ونهاية الدوام الرسمي</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label>بداية الدوام</Label>
                <Input type="time" value={workHours.start} onChange={(e) => set("work_hours", { ...workHours, start: e.target.value })} className="mt-2" />
              </div>
              <div>
                <Label>نهاية الدوام</Label>
                <Input type="time" value={workHours.end} onChange={(e) => set("work_hours", { ...workHours, end: e.target.value })} className="mt-2" />
              </div>
            </CardContent>
          </Card>

          {/* Order numbering */}
          <Card className="glass-panel">
            <CardHeader>
              <div className="flex items-center gap-2"><Hash className="size-5 text-primary" /><CardTitle>ترقيم الطلبات</CardTitle></div>
              <CardDescription>صيغة رقم الطلب (مثال: ORD-000001)</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label>البادئة</Label>
                <Input value={orderNumbering.prefix} onChange={(e) => set("order_numbering", { ...orderNumbering, prefix: e.target.value })} className="mt-2" dir="ltr" />
              </div>
              <div>
                <Label>عدد الأرقام</Label>
                <Select value={String(orderNumbering.padding)} onValueChange={(v) => set("order_numbering", { ...orderNumbering, padding: Number(v) })}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4 (مثال: 0001)</SelectItem>
                    <SelectItem value="5">5 (مثال: 00001)</SelectItem>
                    <SelectItem value="6">6 (مثال: 000001)</SelectItem>
                    <SelectItem value="7">7 (مثال: 0000001)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
