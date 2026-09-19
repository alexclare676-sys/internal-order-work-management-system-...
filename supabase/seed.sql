-- ====================================================================
-- Seed Script - نظام مدار
-- إنشاء حساب المدير الافتراضي (Administrator) والإعدادات الأولية
-- ====================================================================
-- يُشغّل تلقائياً بعد supabase db reset
-- ====================================================================

-- ============================================================
-- 1) إنشاء حساب المدير الافتراضي في Supabase Auth
-- ============================================================
-- ملاحظة: supabase_auth schema لا يمكن الوصول إليه مباشرة من migrations
-- لذا نستخدم service_role عبر سكربت منفصل (scripts/seed-admin.sql)
-- هنا فقط نضمن أن الإعدادات الافتراضية موجودة

-- ============================================================
-- 2) التأكد من وجود أنواع المستندات الإلزامية
-- ============================================================
INSERT INTO public.document_types (code, name_ar, is_required_for_closure, is_active)
VALUES
  ('ORDER_DOCUMENTATION', 'توثيق رقم الطلب', true, true),
  ('SIGNATURE_SHEETS', 'أوراق التواقيع', true, true),
  ('WORKER_PROOF', 'إثبات عمل العمال', true, true)
ON CONFLICT (code) DO UPDATE
SET
  name_ar = EXCLUDED.name_ar,
  is_required_for_closure = EXCLUDED.is_required_for_closure,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ============================================================
-- 3) التأكد من وجود الإعدادات الافتراضية للنظام
-- ============================================================
INSERT INTO public.settings (key, value, label_ar)
VALUES
  ('company_name', '"المؤسسة"'::jsonb, 'اسم الشركة'),
  ('timezone', '"Asia/Baghdad"'::jsonb, 'المنطقة الزمنية'),
  ('work_days', '[1,2,3,4,5]'::jsonb, 'أيام العمل'),
  ('work_hours', '{"start":"08:00","end":"16:00"}'::jsonb, 'ساعات العمل'),
  ('order_numbering', '{"prefix":"ORD-","padding":6}'::jsonb, 'ترقيم الطلبات'),
  ('order_cycle', '{"start_day":"monday","end_day":"friday","duration_days":5}'::jsonb, 'دورة الطلب الأسبوعية')
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  label_ar = EXCLUDED.label_ar,
  updated_at = now();
