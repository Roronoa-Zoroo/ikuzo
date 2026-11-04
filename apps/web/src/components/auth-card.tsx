import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { ModeToggle } from "@/components/mode-toggle";

export function AuthCard({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="flex items-center justify-between px-4 py-4 lg:px-6">
        <BrandMark withLabel />
        <ModeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-12">
        <Card className="w-full max-w-md shadow-sm">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
