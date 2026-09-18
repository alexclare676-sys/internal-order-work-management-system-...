CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_manage_orders(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT private.has_role(_user_id, 'administrator') OR private.has_role(_user_id, 'manager') OR private.has_role(_user_id, 'employee')
$$;
REVOKE ALL ON FUNCTION private.can_manage_orders(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_orders(uuid) TO authenticated, service_role;

ALTER POLICY "profiles_update_self_or_admin" ON public.profiles USING (id = auth.uid() OR private.has_role(auth.uid(),'administrator')) WITH CHECK (id = auth.uid() OR private.has_role(auth.uid(),'administrator'));
ALTER POLICY "roles_read" ON public.user_roles USING (user_id = auth.uid() OR private.has_role(auth.uid(),'administrator'));
ALTER POLICY "workers_create" ON public.workers WITH CHECK (private.can_manage_orders(auth.uid()) AND created_by = auth.uid() AND updated_by = auth.uid());
ALTER POLICY "workers_update" ON public.workers USING (private.can_manage_orders(auth.uid())) WITH CHECK (private.can_manage_orders(auth.uid()) AND updated_by = auth.uid());
ALTER POLICY "orders_create" ON public.orders WITH CHECK (private.can_manage_orders(auth.uid()) AND created_by = auth.uid() AND updated_by = auth.uid());
ALTER POLICY "orders_update" ON public.orders USING (private.can_manage_orders(auth.uid())) WITH CHECK (private.can_manage_orders(auth.uid()) AND updated_by = auth.uid());
ALTER POLICY "order_workers_create" ON public.order_workers WITH CHECK (private.can_manage_orders(auth.uid()) AND created_by = auth.uid() AND updated_by = auth.uid());
ALTER POLICY "order_workers_update" ON public.order_workers USING (private.can_manage_orders(auth.uid())) WITH CHECK (private.can_manage_orders(auth.uid()) AND updated_by = auth.uid());
ALTER POLICY "document_types_admin_write" ON public.document_types USING (private.has_role(auth.uid(),'administrator')) WITH CHECK (private.has_role(auth.uid(),'administrator'));
ALTER POLICY "documents_create" ON public.documents WITH CHECK (private.can_manage_orders(auth.uid()) AND created_by = auth.uid() AND updated_by = auth.uid());
ALTER POLICY "documents_update" ON public.documents USING (private.can_manage_orders(auth.uid())) WITH CHECK (private.can_manage_orders(auth.uid()) AND updated_by = auth.uid());
ALTER POLICY "document_versions_create" ON public.document_versions WITH CHECK (private.can_manage_orders(auth.uid()) AND uploaded_by = auth.uid());
ALTER POLICY "audit_read_manager" ON public.audit_logs USING (private.has_role(auth.uid(),'administrator') OR private.has_role(auth.uid(),'manager'));
ALTER POLICY "settings_admin_write" ON public.settings USING (private.has_role(auth.uid(),'administrator')) WITH CHECK (private.has_role(auth.uid(),'administrator'));

CREATE OR REPLACE FUNCTION private.validate_order_transition() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION private.validate_order_transition() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.record_order_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION private.record_order_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER orders_validate_transition ON public.orders;
CREATE TRIGGER orders_validate_transition BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION private.validate_order_transition();
DROP TRIGGER orders_record_status ON public.orders;
CREATE TRIGGER orders_record_status AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION private.record_order_status();

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, private AS $$ SELECT private.has_role(_user_id,_role) $$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_orders(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, private AS $$ SELECT private.can_manage_orders(_user_id) $$;
REVOKE ALL ON FUNCTION public.can_manage_orders(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_orders(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_initial_administrator(_full_name text)
RETURNS public.app_role LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _role public.app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.profiles(id, full_name) VALUES (_uid, COALESCE(NULLIF(trim(_full_name),''),'مستخدم النظام')) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
  SELECT role INTO _role FROM public.user_roles WHERE user_id=_uid ORDER BY role LIMIT 1;
  RETURN COALESCE(_role,'employee'::public.app_role);
END $$;
REVOKE ALL ON FUNCTION public.claim_initial_administrator(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_initial_administrator(text) TO authenticated;

DROP FUNCTION public.validate_order_transition();
DROP FUNCTION public.record_order_status();