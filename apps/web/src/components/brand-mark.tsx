import { SITE } from "@/lib/site";

export function BrandMark({ withLabel = false }: { withLabel?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <img alt={withLabel ? "" : SITE.name} className="size-7" height={28} src="/logo.svg" width={28} />
      {withLabel ? <span className="font-heading font-semibold tracking-tight">{SITE.name}</span> : null}
    </span>
  );
}
