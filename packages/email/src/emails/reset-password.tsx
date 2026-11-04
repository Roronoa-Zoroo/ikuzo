import { Text } from "react-email";

import { EmailLayout } from "../layout.tsx";

interface ResetPasswordEmailProps {
  name: string;
  resetUrl: string;
}

export default function ResetPasswordEmail({ name, resetUrl }: ResetPasswordEmailProps) {
  return (
    <EmailLayout
      cta={{ href: resetUrl, label: "Reset password" }}
      heading={`Reset your password, ${name}`}
      preview="Reset the password for your Starter account"
    >
      <Text className="m-0 mb-4 text-base text-muted leading-7">
        We received a request to reset the password for your Starter account. Use the button below to choose a new one.
      </Text>
      <Text className="m-0 mb-7 text-base text-muted leading-7">
        The link expires after a short time. If you did not ask to reset your password, you can ignore this message.
      </Text>
    </EmailLayout>
  );
}

ResetPasswordEmail.PreviewProps = {
  name: "Taha",
  resetUrl: "https://example.com/reset-password",
} satisfies ResetPasswordEmailProps;
