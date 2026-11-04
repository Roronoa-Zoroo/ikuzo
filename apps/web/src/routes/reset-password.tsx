import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { FieldGroup } from "@repo/ui/components/field";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AuthCard } from "@/components/auth-card";
import { useAppForm } from "@/components/form/use-app-form";
import { authClient } from "@/lib/auth-client";
import { pageHead } from "@/lib/seo";
import { SITE } from "@/lib/site";

const resetPasswordSearchSchema = z.object({
  error: z.string().optional(),
  token: z.string().optional(),
});

const resetPasswordSchema = z
  .object({
    confirmPassword: z.string().min(8, "At least 8 characters."),
    password: z.string().min(8, "At least 8 characters."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const Route = createFileRoute("/reset-password")({
  head: () =>
    pageHead({
      description: `Choose a new ${SITE.name} password.`,
      noIndex: true,
      title: "Reset password",
    }),
  validateSearch: (search) => resetPasswordSearchSchema.parse(search),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { error: linkError, token } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const isInvalidLink = Boolean(linkError) || !token;

  const form = useAppForm({
    defaultValues: {
      confirmPassword: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      if (!token) {
        return;
      }

      setError(null);

      try {
        const { error: resetError } = await authClient.resetPassword({
          newPassword: value.password,
          token,
        });

        if (resetError) {
          setError(resetError.message ?? "Could not reset password.");
          return;
        }

        toast.success("Password updated. Sign in with your new password.");
        await navigate({ to: "/login" });
      } catch {
        setError("Could not reset password. Please try again.");
      }
    },
    validators: {
      onSubmit: resetPasswordSchema,
    },
  });

  return (
    <AuthCard description="Choose a new password for your account." title="Reset password">
      {isInvalidLink ? (
        <div className="flex flex-col gap-6">
          <Alert variant="destructive">
            <AlertDescription>
              This reset link is invalid or has expired. Request a new one to continue.
            </AlertDescription>
          </Alert>
          <p className="text-center text-muted-foreground text-sm">
            <Link className="text-foreground underline-offset-4 hover:underline" to="/forgot-password">
              Request a new link
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
              <form.AppField name="password">
                {(field) => (
                  <field.TextField
                    autoComplete="new-password"
                    description="At least 8 characters."
                    id="reset-password"
                    label="New password"
                    type="password"
                  />
                )}
              </form.AppField>
              <form.AppField name="confirmPassword">
                {(field) => (
                  <field.TextField
                    autoComplete="new-password"
                    id="reset-password-confirm"
                    label="Confirm password"
                    type="password"
                  />
                )}
              </form.AppField>
            </FieldGroup>
            <form.SubmitButton>Update password</form.SubmitButton>
            <p className="text-center text-muted-foreground text-sm">
              <Link className="text-foreground underline-offset-4 hover:underline" to="/login">
                Back to sign in
              </Link>
            </p>
          </form.Form>
        </form.AppForm>
      )}
    </AuthCard>
  );
}
