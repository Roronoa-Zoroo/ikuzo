import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { FieldGroup } from "@repo/ui/components/field";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { AuthCard } from "@/components/auth-card";
import { useAppForm } from "@/components/form/use-app-form";
import { authClient } from "@/lib/auth-client";
import { clearSessionCache } from "@/lib/query";
import { pageHead } from "@/lib/seo";
import { SITE } from "@/lib/site";

const loginSchema = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(8, "At least 8 characters."),
});

export const Route = createFileRoute("/login")({
  head: () =>
    pageHead({
      description: `Sign in to your ${SITE.name} workspace.`,
      noIndex: true,
      title: "Sign in",
    }),
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (data) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      setError(null);

      try {
        const { error: signInError } = await authClient.signIn.email({
          email: value.email.trim(),
          password: value.password,
        });

        if (signInError) {
          setError(signInError.message ?? "Could not sign in.");
          return;
        }

        clearSessionCache(queryClient);
        await router.invalidate();
        await navigate({ to: "/" });
      } catch {
        setError("Could not sign in. Please try again.");
      }
    },
    validators: {
      onSubmit: loginSchema,
    },
  });

  return (
    <AuthCard description="Sign in to load your todos from this device and any other." title="Welcome back">
      <form.AppForm>
        <form.Form className="flex flex-col gap-6">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <form.AppField name="email">
              {(field) => <field.TextField autoComplete="email" id="login-email" label="Email" type="email" />}
            </form.AppField>
            <form.AppField name="password">
              {(field) => (
                <field.TextField
                  autoComplete="current-password"
                  description="At least 8 characters."
                  id="login-password"
                  label="Password"
                  type="password"
                />
              )}
            </form.AppField>
            <p className="text-right text-sm">
              <Link className="text-muted-foreground underline-offset-4 hover:underline" to="/forgot-password">
                Forgot password?
              </Link>
            </p>
          </FieldGroup>
          <form.SubmitButton>Sign in</form.SubmitButton>
          <p className="text-center text-muted-foreground text-sm">
            Need an account?{" "}
            <Link className="text-foreground underline-offset-4 hover:underline" to="/signup">
              Create one
            </Link>
          </p>
        </form.Form>
      </form.AppForm>
    </AuthCard>
  );
}
