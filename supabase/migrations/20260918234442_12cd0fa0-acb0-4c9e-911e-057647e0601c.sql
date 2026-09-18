CREATE TYPE public.app_role AS ENUM ('administrator','manager','employee','viewer');
CREATE TYPE public.order_status AS ENUM ('OPEN','IN_PROGRESS','WAITING_DOCUMENTS','PENDING_REVIEW','CLOSED','ARCHIVED');
CREATE TYPE public.audit_action AS ENUM ('CREATE','UPDATE','DELETE','RESTORE','STATUS_CHANGE','UPLOAD','REPLACE','CLOSE','ARCHIVE','ASSIGN');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  phone text,
  department text,
  job_title text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'employee',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_orders(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'administrator') OR public.has_role(_user_id, 'manager') OR public.has_role(_user_id, 'employee')
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_orders(uuid) TO authenticated;

CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'administrator')) WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'administrator'));
CREATE POLICY "roles_read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'administrator'));

CREATE OR REPLACE FUNCTION public.claim_initial_administrator(_full_name text)
RETURNS public.app_role LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.profiles(id, full_name) VALUES (_uid, COALESCE(NULLIF(trim(_full_name),''),'مدير النظام')) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles(user_id, role, created_by) VALUES (_uid, 'administrator', _uid);
  ELSIF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid) THEN
    INSERT INTO public.user_roles(user_id, role, created_by) VALUES (_uid, 'employee', _uid);
  END IF;
  RETURN (SELECT role FROM public.user_roles WHERE user_id = _uid ORDER BY role LIMIT 1);
END $$;
GRANT EXECUTE ON FUNCTION public.claim_initial_administrator(text) TO authenticated;

CREATE TABLE public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_number text UNIQUE,
  full_name text NOT NULL,
  phone text,
  specialty text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  deleted_at timestamptz,
  deleted_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.workers TO authenticated;
GRANT ALL ON public.workers TO service_role;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workers_read" ON public.workers FOR SELECT TO authenticated USING (true);
CREATE POLICY "workers_create" ON public.workers FOR INSERT TO authenticated WITH CHECK (public.can_manage_orders(auth.uid()) AND created_by = auth.uid() AND updated_by = auth.uid());
CREATE POLICY "workers_update" ON public.workers FOR UPDATE TO authenticated USING (public.can_manage_orders(auth.uid())) WITH CHECK (public.can_manage_orders(auth.uid()) AND updated_by = auth.uid());

CREATE SEQUENCE public.order_number_seq START 1;
GRANT USAGE ON SEQUENCE public.order_number_seq TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.next_order_number() RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$ SELECT 'ORD-' || lpad(nextval('public.order_number_seq')::text, 6, '0') $$;
GRANT EXECUTE ON FUNCTION public.next_order_number() TO authenticated;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT public.next_order_number(),
  title text NOT NULL,
  description text NOT NULL,
  work_details text,
  notes text,
  extra_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.order_status NOT NULL DEFAULT 'OPEN',
  work_start_at timestamptz,
  work_end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  closed_at timestamptz,
  closed_by uuid,
  archived_at timestamptz,
  archived_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_read" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "orders_create" ON public.orders FOR INSERT TO authenticated WITH CHECK (public.can_manage_orders(auth.uid()) AND created_by = auth.uid() AND updated_by = auth.uid());
CREATE POLICY "orders_update" ON public.orders FOR UPDATE TO authenticated USING (public.can_manage_orders(auth.uid())) WITH CHECK (public.can_manage_orders(auth.uid()) AND updated_by = auth.uid());

CREATE TABLE public.order_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  deleted_at timestamptz,
  deleted_by uuid,
  UNIQUE(order_id, worker_id)
);
GRANT SELECT, INSERT, UPDATE ON public.order_workers TO authenticated;
GRANT ALL ON public.order_workers TO service_role;
ALTER TABLE public.order_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_workers_read" ON public.order_workers FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_workers_create" ON public.order_workers FOR INSERT TO authenticated WITH CHECK (public.can_manage_orders(auth.uid()) AND created_by = auth.uid() AND updated_by = auth.uid());
CREATE POLICY "order_workers_update" ON public.order_workers FOR UPDATE TO authenticated USING (public.can_manage_orders(auth.uid())) WITH CHECK (public.can_manage_orders(auth.uid()) AND updated_by = auth.uid());

CREATE TABLE public.document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  is_required_for_closure boolean NOT NULL DEFAULT false,
  allowed_mime_types text[] NOT NULL DEFAULT ARRAY['application/pdf','image/jpeg','image/png'],
  max_size_mb integer NOT NULL DEFAULT 20 CHECK (max_size_mb BETWEEN 1 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.document_types TO authenticated;
GRANT ALL ON public.document_types TO service_role;
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_types_read" ON public.document_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "document_types_admin_write" ON public.document_types FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  document_type_id uuid NOT NULL REFERENCES public.document_types(id),
  current_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  deleted_at timestamptz,
  deleted_by uuid,
  UNIQUE(order_id, document_type_id)
);
GRANT SELECT, INSERT, UPDATE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_read" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "documents_create" ON public.documents FOR INSERT TO authenticated WITH CHECK (public.can_manage_orders(auth.uid()) AND created_by = auth.uid() AND updated_by = auth.uid());
CREATE POLICY "documents_update" ON public.documents FOR UPDATE TO authenticated USING (public.can_manage_orders(auth.uid())) WITH CHECK (public.can_manage_orders(auth.uid()) AND updated_by = auth.uid());

CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id),
  version_number integer NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, version_number)
);
GRANT SELECT, INSERT ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_versions_read" ON public.document_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "document_versions_create" ON public.document_versions FOR INSERT TO authenticated WITH CHECK (public.can_manage_orders(auth.uid()) AND uploaded_by = auth.uid());

CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  from_status public.order_status,
  to_status public.order_status NOT NULL,
  note text,
  changed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "status_history_read" ON public.order_status_history FOR SELECT TO authenticated USING (true);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action public.audit_action NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  order_id uuid REFERENCES public.orders(id),
  summary text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read_manager" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'manager'));

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id),
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own_read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_own_update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  label_ar text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_admin_write" ON public.settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER workers_updated BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER order_workers_updated BEFORE UPDATE ON public.order_workers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER document_types_updated BEFORE UPDATE ON public.document_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER notifications_updated BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER settings_updated BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_order_transition() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE missing text[] := ARRAY[]::text[]; has_workers boolean; required_count integer; uploaded_count integer;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT ((OLD.status='OPEN' AND NEW.status IN ('IN_PROGRESS','WAITING_DOCUMENTS')) OR (OLD.status='IN_PROGRESS' AND NEW.status IN ('WAITING_DOCUMENTS','PENDING_REVIEW')) OR (OLD.status='WAITING_DOCUMENTS' AND NEW.status IN ('IN_PROGRESS','PENDING_REVIEW')) OR (OLD.status='PENDING_REVIEW' AND NEW.status IN ('WAITING_DOCUMENTS','CLOSED')) OR (OLD.status='CLOSED' AND NEW.status='ARCHIVED')) THEN RAISE EXCEPTION 'Invalid order status transition'; END IF;
  IF NEW.status IN ('PENDING_REVIEW','CLOSED') THEN
    IF trim(COALESCE(NEW.order_number,''))='' THEN missing := array_append(missing,'رقم الطلب'); END IF;
    IF trim(COALESCE(NEW.title,''))='' OR trim(COALESCE(NEW.description,''))='' OR NEW.work_start_at IS NULL THEN missing := array_append(missing,'بيانات الطلب الأساسية'); END IF;
    SELECT EXISTS(SELECT 1 FROM public.order_workers ow WHERE ow.order_id=NEW.id AND ow.deleted_at IS NULL) INTO has_workers;
    IF NOT has_workers THEN missing := array_append(missing,'العمال المرتبطون'); END IF;
    SELECT count(*) INTO required_count FROM public.document_types WHERE is_required_for_closure AND is_active;
    SELECT count(DISTINCT d.document_type_id) INTO uploaded_count FROM public.documents d WHERE d.order_id=NEW.id AND d.deleted_at IS NULL;
    IF uploaded_count < required_count THEN missing := array_append(missing,'المستندات الإلزامية'); END IF;
    IF array_length(missing,1) IS NOT NULL THEN RAISE EXCEPTION 'لا يمكن متابعة الطلب. المتطلبات الناقصة: %', array_to_string(missing, '، '); END IF;
  END IF;
  IF NEW.status='CLOSED' THEN NEW.closed_at=now(); NEW.closed_by=auth.uid(); END IF;
  IF NEW.status='ARCHIVED' THEN NEW.archived_at=now(); NEW.archived_by=auth.uid(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_validate_transition BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.validate_order_transition();

CREATE OR REPLACE FUNCTION public.record_order_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.order_status_history(order_id,from_status,to_status,changed_by) VALUES(NEW.id,NULL,NEW.status,NEW.created_by);
    INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,order_id,summary) VALUES(NEW.created_by,'CREATE','order',NEW.id,NEW.id,'إنشاء الطلب '||NEW.order_number);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history(order_id,from_status,to_status,changed_by) VALUES(NEW.id,OLD.status,NEW.status,NEW.updated_by);
    INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,order_id,summary,changes) VALUES(NEW.updated_by,CASE WHEN NEW.status='CLOSED' THEN 'CLOSE'::public.audit_action WHEN NEW.status='ARCHIVED' THEN 'ARCHIVE'::public.audit_action ELSE 'STATUS_CHANGE'::public.audit_action END,'order',NEW.id,NEW.id,'تغيير حالة الطلب '||NEW.order_number,jsonb_build_object('from',OLD.status,'to',NEW.status));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_record_status AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.record_order_status();

CREATE INDEX orders_status_idx ON public.orders(status) WHERE deleted_at IS NULL;
CREATE INDEX orders_created_at_idx ON public.orders(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX orders_work_dates_idx ON public.orders(work_start_at, work_end_at) WHERE deleted_at IS NULL;
CREATE INDEX workers_name_idx ON public.workers(full_name) WHERE deleted_at IS NULL;
CREATE INDEX order_workers_order_idx ON public.order_workers(order_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_order_idx ON public.documents(order_id) WHERE deleted_at IS NULL;
CREATE INDEX audit_order_created_idx ON public.audit_logs(order_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON public.notifications(user_id, is_read, created_at DESC);

INSERT INTO public.document_types(code,name_ar,is_required_for_closure) VALUES
('ORDER_DOCUMENTATION','توثيق رقم الطلب',true),
('SIGNATURE_SHEETS','أوراق التواقيع',true),
('WORKER_PROOF','إثبات عمل العمال',true);
INSERT INTO public.settings(key,value,label_ar) VALUES
('company_name','"المؤسسة"','اسم الشركة'),
('timezone','"Asia/Baghdad"','المنطقة الزمنية'),
('work_days','[1,2,3,4,5]','أيام العمل'),
('work_hours','{"start":"08:00","end":"16:00"}','ساعات العمل'),
('order_numbering','{"prefix":"ORD-","padding":6}','ترقيم الطلبات');

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;