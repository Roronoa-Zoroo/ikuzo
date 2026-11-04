import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { redisStorage } from "@better-auth/redis-storage";
import { client, db } from "@repo/db/client";
import { betterAuth } from "better-auth/minimal";
import { ENV } from "./env.ts";
import { sendResetPasswordEmail } from "./lib/mail.ts";
import { redis } from "./redis.ts";

const cookieDomain = new URL(ENV.WEB_ORIGIN).hostname;

export const auth = betterAuth({
  advanced: {
    crossSubDomainCookies: {
      domain: cookieDomain,
      enabled: true,
    },
    database: {
      generateId: false,
      joins: true,
    },
    useSecureCookies: true,
  },
  baseURL: ENV.BETTER_AUTH_URL,
  database: mongodbAdapter(db, {
    client,
  }),
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ url, user }) => {
      await sendResetPasswordEmail({ name: user.name, resetUrl: url, to: user.email });
    },
  },
  secondaryStorage: redisStorage({
    client: redis,
  }),
  trustedOrigins: [ENV.WEB_ORIGIN],
});
