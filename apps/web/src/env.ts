import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z.url(),
  VITE_APP_URL: z.url().optional(),
});

function parseEnv() {
  const result = envSchema.safeParse(import.meta.env);
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
