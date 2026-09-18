import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/dashboard" : "/auth" });
  },
  head: () => ({
    meta: [
      { title: "مدار | نظام إدارة الطلبات" },
      { name: "description", content: "بوابة نظام مدار لإدارة الطلبات والأعمال" },
      { property: "og:title", content: "مدار | نظام إدارة الطلبات" },
      { property: "og:description", content: "بوابة نظام مدار لإدارة الطلبات والأعمال" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => null,
});
