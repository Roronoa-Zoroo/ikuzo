import { createMailer } from "@repo/email";
import ResetPasswordEmail from "@repo/email/emails/reset-password";
import logger from "@repo/runtime/logger";

import { ENV } from "../env.ts";

export const mailer = createMailer({
  apiKey: ENV.RESEND_API_KEY,
  from: ENV.EMAIL_FROM,
  onError: (error) => {
    logger.error({ err: error }, "Failed to send email");
  },
});

export async function sendResetPasswordEmail(input: { name: string; resetUrl: string; to: string }) {
  await mailer.send({
    react: ResetPasswordEmail({ name: input.name, resetUrl: input.resetUrl }),
    subject: "Reset your password",
    to: input.to,
  });
}
