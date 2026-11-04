import { type CreateEmailOptions, type CreateEmailRequestOptions, Resend } from "resend";

type SendEmailPayload = Omit<CreateEmailOptions, "from"> & {
  from?: string;
};

export function createMailer(config: { apiKey: string; from: string; onError?: (error: unknown) => void }) {
  const resend = new Resend(config.apiKey);

  return {
    async send(payload: SendEmailPayload, options?: CreateEmailRequestOptions) {
      const result = await resend.emails.send(
        {
          ...payload,
          from: payload.from ?? config.from,
        } as CreateEmailOptions,
        options
      );

      if (result.error) {
        config.onError?.(result.error);
        throw new Error("Failed to send email");
      }

      return result;
    },
  };
}
