import { TooltipProvider } from "@repo/ui/components/tooltip";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { FormDevtoolsPanel } from "@tanstack/react-form-devtools";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useState } from "react";
import { Toaster } from "sonner";

import { RootRouteError, RouteNotFound } from "@/components/route-fallback";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { createQueryClient, createTrpcClient } from "@/lib/query";
import { defaultHead } from "@/lib/seo";
import { TRPCProvider } from "@/lib/trpc";

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RootRouteError,
  head: defaultHead,
  notFoundComponent: RouteNotFound,
});

function AppToaster() {
  const { theme } = useTheme();

  return <Toaster closeButton richColors theme={theme} />;
}

function RootComponent() {
  const [queryClient] = useState(createQueryClient);
  const [trpcClient] = useState(() => createTrpcClient(queryClient));

  return (
    <ThemeProvider>
      <HeadContent />
      <AppToaster />
      <TooltipProvider>
        <QueryClientProvider client={queryClient}>
          <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
            <Outlet />
            <TanStackDevtools
              config={{
                position: "bottom-right",
              }}
              plugins={[
                {
                  name: "TanStack Query",
                  render: <ReactQueryDevtoolsPanel />,
                },
                {
                  name: "TanStack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
                {
                  name: "TanStack Form",
                  render: <FormDevtoolsPanel />,
                },
              ]}
            />
          </TRPCProvider>
        </QueryClientProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
