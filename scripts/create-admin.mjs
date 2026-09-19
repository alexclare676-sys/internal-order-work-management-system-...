#!/usr/bin/env node
/**
 * ============================================================
 * create-admin.js - إنشاء حساب مدير النظام (Administrator)
 * نظام مدار - Internal Order & Work Management System
 * ============================================================
 *
 * الاستخدام:
 *   node scripts/create-admin.js
 *   node scripts/create-admin.js --email admin@company.com --password StrongPass123 --name "اسم المدير"
 *
 * المتطلبات:
 *   - Supabase Local يعمل (supabase start)
 *   - أو SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY مضبوطين
 *
 * السلوك:
 *   1) ينشئ المستخدم في Supabase Auth
 *   2) ينشئ profile له
 *   3) يعينه دور administrator
 *   4) إن كان已经有 مستخدم بنفس الإيميل، يحدّث البيانات فقط
 * ============================================================
 */

import { createClient } from "@supabase/supabase-js";

// ----- defaults -----
const DEFAULT_EMAIL = "admin@madar.local";
const DEFAULT_PASSWORD = "Admin@123456";
const DEFAULT_NAME = "مدير النظام";

// ----- parse args -----
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--email") out.email = args[i + 1];
    if (args[i] === "--password") out.password = args[i + 1];
    if (args[i] === "--name") out.name = args[i + 1];
  }
  return out;
}

const config = {
  email: parseArgs().email || process.env.SEED_ADMIN_EMAIL || DEFAULT_EMAIL,
  password: parseArgs().password || process.env.SEED_ADMIN_PASSWORD || DEFAULT_PASSWORD,
  name: parseArgs().name || process.env.SEED_ADMIN_NAME || DEFAULT_NAME,
};

// ----- load env -----
function loadEnv() {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      }
    }
    const localPath = path.join(process.cwd(), ".env.local");
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, "utf-8");
      for (const line of content.split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      }
    }
  } catch (e) {
    // ignore
  }
}

async function main() {
  await loadEnv();

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL) {
    console.error("❌ SUPABASE_URL غير محدد. تأكد من تشغيل supabase start أو ضبط .env");
    process.exit(1);
  }
  if (!SERVICE_ROLE_KEY) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY غير محدد. شغّل: supabase status لعرض المفتاح");
    console.error("   ثم أضفه إلى .env.local: SUPABASE_SERVICE_ROLE_KEY=...");
    process.exit(1);
  }

  console.log("============================================================");
  console.log("  إنشاء حساب المدير - نظام مدار");
  console.log("============================================================");
  console.log(`  Supabase URL : ${SUPABASE_URL}`);
  console.log(`  Email        : ${config.email}`);
  console.log(`  Name         : ${config.name}`);
  console.log("============================================================\n");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) إنشاء المستخدم أو جلبه إن كان موجوداً
  console.log("▶️  البحث عن مستخدم موجود...");
  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("❌ تعذر الوصول إلى قائمة المستخدمين:", listError.message);
    process.exit(1);
  }

  let user = existingUsers.users.find((u) => u.email === config.email);

  if (user) {
    console.log(`✓ المستخدم موجود مسبقاً (id: ${user.id}). تحديث البيانات...`);
    const { data: updated, error: updErr } = await supabase.auth.admin.updateUserById(user.id, {
      password: config.password,
      email_confirm: true,
      user_metadata: { full_name: config.name },
    });
    if (updErr) {
      console.error("❌ تعذر تحديث المستخدم:", updErr.message);
      process.exit(1);
    }
    user = updated.user;
  } else {
    console.log("▶️  إنشاء مستخدم جديد...");
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: config.email,
      password: config.password,
      email_confirm: true,
      user_metadata: { full_name: config.name },
    });
    if (createErr) {
      console.error("❌ تعذر إنشاء المستخدم:", createErr.message);
      process.exit(1);
    }
    user = created.user;
    console.log(`✓ تم إنشاء المستخدم (id: ${user.id})`);
  }

  // 2) إنشاء profile
  console.log("▶️  إنشاء/تحديث profile...");
  const { error: profileErr } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      full_name: config.name,
      department: "الإدارة",
      job_title: "مدير النظام",
      is_active: true,
    });
  if (profileErr) {
    console.error("❌ تعذر إنشاء profile:", profileErr.message);
    process.exit(1);
  }
  console.log("✓ تم إنشاء/تحديث profile");

  // 3) تعيين دور administrator
  console.log("▶️  تعيين دور administrator...");
  // نجلب الأدوار الحالية
  const { data: existingRoles, error: roleErr } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (roleErr) {
    console.error("❌ تعذر جلب أدوار المستخدم:", roleErr.message);
    process.exit(1);
  }

  const hasAdmin = existingRoles?.some((r) => r.role === "administrator");
  if (!hasAdmin) {
    const { error: assignErr } = await supabase.from("user_roles").insert({
      user_id: user.id,
      role: "administrator",
      created_by: user.id,
    });
    if (assignErr) {
      console.error("❌ تعذر تعيين الدور:", assignErr.message);
      process.exit(1);
    }
    console.log("✓ تم تعيين دور administrator");
  } else {
    console.log("✓ المستخدم يحمل دور administrator مسبقاً");
  }

  // 4) التأكد من الإعدادات وأنواع المستندات
  console.log("\n▶️  التحقق من البيانات الأولية...");
  const { error: docTypesErr } = await supabase.from("document_types").upsert(
    [
      { code: "ORDER_DOCUMENTATION", name_ar: "توثيق رقم الطلب", is_required_for_closure: true, is_active: true },
      { code: "SIGNATURE_SHEETS", name_ar: "أوراق التواقيع", is_required_for_closure: true, is_active: true },
      { code: "WORKER_PROOF", name_ar: "إثبات عمل العمال", is_required_for_closure: true, is_active: true },
    ],
    { onConflict: "code" }
  );
  if (docTypesErr) console.warn("⚠️  تعذر التحقق من أنواع المستندات:", docTypesErr.message);
  else console.log("✓ أنواع المستندات جاهزة");

  const { error: settingsErr } = await supabase.from("settings").upsert(
    [
      { key: "company_name", value: JSON.stringify("المؤسسة"), label_ar: "اسم الشركة" },
      { key: "timezone", value: JSON.stringify("Asia/Baghdad"), label_ar: "المنطقة الزمنية" },
      { key: "work_days", value: JSON.stringify([1, 2, 3, 4, 5]), label_ar: "أيام العمل" },
      { key: "work_hours", value: JSON.stringify({ start: "08:00", end: "16:00" }), label_ar: "ساعات العمل" },
      { key: "order_numbering", value: JSON.stringify({ prefix: "ORD-", padding: 6 }), label_ar: "ترقيم الطلبات" },
    ],
    { onConflict: "key" }
  );
  if (settingsErr) console.warn("⚠️  تعذر التحقق من الإعدادات:", settingsErr.message);
  else console.log("✓ الإعدادات جاهزة");

  console.log("\n============================================================");
  console.log("  ✅ تم إنشاء حساب المدير بنجاح");
  console.log("============================================================");
  console.log(`  Email    : ${config.email}`);
  console.log(`  Password : ${config.password}`);
  console.log(`  Role     : administrator`);
  console.log(`  User ID  : ${user.id}`);
  console.log("============================================================");
  console.log("  يمكنك الآن تسجيل الدخول عبر http://localhost:3000/auth");
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("❌ خطأ غير متوقع:", err);
  process.exit(1);
});
