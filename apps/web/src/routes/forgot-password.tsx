import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { FieldGroup } from "@repo/ui/components/field";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { AuthCard } from "@/components/auth-card";
import { useAppForm } from "@/components/form/use-app-form";
import { authClient } from "@/lib/auth-client";
import { pageHead } from "@/lib/seo";
import { absoluteUrl, SITE } from "@/lib/site";

const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email."),
});

export const Route = createFileRoute("/forgot-password")({
  head: () =>
    pageHead({
      description: `Reset your ${SITE.name} password.`,
      noIndex: true,
      title: "Forgot password",
    }),
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (data) {
      throw redirect({ to: "/" });
    }
  },
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const form = useAppForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      setError(null);

      try {
        const { error: resetError } = await authClient.requestPasswordReset({
          email: value.email.trim(),
          redirectTo: absoluteUrl("/reset-password"),
        });

        if (resetError) {
          setError("Could not send a reset email. Please try again.");
          return;
        }

        setSent(true);
      } catch {
        setError("Could not send a reset email. Please try again.");
      }
    },
    validators: {
      onSubmit: forgotPasswordSchema,
    },
  });

  return (
    <AuthCard
      description="Enter the email for your account and we will send a reset link if it exists."
      title="Forgot password"
    >
      {sent ? (
        <div className="flex flex-col gap-6">
          <Alert>
            <AlertDescription>
              If an account exists for that email, we sent a link to reset your password.
            </AlertDescription>
          </Alert>
          <p className="text-center text-muted-foreground text-sm">
            <Link className="text-foreground underline-offset-4 hover:underline" to="/login">
              Back to sign in
            </Link>
          </p>
        </div>
      ) : (
        <form.AppForm>
          <form.Form className="flex flex-col gap-6">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <FieldGroup>
              <form.AppField name="email">
                {(field) => <field.TextField autoComplete="email" id="forgot-email" label="Email" type="email" />}
              </form.AppField>
            </FieldGroup>
            <form.SubmitButton>Send reset link</form.SubmitButton>
            <p className="text-center text-muted-foreground text-sm">
              Remembered it?{" "}
              <Link className="text-foreground underline-offset-4 hover:underline" to="/login">
                Sign in
              </Link>
            </p>
          </form.Form>
        </form.AppForm>
      )}
    </AuthCard>
  );
}
