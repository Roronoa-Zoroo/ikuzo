import { Text } from "react-email";

import { EmailLayout } from "../layout.tsx";

interface TestEmailProps {
  ctaUrl: string;
  name: string;
}

export default function TestEmail({ name, ctaUrl }: TestEmailProps) {
  return (
    <EmailLayout
      cta={{ href: ctaUrl, label: "Open workspace" }}
      footer="Starter · Sent for preview only"
      heading={`Welcome aboard, ${name}`}
      preview="Welcome to Starter — your workspace is ready"
    >
      <Text className="m-0 mb-4 text-base text-muted leading-7">
        Your account is set up. This is a sample email so you can preview how Starter messages will look in the inbox.
      </Text>
      <Text className="m-0 mb-7 text-base text-muted leading-7">
        Open your workspace to pick up where you left off, invite your team, and start organizing work in one place.
      </Text>
    </EmailLayout>
  );
}

TestEmail.PreviewProps = {
  ctaUrl: "https://example.com",
  name: "Taha",
} satisfies TestEmailProps;
