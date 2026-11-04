import { Spinner } from "@repo/ui/components/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { ModeToggle } from "@/components/mode-toggle";
import { UserMenu } from "@/components/user-menu";
import { ListSidebar } from "@/features/lists/list-sidebar";
import { authClient } from "@/lib/auth-client";
import { clearSessionCache } from "@/lib/query";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated")({
  head: () =>
    pageHead({
      noIndex: true,
      title: "Workspace",
    }),
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (!data) {
      throw redirect({ to: "/login" });
    }

    return { session: data };
  },
  component: AuthenticatedLayout,
  pendingComponent: SessionPending,
});

function SessionPending() {
  return (
    <div className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground text-sm">
      <Spinner />
      Loading session
    </div>
  );
}

function AuthenticatedLayout() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await authClient.signOut();
      clearSessionCache(queryClient);
      await router.invalidate();
      await navigate({ to: "/login" });
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <BrandMark withLabel />
          <div className="flex min-w-0 items-center gap-2">
            <ModeToggle />
            <UserMenu
              email={session.user.email}
              image={session.user.image}
              isSigningOut={isSigningOut}
              name={session.user.name}
              onSignOut={() => {
                void handleSignOut();
              }}
            />
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <ListSidebar />
        <Outlet />
      </div>
    </div>
  );
}
