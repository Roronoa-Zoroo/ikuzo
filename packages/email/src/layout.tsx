import type { ReactNode } from "react";
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Tailwind, Text } from "react-email";

import { tailwindConfig } from "./tailwind.ts";

export function EmailLayout({
  children,
  cta,
  footer = "Starter",
  heading,
  preview,
}: {
  children: ReactNode;
  cta: { href: string; label: string };
  footer?: string;
  heading: string;
  preview: string;
}) {
  return (
    <Html lang="en">
      <Tailwind config={tailwindConfig}>
        <Head />
        <Preview>{preview}</Preview>
        <Body className="m-0 bg-canvas font-sans">
          <Container className="mx-auto max-w-140 bg-transparent px-6 py-10">
            <Text className="m-0 mb-6 text-center font-semibold text-ink text-sm tracking-[0.22em]">STARTER</Text>

            <Section className="overflow-hidden rounded-xl border border-line border-solid bg-surface">
              <Section className="h-1.5 bg-brand" />
              <Section className="px-8 py-9">
                <Heading className="m-0 mb-3 font-semibold text-2xl text-ink leading-8">{heading}</Heading>
                {children}
                <Button
                  className="inline-block rounded-lg bg-brand px-6 py-3 text-center font-semibold text-sm text-white leading-4 no-underline"
                  href={cta.href}
                >
                  {cta.label}
                </Button>
                <Hr className="my-8 border-line border-solid" />
                <Text className="m-0 text-muted text-sm leading-6">
                  If you did not expect this email, you can ignore it.
                </Text>
              </Section>
            </Section>

            <Text className="m-0 mt-8 text-center text-muted text-xs leading-5">{footer}</Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
