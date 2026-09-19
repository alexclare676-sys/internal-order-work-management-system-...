import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, ShieldCheck, UserCheck, UserX, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { roleBadgeClass, roleLabel, type AppRole, type CurrentUser } from "@/lib/dashboard";

type ManagedUser = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  department: string | null;
  job_title: string | null;
  is_active: boolean;
  created_at: string;
  role: AppRole;
};

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "إدارة المستخدمين | مدار" },
      { name: "description", content: "إدارة حسابات الموظفين والأدوار" },
    ],
  }),
  beforeLoad: ({ context }) => {
    const u = (context as { user: CurrentUser }).user;
    if (!u?.canManageUsers) throw redirect({ to: "/dashboard" });
  },
  component: UsersPage,
});

function UsersPage() {
  const { user } = Route.useRouteContext() as { user: CurrentUser };
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("employee");
  const [department, setDepartment] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");

  async function loadUsers() {
    setLoading(true);
    // 1) جلب كل المستخدمين من auth (via service role isn't available client-side; use profiles)
    const { data: profiles, error: pErr } = await supabase.from("profiles").select("id,full_name,phone,department,job_title,is_active,created_at");
    if (pErr) { toast.error("تعذر تحميل الملفات"); setLoading(false); return; }

    // 2) جلب أدوار كل مستخدم
    const { data: roles } = await supabase.from("user_roles").select("user_id,role");

    const roleMap = new Map<string, AppRole>();
    (roles ?? []).forEach((r: { user_id: string; role: AppRole }) => {
      const existing = roleMap.get(r.user_id);
      const rank: Record<AppRole, number> = { administrator: 4, manager: 3, employee: 2, viewer: 1 };
      if (!existing || rank[r.role] > rank[existing]) roleMap.set(r.user_id, r.role);
    });

    // 3) نحتاج الإيميل من auth - لكن لا يمكن للعميل الوصول لـ auth.admin
    // لذا نعتمد على profile + نحاول جلب الإيميل من auth.users عبر RPC إن وجدت
    // كبديل، نعرض المستخدمين المعروفين من profiles
    const list: ManagedUser[] = (profiles ?? []).map((p) => ({
      id: p.id,
      email: "", // لا يمكن الوصول للإيميل من العميل
      full_name: p.full_name,
      phone: p.phone,
      department: p.department,
      job_title: p.job_title,
      is_active: p.is_active,
      created_at: p.created_at,
      role: roleMap.get(p.id) ?? "viewer",
    }));

    setUsers(list);
    setLoading(false);
  }

  useEffect(() => { void loadUsers(); }, []);

  const visible = useMemo(
    () => users.filter((u) => `${u.full_name} ${u.phone ?? ""} ${u.department ?? ""} ${u.job_title ?? ""}`.toLowerCase().includes(query.toLowerCase())),
    [users, query]
  );

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.role === "administrator").length,
    active: users.filter((u) => u.is_active).length,
    inactive: users.filter((u) => !u.is_active).length,
  }), [users]);

  function resetForm() {
    setEmail(""); setPassword(""); setFullName(""); setRole("employee");
    setDepartment(""); setJobTitle(""); setPhone("");
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // 1) أنشئ المستخدم في Supabase Auth (client-side sign-up)
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (authErr || !authData.user) {
      toast.error("تعذر إنشاء الحساب: " + (authErr?.message ?? "خطأ غير معروف"));
      setSaving(false);
      return;
    }
    const newUserId = authData.user.id;

    // 2) حدّث profile
    await supabase.from("profiles").upsert({
      id: newUserId,
      full_name: fullName,
      phone: phone || null,
      department: department || null,
      job_title: jobTitle || null,
      is_active: true,
    });

    // 3) عيّن الدور
    await supabase.from("user_roles").insert({
      user_id: newUserId,
      role,
      created_by: user.id,
    });

    toast.success("تم إنشاء الحساب بنجاح. المستخدم قد يحتاج لتأكيد الإيميل.");
    setSaving(false);
    setDialog(false);
    resetForm();
    void loadUsers();
  }

  async function changeRole(u: ManagedUser, newRole: AppRole) {
    if (u.role === newRole) return;
    if (u.role === "administrator" && stats.admins === 1) {
      toast.error("لا يمكن تعديل آخر مدير نظام");
      return;
    }
    // احذف الدور القديم وأضف الجديد
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", u.id).eq("role", u.role);
    if (delErr) { toast.error("تعذر تحديث الدور"); return; }
    const { error: insErr } = await supabase.from("user_roles").insert({ user_id: u.id, role: newRole, created_by: user.id });
    if (insErr) { toast.error("تعذر تعيين الدور الجديد"); return; }
    toast.success("تم تحديث الدور");
    void loadUsers();
  }

  async function toggleActive(u: ManagedUser) {
    if (u.role === "administrator" && stats.admins === 1 && u.is_active) {
      toast.error("لا يمكن تعطيل آخر مدير نظام");
      return;
    }
    const { error } = await supabase.from("profiles").update({ is_active: !u.is_active }).eq("id", u.id);
    if (error) { toast.error("تعذر التحديث"); return; }
    toast.success(u.is_active ? "تم تعطيل المستخدم" : "تم تفعيل المستخدم");
    void loadUsers();
  }

  return (
    <DashboardShell user={user} search={query} onSearchChange={setQuery} activePath="/users">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إدارة المستخدمين</h1>
          <p className="mt-1 text-sm text-muted-foreground">إنشاء وإدارة حسابات الموظفين والأدوار</p>
        </div>
        <Button variant="brand" onClick={() => { resetForm(); setDialog(true); }}><Plus />مستخدم جديد</Button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["إجمالي المستخدمين", stats.total, "text-foreground"],
          ["مديرو النظام", stats.admins, "text-primary"],
          ["نشط", stats.active, "text-emerald-600"],
          ["معطّل", stats.inactive, "text-rose-600"],
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
            <h2 className="font-bold">قائمة المستخدمين</h2>
            <p className="text-xs text-muted-foreground">{visible.length} سجل</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-right text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-4">الاسم</th>
                <th>القسم</th>
                <th>المسمى الوظيفي</th>
                <th>الدور</th>
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
                    <UsersIcon className="mx-auto mb-3 size-8 text-muted-foreground" />
                    <p className="font-semibold">لا يوجد مستخدمون</p>
                  </td>
                </tr>
              ) : visible.map((u) => (
                <tr key={u.id} className="border-b border-border/70 hover:bg-card">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{u.full_name.charAt(0)}</div>
                      <div>
                        <p className="font-medium">{u.full_name}</p>
                        <p className="num-font text-[11px] text-muted-foreground">{new Date(u.created_at).toLocaleDateString("ar-IQ")}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-xs">{u.department ?? "—"}</td>
                  <td className="text-xs">{u.job_title ?? "—"}</td>
                  <td>
                    <Select value={u.role} onValueChange={(v) => void changeRole(u, v as AppRole)}>
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${roleBadgeClass[u.role]}`}>{roleLabel[u.role]}</span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="administrator">مدير النظام</SelectItem>
                        <SelectItem value="manager">مدير</SelectItem>
                        <SelectItem value="employee">موظف</SelectItem>
                        <SelectItem value="viewer">مشاهد</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${u.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                      {u.is_active ? "نشط" : "معطّل"}
                    </span>
                  </td>
                  <td className="pl-4">
                    <Button variant="glass" size="icon" onClick={() => void toggleActive(u)}>
                      {u.is_active ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
                    </Button>
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
            <DialogTitle>إنشاء مستخدم جديد</DialogTitle>
            <DialogDescription>أدخل بيانات الحساب. سيُنشأ في Supabase Auth ويُعين له الدور المحدد.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createUser} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الاسم الكامل *</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-2" />
              </div>
              <div>
                <Label>الإيميل *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" className="mt-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>كلمة المرور *</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} dir="ltr" className="mt-2" />
              </div>
              <div>
                <Label>الدور</Label>
                <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administrator">مدير النظام</SelectItem>
                    <SelectItem value="manager">مدير</SelectItem>
                    <SelectItem value="employee">موظف</SelectItem>
                    <SelectItem value="viewer">مشاهد</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>القسم</Label>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label>المسمى الوظيفي</Label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="mt-2" />
              </div>
            </div>
            <div>
              <Label>الهاتف</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="mt-2" />
            </div>
            <DialogFooter>
              <Button type="button" variant="glass" onClick={() => setDialog(false)}>إلغاء</Button>
              <Button type="submit" variant="brand" disabled={saving}>
                <ShieldCheck className="size-4" />
                {saving ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
