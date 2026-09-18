GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
CREATE POLICY "roles_insert_bootstrap_or_admin" ON public.user_roles FOR INSERT TO authenticated WITH CHECK ((NOT EXISTS (SELECT 1 FROM public.user_roles)) OR private.has_role(auth.uid(),'administrator'));
CREATE POLICY "roles_update_admin" ON public.user_roles FOR UPDATE TO authenticated USING (private.has_role(auth.uid(),'administrator')) WITH CHECK (private.has_role(auth.uid(),'administrator'));
CREATE POLICY "roles_delete_admin" ON public.user_roles FOR DELETE TO authenticated USING (private.has_role(auth.uid(),'administrator'));

CREATE OR REPLACE FUNCTION public.claim_initial_administrator(_full_name text)
RETURNS public.app_role LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _role public.app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.profiles(id, full_name) VALUES (_uid, COALESCE(NULLIF(trim(_full_name),''),'مستخدم النظام')) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
  SELECT role INTO _role FROM public.user_roles WHERE user_id=_uid ORDER BY role LIMIT 1;
  IF _role IS NULL THEN
    INSERT INTO public.user_roles(user_id, role, created_by) VALUES (_uid, CASE WHEN NOT EXISTS (SELECT 1 FROM public.user_roles) THEN 'administrator'::public.app_role ELSE 'employee'::public.app_role END, _uid);
    SELECT role INTO _role FROM public.user_roles WHERE user_id=_uid ORDER BY role LIMIT 1;
  END IF;
  RETURN _role;
END $$;

CREATE POLICY "order_files_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='order-documents');
CREATE POLICY "order_files_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='order-documents' AND private.can_manage_orders(auth.uid()));
CREATE POLICY "order_files_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='order-documents' AND private.can_manage_orders(auth.uid())) WITH CHECK (bucket_id='order-documents' AND private.can_manage_orders(auth.uid()));
CREATE POLICY "order_files_delete_admin" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='order-documents' AND private.has_role(auth.uid(),'administrator'));