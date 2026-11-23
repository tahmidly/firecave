import { cn } from "@/lib/utils";
import { LOGO_SVG } from "@/shared/logo";

/** Firecave mark: ember tile, cave mouth, campfire. Same artwork as the Windows app icon. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Firecave"
      className={cn("inline-flex size-7 shrink-0 [&>svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: LOGO_SVG }}
    />
  );
}
