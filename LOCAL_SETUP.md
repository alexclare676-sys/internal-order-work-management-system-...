# 🚀 تشغيل النظام محلياً - نظام مدار

دليل شامل لتشغيل نظام **مدار** محلياً على شبكة الشركة الداخلية (LAN).

---

## 📋 المتطلبات الأساسية

| الأداة | الإصدار الأدنى | طريقة التثبيت |
|--------|---------------|---------------|
| **Node.js** | 20+ | https://nodejs.org |
| **Bun** (أو npm) | 1.0+ | https://bun.sh |
| **Docker Desktop** | أحدث | https://docker.com |
| **Supabase CLI** | أحدث | `npm install -g supabase` |
| **Git** | 2.30+ | https://git-scm.com |

---

## ⚡ التشغيل السريع (3 خطوات)

### 1️⃣ تثبيت الحزم

```bash
cd internal-order-work-management-system-...
bun install
# أو: npm install
```

### 2️⃣ تشغيل Supabase المحلي

```bash
bun run supabase:start
# أو: supabase start
```

> سيتم تشغيل:
> - **PostgreSQL** على المنفذ `54322`
> - **Auth API** على المنفذ `54321`
> - **Studio** (واجهة إدارة) على المنفذ `54323`
> - **Storage** على المنفذ `54321`
> - **Realtime** على المنفذ `54321`

### 3️⃣ إنشاء قاعدة البيانات وحساب الأدمن

```bash
# تطبيق الـ migrations + seed
bun run supabase:reset

# إنشاء حساب المدير الافتراضي
bun run create-admin
```

### 4️⃣ تشغيل الـ Frontend

```bash
bun run dev
```

✅ افتح المتصفح على: **http://localhost:3000**

**بيانات الدخول الافتراضية:**
- الإيميل: `admin@madar.local`
- كلمة المرور: `Admin@123456`

---

## 🌐 الوصول من شبكة الشركة (LAN)

بعد التشغيل على السيرفر، يمكن لأي جهاز على نفس الشبكة الوصول للنظام عبر:

```
http://<SERVER_IP>:3000
```

مثال: `http://192.168.1.100:3000`

### للحصول على IP السيرفر:

- **Windows:** `ipconfig` → IPv4 Address
- **Linux/Mac:** `hostname -I` أو `ifconfig`

### لجعل Supabase متاح على الشبكة:

عدّل ملف `.env`:

```env
VITE_SUPABASE_URL="http://<SERVER_IP>:54321"
SUPABASE_URL="http://<SERVER_IP>:54321"
```

ثم أعد تشغيل:
```bash
bun run supabase:stop
bun run supabase:start
bun run dev
```

---

## 🛠️ الأوامر المتاحة

| الأمر | الوصف |
|------|------|
| `bun run dev` | تشغيل الـ Frontend على المنفذ 3000 (LAN متاح) |
| `bun run build` | بناء نسخة الإنتاج |
| `bun run preview` | معاينة نسخة الإنتاج |
| `bun run supabase:start` | تشغيل Supabase Local (يتطلب Docker) |
| `bun run supabase:stop` | إيقاف Supabase Local |
| `bun run supabase:status` | عرض حالة Supabase والمنافذ |
| `bun run supabase:reset` | إعادة تعيين قاعدة البيانات + تطبيق migrations + seed |
| `bun run supabase:migrate` | تطبيق migrations الجديدة فقط (بدون فقدان البيانات) |
| `bun run create-admin` | إنشاء حساب مدير جديد |
| `bun run setup` | تشغيل كامل: start + reset + create-admin |

### إنشاء حساب أدمن مخصص:

```bash
bun run create-admin -- --email admin@company.com --password "StrongPass123" --name "اسم المدير"
```

---

## 🗄️ الوصول إلى Supabase Studio

- **العنوان:** http://localhost:54323
- يوفر واجهة إدارة كاملة لقاعدة البيانات:
  - عرض الجداول والبيانات
  - تعديل السجلات
  - تنفيذ استعلامات SQL
  - إدارة Auth والملفات

---

## 🔄 سير العمل اليومي

### تشغيل النظام كل صباح:

```bash
# 1) تشغيل Supabase
bun run supabase:start

# 2) تشغيل الـ Frontend
bun run dev
```

### إيقاف النظام في نهاية اليوم:

```bash
bun run supabase:stop
# ثم Ctrl+C في طرفية الـ Frontend
```

### تحديث الكود من GitHub:

```bash
git pull
bun install
bun run supabase:migrate   # تطبيق migrations جديدة فقط
```

---

## 📁 هيكل المشروع

```
internal-order-work-management-system-.../
├── .env                          # إعدادات Supabase Local
├── .env.local.example            # قالب للبيئة المحلية
├── package.json                  # scripts: dev, setup, create-admin...
├── scripts/
│   └── create-admin.mjs          # سكربت إنشاء حساب المدير
├── supabase/
│   ├── config.toml               # إعدادات Supabase Local
│   ├── seed.sql                  # بيانات أولية (أنواع المستندات، الإعدادات)
│   └── migrations/               # مخطط قاعدة البيانات
│       ├── 20260918234442_*.sql  # الجداول الأساسية
│       ├── 20260918234503_*.sql  # دوال private schema
│       └── 20260918234544_*.sql  # Storage buckets
└── src/
    ├── routes/                   # صفحات التطبيق
    │   ├── _authenticated/
    │   │   ├── dashboard.tsx     # لوحة التحكم الرئيسية
    │   │   ├── workers.tsx       # إدارة العمال
    │   │   ├── orders.$id.tsx    # تفاصيل الطلب
    │   │   ├── users.tsx         # إدارة المستخدمين (admin)
    │   │   ├── reports.tsx       # التقارير
    │   │   ├── audit.tsx         # سجل العمليات
    │   │   └── settings.tsx      # الإعدادات
    │   ├── auth.tsx              # تسجيل الدخول
    │   └── __root.tsx
    ├── components/ui/            # مكتبة shadcn/ui
    ├── integrations/supabase/    # تكامل Supabase
    └── styles.css                # نظام التصميم (RTL، oklch، dark mode)
```

---

## 🎯 الميزات المنفذة

### ✅ الميزات الأساسية:
- **نظام الطلبات** مع رقم فريد تلقائي (`ORD-000001`)
- **دورة حياة الطلب الكاملة:** OPEN → IN_PROGRESS → WAITING_DOCUMENTS → PENDING_REVIEW → CLOSED → ARCHIVED
- **التحقق من الإغلاق:** لا يمكن إغلاق الطلب قبل استكمال:
  - بيانات الطلب الأساسية
  - العمال المرتبطون
  - المستندات الإلزامية الثلاثة

### ✅ الصفحات:
- `/auth` - تسجيل الدخول
- `/dashboard` - لوحة التحكم الرئيسية
- `/workers` - إدارة العمال (إضافة/تعديل/حذف)
- `/orders/:id` - تفاصيل الطلب (ربط عمال، رفع مستندات، تغيير الحالة)
- `/users` - إدارة المستخدمين (admin only)
- `/reports` - التقارير والإحصائيات
- `/audit` - سجل العمليات
- `/settings` - إعدادات النظام

### ✅ الميزات التقنية:
- **Realtime:** تحديث فوري للطلبات عبر Supabase Realtime
- **RTL كامل:** واجهة عربية من اليمين لليسار
- **Dark Mode:** ثيم فاتح/داكن
- **Responsive:** يعمل على الموبايل والديسكتوب
- **File Upload:** رفع مستندات (PDF, JPG, PNG) حتى 20MB
- **Audit Logging:** تسجيل كل العمليات

---

## 🔧 استكشاف الأخطاء

### المشكلة: `Cannot connect to Supabase`

**الحل:**
```bash
bun run supabase:status   # تحقق من حالة Supabase
bun run supabase:stop
bun run supabase:start
```

### المشكلة: `Database connection failed` بعد reset

**الحل:**
```bash
bun run supabase:reset -- --no-seed  # تطبيق migrations فقط
bun run create-admin                 # إعادة إنشاء الأدمن
```

### المشكلة: المنفذ 3000 مستخدم

**الحل:** عدّل `package.json`:
```json
"dev": "vite dev --host 0.0.0.0 --port 3001"
```

### المشكلة: المستخدمون على LAN لا يستطيعون الوصول

**الحلول:**
1. تأكد أن الـ Firewall يسمح بالمنفذ 3000
2. تأكد أن `VITE_SUPABASE_URL` يشير لـ IP السيرفر وليس localhost
3. على Windows: افتح المنافذ في Windows Defender Firewall

### المشكلة: نسيان كلمة مرور الأدمن

**الحل:**
```bash
bun run create-admin -- --email admin@madar.local --password "NewPassword123"
```

---

## 📞 الدعم

للمساعدة أو الاستفسار، تواصل مع مدير النظام.

---

## 📄 الترخيص

هذا النظام مُطور للاستخدام الداخلي في الشركة.
