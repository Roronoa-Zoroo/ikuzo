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

const signupSchema = z.object({
  email: z.email("Enter a valid email."),
  name: z.string().trim().min(1, "Name is required."),
  password: z.string().min(8, "At least 8 characters."),
});

export const Route = createFileRoute("/signup")({
  head: () =>
    pageHead({
      description: `Create a ${SITE.name} account to start organizing work.`,
      noIndex: true,
      title: "Create account",
    }),
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (data) {
      throw redirect({ to: "/" });
    }
  },
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      email: "",
      name: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      setError(null);

      try {
        const { error: signUpError } = await authClient.signUp.email({
          email: value.email.trim(),
          name: value.name.trim(),
          password: value.password,
        });

        if (signUpError) {
          setError(signUpError.message ?? "Could not create account.");
          return;
        }

        clearSessionCache(queryClient);
        await router.invalidate();
        await navigate({ to: "/" });
      } catch {
        setError("Could not create account. Please try again.");
      }
    },
    validators: {
      onSubmit: signupSchema,
    },
  });

  return (
    <AuthCard description="Create an account to keep your todos in MongoDB, tied to you." title="Create account">
      <form.AppForm>
        <form.Form className="flex flex-col gap-6">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <form.AppField name="name">
              {(field) => <field.TextField autoComplete="name" id="signup-name" label="Name" />}
            </form.AppField>
            <form.AppField name="email">
              {(field) => <field.TextField autoComplete="email" id="signup-email" label="Email" type="email" />}
            </form.AppField>
            <form.AppField name="password">
              {(field) => (
                <field.TextField
                  autoComplete="new-password"
                  description="At least 8 characters."
                  id="signup-password"
                  label="Password"
                  type="password"
                />
              )}
            </form.AppField>
          </FieldGroup>
          <form.SubmitButton>Create account</form.SubmitButton>
          <p className="text-center text-muted-foreground text-sm">
            Already have an account?{" "}
            <Link className="text-foreground underline-offset-4 hover:underline" to="/login">
              Sign in
            </Link>
          </p>
        </form.Form>
      </form.AppForm>
    </AuthCard>
  );
}
