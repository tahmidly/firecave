"use client";

import { useEffect, useRef } from "react";
import type { ProviderId, ProviderStatus } from "@/shared/types";
import { ShieldCheck } from "lucide-react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const MODELS = [
  { id: "default", label: "Default", hint: "Your Claude Code default" },
  { id: "fable", label: "Fable", hint: "Newest frontier model" },
  { id: "opus", label: "Opus", hint: "Most capable" },
  { id: "sonnet", label: "Sonnet", hint: "Fast and balanced" },
  { id: "haiku", label: "Haiku", hint: "Quickest, lightest" },
];

export const GEMINI_MODELS = [
  { id: "default", label: "Default", hint: "Your Gemini CLI default" },
  { id: "pro", label: "Pro", hint: "Most capable" },
  { id: "flash", label: "Flash", hint: "Fast and balanced" },
  { id: "flash-lite", label: "Flash Lite", hint: "Quickest, lightest" },
];

export const PROVIDER_MODELS: Record<string, { name: string; models: { id: string; label: string; hint: string }[] }> = {
  claude: { name: "Claude", models: MODELS },
  gemini: { name: "Gemini", models: GEMINI_MODELS },
};

export const EFFORTS = [
  { id: "default", label: "Auto", hint: "Model decides" },
  { id: "low", label: "Low", hint: "Fastest" },
  { id: "medium", label: "Medium", hint: "" },
  { id: "high", label: "High", hint: "" },
  { id: "xhigh", label: "Extra high", hint: "" },
  { id: "max", label: "Max", hint: "Deepest thinking" },
];

export const PERMISSION_MODES = [
  { id: "acceptEdits", label: "Auto-accept edits", hint: "Ask before commands" },
  { id: "default", label: "Ask every time", hint: "Edits and commands" },
  { id: "plan", label: "Plan only", hint: "No changes made" },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  running: boolean;
  disabled: boolean;
  placeholder?: string;
  cwd: string | null;
  onPickFolder: () => void;
  model: string;
  onModel: (m: string, provider: ProviderId) => void;
  provider: ProviderId;
  providers: ProviderStatus[];
  /** Providers switched on in Settings → Providers (Claude is always on). */
  enabled: ProviderId[];
  permission: string;
  onPermission: (p: string) => void;
  mode: "chat" | "code";
  onMode: (m: "chat" | "code") => void;
  effort: string;
  onEffort: (e: string) => void;
  className?: string;
  /** Rendered in the toolbar just before the send button (usage gauge). */
  extra?: React.ReactNode;
}

const chip = "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-2 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground data-[popup-open]:bg-accent";

export function Composer(p: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to ~10 lines; re-measure when the width changes (wrapping changes the height).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 240) + "px";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.value]);

  const canSend = !p.disabled && !!p.value.trim();
  /** Built-in CLIs have fixed model lists; API providers list the model ids the user entered. */
  const modelsFor = (id: ProviderId) => {
    if (PROVIDER_MODELS[id]) return PROVIDER_MODELS[id];
    const st = p.providers.find((x) => x.id === id);
    return { name: st?.name ?? "API", models: (st?.models ?? []).map((m) => ({ id: m, label: m, hint: "Chat only · your API key" })) };
  };
  const pm = modelsFor(p.provider);
  const model = pm.models.find((m) => m.id === p.model) ?? pm.models[0];
  const usable = p.providers.filter((x) => x.installed && (x.id === "claude" || x.kind === "api" || p.enabled.includes(x.id)));
  const effort = EFFORTS.find((e) => e.id === p.effort) ?? EFFORTS[0];
  const perm = PERMISSION_MODES.find((m) => m.id === p.permission) ?? PERMISSION_MODES[0];

  return (
    <div className={cn("mx-auto w-full max-w-[744px] px-3 pb-3", p.className)}>
      <div className="rounded-xl bg-background shadow-raised transition-shadow focus-within:shadow-floating dark:bg-layer-1">
        <textarea
          ref={ref}
          value={p.value}
          onChange={(e) => p.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend && !p.running) p.onSend();
            }
          }}
          rows={1}
          disabled={p.disabled}
          placeholder={p.placeholder ?? "Message Claude…"}
          className="block max-h-60 w-full resize-none bg-transparent px-4 pb-2 pt-4 text-[13px] leading-5 outline-none placeholder:text-faint disabled:opacity-60"
        />
        <div className="flex h-11 items-center gap-0.5 px-2">
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(chip, "w-7 justify-center px-0")} aria-label="Add">
              <Icon name="plus" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Add</DropdownMenuLabel>
                <DropdownMenuRadioGroup value="" onValueChange={() => p.onPickFolder()}>
                  <DropdownMenuRadioItem value="folder" disabled={p.mode === "chat"}>
                    <Icon name="folder" className="text-faint" /> Project folder…
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>


          {p.mode === "code" && (
            <>
          <Tooltip>
            <TooltipTrigger render={<button onClick={p.onPickFolder} className={cn(chip, p.cwd && "text-foreground")} />}>
              <Icon name="folder" className={cn(p.cwd ? "text-primary" : "text-faint")} />
              <span className="max-w-40 truncate">{p.cwd ? p.cwd.split(/[\\/]/).pop() : "Select project"}</span>
            </TooltipTrigger>
            <TooltipContent>{p.cwd ?? "Choose the folder Claude works in"}</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger className={chip}>
              <ShieldCheck className="size-4 text-faint" />
              {perm.label}
              <Icon name="chevron-down" className="text-faint" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-60">
              <DropdownMenuGroup>
<DropdownMenuLabel>Permissions</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={p.permission} onValueChange={p.onPermission}>
                {PERMISSION_MODES.map((m) => (
                  <DropdownMenuRadioItem key={m.id} value={m.id}>
                    <div>
                      <div>{m.label}</div>
                      <div className="text-xs text-muted-foreground">{m.hint}</div>
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
</DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
            </>
          )}

          <div className="ml-auto flex items-center gap-1">
            {p.provider === "claude" && (
            <DropdownMenu>
              <DropdownMenuTrigger className={chip}>
                <Icon name="brain" className="text-faint" />
                {effort.label}
                <Icon name="chevron-down" className="text-faint" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-52">
                <DropdownMenuGroup>
<DropdownMenuLabel>Thinking effort</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={p.effort} onValueChange={p.onEffort}>
                  {EFFORTS.map((e) => (
                    <DropdownMenuRadioItem key={e.id} value={e.id}>
                      <div>
                        <div>{e.label}</div>
                        {e.hint && <div className="text-xs text-muted-foreground">{e.hint}</div>}
                      </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
</DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger className={chip}>
                <span className="text-faint">{pm.name}</span>
                <span className="text-faint">/</span>
                <span className="text-foreground">{model.label}</span>
                <Icon name="chevron-down" className="text-faint" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                {(usable.length ? usable : [{ id: "claude" as ProviderId, name: "Claude Code", loggedIn: true, installed: true }]).map((prov) => (
                  <DropdownMenuGroup key={prov.id}>
                    <DropdownMenuLabel className="flex items-center justify-between">
                      {modelsFor(prov.id).name}
                      {!prov.loggedIn && <span className="text-[11px] font-normal text-warning">not signed in</span>}
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={p.provider === prov.id ? p.model : ""} onValueChange={(v) => p.onModel(v, prov.id)}>
                      {modelsFor(prov.id).models.map((m) => (
                        <DropdownMenuRadioItem key={prov.id + m.id} value={m.id}>
                          <div>
                            <div>{m.label}</div>
                            <div className="text-xs text-muted-foreground">{m.hint}</div>
                          </div>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {p.extra}
            {p.running ? (
              <Tooltip>
                <TooltipTrigger render={<button className="btn-submit ml-1 flex size-7 items-center justify-center rounded-md p-[6px]" onClick={p.onStop} />}>
                  <Icon name="stop" />
                </TooltipTrigger>
                <TooltipContent>Stop generating</TooltipContent>
              </Tooltip>
            ) : (
              <button className="btn-submit ml-1 flex size-7 items-center justify-center rounded-md p-[6px]" disabled={!canSend} onClick={p.onSend} aria-label="Send">
                <Icon name="arrow-up" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
