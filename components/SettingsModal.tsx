"use client";

import { getApi } from "@/lib/transport";
import { CheckCircle2, Moon, Sun, XCircle } from "lucide-react";
import type { ClaudeStatus, Settings } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RemoteSection } from "@/components/RemoteSection";
import { MODELS, PERMISSION_MODES } from "@/components/chat/Composer";
import { cn } from "@/lib/utils";

interface Props {
  settings: Settings;
  status: ClaudeStatus | null;
  theme: "dark" | "light";
  onTheme: (t: "dark" | "light") => void;
  onChange: (key: string, value: string) => void;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Choice<T extends string>({ value, options, onPick }: { value: T; options: { id: T; label: string; hint?: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="grid gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onPick(o.id)}
          className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60", value === o.id && "border-primary bg-primary/10")}
        >
          <span>{o.label}</span>
          {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function SettingsModal({ settings, status, theme, onTheme, onChange, onClose }: Props) {
  const ok = !!(status?.installed && status.loggedIn);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Everything runs locally through your Claude Code installation.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Section title="Claude Code">
            <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-3 text-sm">
              {ok ? <CheckCircle2 className="mt-0.5 size-4 text-success" /> : <XCircle className="mt-0.5 size-4 text-destructive" />}
              <div className="min-w-0 space-y-0.5">
                <div>{status?.installed ? `Installed · ${status.version}` : "Not detected"}</div>
                <div className="text-muted-foreground">
                  {status?.loggedIn ? `Signed in via ${status.authMethod}${status.subscriptionType ? ` (${status.subscriptionType})` : ""}` : "Not signed in — run `claude auth login` in a terminal"}
                </div>
                {status?.path && <div className="break-all font-mono text-xs text-muted-foreground">{status.path}</div>}
              </div>
            </div>
          </Section>

          <Section title="Appearance">
            <div className="grid grid-cols-2 gap-2">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => onTheme(t)}
                  className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm capitalize transition-colors hover:bg-muted/60", theme === t && "border-primary bg-primary/10")}
                >
                  {t === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />} {t}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Permissions">
            <Choice value={(settings.permissionMode || "acceptEdits") as string} options={PERMISSION_MODES.map((m) => ({ id: m.id, label: m.label, hint: m.hint }))} onPick={(v) => onChange("permissionMode", v)} />
            <p className="text-xs text-muted-foreground">When Claude is blocked, an Allow / Deny card appears in the chat. Allow applies to that exact action only.</p>
          </Section>

          <Section title="Default model">
            <Choice value={settings.defaultModel || "default"} options={MODELS.map((m) => ({ id: m.id, label: m.label, hint: m.hint }))} onPick={(v) => onChange("defaultModel", v)} />
          </Section>

          <RemoteSection />

          <Section title="Default project folder">
            <div className="flex gap-2">
              <Input readOnly value={settings.defaultDir ?? ""} placeholder="None" className="font-mono text-xs" />
              <Button
                variant="outline"
                onClick={async () => {
                  const f = await getApi()?.selectFolder();
                  if (f) onChange("defaultDir", f);
                }}
              >
                Browse
              </Button>
              {settings.defaultDir && (
                <Button variant="ghost" onClick={() => onChange("defaultDir", "")}>
                  Clear
                </Button>
              )}
            </div>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
