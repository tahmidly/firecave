"use client";

import { cn } from "@/lib/utils";

/** opencode settings row: title and description on the left, control on the right, hairline between rows. */
export function Row({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-6 border-b border-border py-4 last:border-b-0", className)}>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium">{title}</div>
        {description && <div className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </div>
  );
}

/** A titled group of rows on a raised card. */
export function Card({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h3 className="text-[14px] font-medium">{title}</h3>}
          {action}
        </div>
      )}
      <div className="rounded-[10px] bg-layer-1 px-5 shadow-raised">{children}</div>
    </section>
  );
}

/** Segmented choice, opencode style (raised selected option on a sunken track). */
export function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="flex rounded-[8px] bg-layer-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-6 rounded-[6px] px-2.5 text-[13px] transition-colors disabled:opacity-50",
            value === o.id ? "bg-background font-medium text-foreground shadow-btn" : "text-faint hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Small text field matching opencode's inputs. */
export function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-7 rounded-[6px] bg-background px-2 text-[13px] shadow-[0_0_0_0.5px_var(--border),0_1px_1.5px_#0000001a] outline-none placeholder:text-faint focus:shadow-[0_0_0_1px_var(--ring)]",
        props.className,
      )}
    />
  );
}

/** Plain secondary button (neutral fill with a hairline ring). */
export function Btn({ className, variant = "neutral", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "neutral" | "ghost" | "danger" | "primary" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium transition disabled:pointer-events-none disabled:opacity-40",
        variant === "neutral" && "bg-btn-neutral text-foreground shadow-btn hover:brightness-110",
        variant === "danger" && "bg-btn-neutral text-destructive shadow-btn hover:brightness-110",
        variant === "ghost" && "text-muted-foreground hover:bg-accent hover:text-foreground",
        variant === "primary" && "btn-submit",
        className,
      )}
    />
  );
}
