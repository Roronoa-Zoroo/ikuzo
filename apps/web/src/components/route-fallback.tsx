import { Button } from "@repo/ui/components/button";
import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { ModeToggle } from "@/components/mode-toggle";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE } from "@/lib/site";

function FallbackBody({ action, description, title }: { action: ReactNode; description: string; title: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="font-heading font-semibold text-2xl tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-muted-foreground text-sm">{description}</p>
      <div className="mt-6">{action}</div>
    </main>
  );
}

function FallbackShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="flex items-center justify-between px-4 py-4 lg:px-6">
        <BrandMark withLabel />
        <ModeToggle />
      </header>
      {children}
    </div>
  );
}

export function RouteNotFound() {
  return (
    <FallbackShell>
      <FallbackBody
        action={
          <Button nativeButton={false} render={<Link to="/" />}>
            Back to {SITE.name}
          </Button>
        }
        description="That page does not exist. Check the URL or return to your workspace."
        title="Page not found"
      />
    </FallbackShell>
  );
}

export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const detail = import.meta.env.DEV && error instanceof Error ? error.message : undefined;

  return (
    <FallbackBody
      action={
        <Button
          onClick={() => {
            void router.invalidate();
          }}
        >
          Try again
        </Button>
      }
      description={detail ?? "Something went wrong. Try again, or go back to your workspace."}
      title="Something went wrong"
    />
  );
}

export function RootRouteError(props: ErrorComponentProps) {
  return (
    <ThemeProvider>
      <FallbackShell>
        <RouteError {...props} />
      </FallbackShell>
    </ThemeProvider>
  );
}
