import { z } from "zod";

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  MONGODB_URI: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  REDIS_URL: z.url(),
  EMAIL_FROM: z
    .string()
    .min(3)
    .refine((value) => value.includes("@"), "Must include an email address"),
  RESEND_API_KEY: z.string().min(1),
  WEB_ORIGIN: z.url(),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (result.success) {
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => {
      const key = issue.path.join(".") || "unknown";
      return `  - ${key}: ${issue.message}`;
    })
    .join("\n");

  throw new Error(`Invalid environment variables:\n${details}`);
}

export const ENV = parseEnv();
