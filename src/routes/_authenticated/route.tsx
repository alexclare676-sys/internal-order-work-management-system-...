import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentUser, type CurrentUser } from "@/lib/dashboard";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const currentUser = await fetchCurrentUser(data.user);
    return { user: currentUser };
  },
  component: () => <Outlet />,
});

export type { CurrentUser };
