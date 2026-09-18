import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) return { signedIn: true };
    return { signedIn: false };
  },
  head: () => ({ meta: [
    { title: "تسجيل الدخول | مدار" },
    { name: "description", content: "الدخول الآمن إلى نظام مدار الداخلي" },
    { property: "og:title", content: "تسجيل الدخول | مدار" },
    { property: "og:description", content: "الدخول الآمن إلى نظام مدار الداخلي" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { signedIn } = Route.useRouteContext();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  if (signedIn) {
    void navigate({ to: "/dashboard", replace: true });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true);
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
    setLoading(false);
    if (result.error) return toast.error(result.error.message);
    if (mode === "signup" && !result.data.session) return toast.success("تم إنشاء الحساب. تحقق من بريدك لتأكيده.");
    await navigate({ to: "/dashboard", replace: true });
  }

  async function googleLogin() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error("تعذر تسجيل الدخول عبر Google");
    else if (!result.redirected) await navigate({ to: "/dashboard" });
  }

  return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background p-5">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_36%),radial-gradient(circle_at_90%_70%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_34%)]" />
    <section className="glass-panel relative w-full max-w-md rounded-3xl p-7 sm:p-9">
      <div className="mb-7 flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20">م</div><div><h1 className="font-bold">نظام مدار</h1><p className="text-xs text-muted-foreground">إدارة الطلبات والأعمال</p></div></div>
      <div className="mb-6"><h2 className="text-2xl font-bold">{mode === "login" ? "مرحباً بعودتك" : "إنشاء حساب الموظف"}</h2><p className="mt-1 text-sm text-muted-foreground">الدخول إلى بيئة العمل الداخلية الآمنة</p></div>
      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم الكامل" required className="h-11 rounded-xl bg-background/70" />}
        <div className="relative"><Mail className="absolute right-3 top-3 size-4 text-muted-foreground"/><Input dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@company.com" required className="h-11 rounded-xl bg-background/70 pr-10" /></div>
        <div className="relative"><LockKeyhole className="absolute right-3 top-3 size-4 text-muted-foreground"/><Input dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" minLength={8} required className="h-11 rounded-xl bg-background/70 pr-10" /></div>
        <Button variant="brand" className="w-full" disabled={loading}>{loading ? "جارٍ التحقق..." : mode === "login" ? "تسجيل الدخول" : "إنشاء الحساب"}</Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">أو</div>
      <Button variant="glass" className="w-full" onClick={googleLogin}><ShieldCheck/> المتابعة باستخدام Google</Button>
      <button className="mt-6 w-full text-sm text-primary" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "إنشاء حساب جديد" : "لديك حساب؟ تسجيل الدخول"}</button>
    </section>
  </main>;
}