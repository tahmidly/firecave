"use client";

import { useEffect, useState } from "react";
import type { ProviderStatus } from "@/shared/types";
import type { ClaudeStatus, Settings } from "@/shared/types";
import { Icon, type IconName } from "@/components/Icon";
import { PluginsManager } from "@/components/PluginsManager";
import { RemoteSection } from "@/components/RemoteSection";
import { ApiProvidersCard } from "@/components/ApiProvidersCard";
import { MODELS, PERMISSION_MODES } from "@/components/chat/Composer";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getApi } from "@/lib/transport";
import { Card, Row } from "@/components/settings-ui";
import { cn } from "@/lib/utils";

export type SettingsPageId = "preferences" | "appearance" | "providers" | "models" | "extensions" | "pairing" | "about";

const NAV: { label?: string; items: { id: SettingsPageId; label: string; icon: IconName }[] }[] = [
  {
    items: [
      { id: "preferences", label: "Preferences", icon: "sliders" },
      { id: "appearance", label: "Appearance", icon: "appearance" },
    ],
  },
  {
    items: [
      { id: "providers", label: "Providers", icon: "providers" },
      { id: "models", label: "Models", icon: "models" },
      { id: "extensions", label: "Extensions", icon: "extensions" },
      { id: "pairing", label: "Pairing", icon: "monitor" },
    ],
  },
  { items: [{ id: "about", label: "About", icon: "info" }] },
];

const TITLES: Record<SettingsPageId, [string, string]> = {
  preferences: ["Preferences", "Customize permissions and default behavior"],
  appearance: ["Appearance", "Choose how Firecave looks"],
  providers: ["Providers", "AI command-line tools installed on this computer. Each keeps its own sign-in."],
  models: ["Models", "Pick the Claude model new sessions start with"],
  extensions: ["Extensions", "Tools Claude can use in Code mode. They live only in Firecave."],
  pairing: ["Pairing", "Control this app from your phone or another computer"],
  about: ["About", "Claude Code installation and credits"],
};

/** Text-style dropdown like opencode's ("English ⌄"). */
function Picker({ value, options, onChange }: { value: string; options: { id: string; label: string }[]; onChange: (v: string) => void }) {
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[13px] font-medium outline-none hover:bg-accent data-[popup-open]:bg-accent">
        {current.label}
        <Icon name="chevron-down" className="text-faint" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.id} value={o.id}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface Props {
  settings: Settings;
  status: ClaudeStatus | null;
  theme: "dark" | "light";
  onTheme: (t: "dark" | "light") => void;
  onChange: (key: string, value: string) => void;
  onBack: () => void;
  initial?: SettingsPageId;
}

export function SettingsPage({ settings, status, theme, onTheme, onChange, onBack, initial = "preferences" }: Props) {
  const [page, setPage] = useState<SettingsPageId>(initial);
  const desktop = !!getApi()?.remoteGet;
  const mode = settings.permissionMode || "acceptEdits";
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  useEffect(() => {
    if (page !== "providers") return;
    setProviders(null);
    getApi()?.providersStatus?.().then(setProviders).catch(() => setProviders([]));
  }, [page]);

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto rounded-[10px] bg-background shadow-raised">
      <div className="flex w-full max-w-[1048px] gap-10 px-6">
        <nav className="sticky top-0 hidden w-60 shrink-0 self-start pt-12 md:block">
          <button onClick={onBack} className="mb-8 flex h-7 items-center gap-2 rounded-[6px] px-2 text-[13px] font-medium text-muted-foreground hover:text-foreground">
            <Icon name="arrow-left" /> Back to app
          </button>
          <div className="space-y-4">
            {NAV.map((g, i) => (
              <div key={i} className="space-y-0.5">
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setPage(it.id)}
                    className={cn(
                      "flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[13px] transition-colors",
                      page === it.id ? "bg-layer-2 font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon name={it.icon} className={page === it.id ? "text-foreground" : "text-faint"} />
                    {it.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0 max-w-[720px] flex-1 pb-16 pt-12">
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <Icon name="arrow-left" /> Back
            </Button>
            <Picker value={page} options={NAV.flatMap((g) => g.items).map((i) => ({ id: i.id, label: i.label }))} onChange={(v) => setPage(v as SettingsPageId)} />
          </div>
          <h1 className="text-[16px] font-medium">{TITLES[page][0]}</h1>
          <p className="mb-8 mt-1 text-[14px] text-muted-foreground">{TITLES[page][1]}</p>

          {page === "preferences" && (
            <Card title="General">
              <Row title="Auto-accept permissions" description="Let Claude edit files without asking. Commands still ask for approval.">
                <Switch checked={mode === "acceptEdits"} onCheckedChange={(v) => onChange("permissionMode", v ? "acceptEdits" : "default")} />
              </Row>
              <Row title="Permission mode" description="How Claude asks before changing your project.">
                <Picker value={mode} options={PERMISSION_MODES.map((m) => ({ id: m.id, label: m.label }))} onChange={(v) => onChange("permissionMode", v)} />
              </Row>
              <Row
                title="Default project folder"
                description={settings.defaultDir ? <span className="font-mono text-[12px]">{settings.defaultDir}</span> : "New Code sessions start without a folder."}
              >
                <div className="flex gap-1.5">
                  {settings.defaultDir && (
                    <Button variant="ghost" size="sm" onClick={() => onChange("defaultDir", "")}>
                      Clear
                    </Button>
                  )}
                  {desktop && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const f = await getApi()?.selectFolder();
                        if (f) onChange("defaultDir", f);
                      }}
                    >
                      Browse
                    </Button>
                  )}
                </div>
              </Row>
            </Card>
          )}

          {page === "appearance" && (
            <Card title="Theme">
              <Row title="Color scheme" description="Firecave purple, in light or dark.">
                <div className="flex gap-2">
                  {(["dark", "light"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => onTheme(t)}
                      className={cn(
                        "w-28 overflow-hidden rounded-[8px] text-left text-[12px] font-medium shadow-btn",
                        theme === t ? "ring-2 ring-primary" : "opacity-80 hover:opacity-100",
                      )}
                    >
                      <div className={cn("h-12 p-2", t === "dark" ? ("bg-[#0c0a14]") : "bg-[#f6f3fd]")}>
                        <div className={cn("h-full rounded-[4px]", t === "dark" ? "bg-[#1d1830]" : "bg-white shadow-sm")} />
                      </div>
                      <div className="bg-layer-2 px-2 py-1 capitalize">{t}</div>
                    </button>
                  ))}
                </div>
              </Row>
            </Card>
          )}

          {page === "providers" && (
            <>
              <Card title="Installed on this computer">
                {providers === null && <Row title="Checking…" description="Looking for installed CLIs" />}
                {providers?.filter((pr) => pr.kind !== "api").map((pr) => (
                  <Row
                    key={pr.id}
                    title={
                      <span className="flex items-center gap-2">
                        {pr.name}
                        {pr.version && <span className="rounded-[4px] bg-layer-2 px-1.5 text-[11px] font-normal text-muted-foreground">{pr.version.split(" ")[0]}</span>}
                      </span>
                    }
                    description={!pr.installed ? "Not installed" : pr.loggedIn ? (pr.path ? <span className="font-mono text-[12px]">{pr.path}</span> : "Ready") : pr.hint}
                  >
                    {pr.id !== "claude" && pr.installed && (
                      <Switch
                        aria-label={`Show ${pr.name} in the model menu`}
                        checked={(settings.providersEnabled ?? "").split(",").includes(pr.id)}
                        onCheckedChange={(v) => {
                          const cur = new Set((settings.providersEnabled ?? "").split(",").filter(Boolean));
                          if (v) cur.add(pr.id);
                          else cur.delete(pr.id);
                          onChange("providersEnabled", [...cur].join(","));
                        }}
                      />
                    )}
                    <span className={cn("flex items-center gap-1.5 text-[13px] font-medium", pr.installed && pr.loggedIn ? "text-success" : pr.installed ? "text-warning" : "text-faint")}>
                      <span className={cn("size-1.5 rounded-full", pr.installed && pr.loggedIn ? "bg-success" : pr.installed ? "bg-warning" : "bg-faint")} />
                      {pr.installed && pr.loggedIn ? "Ready" : pr.installed ? "Sign in needed" : "Not found"}
                    </span>
                  </Row>
                ))}
              </Card>
              <ApiProvidersCard />
              <p className="text-[13px] leading-5 text-faint">
                Switch a provider on to show its models in the composer's model menu. Claude Code is always on. Firecave runs the official CLI and never reads or copies its credentials. Plugins, effort and Allow-once approvals currently apply to Claude Code only.
              </p>
            </>
          )}

          {page === "models" && (
            <Card title="Default model">
              {MODELS.map((m) => (
                <Row key={m.id} title={m.label} description={m.hint}>
                  <Switch checked={(settings.defaultModel || "default") === m.id} onCheckedChange={(v) => v && onChange("defaultModel", m.id)} />
                </Row>
              ))}
            </Card>
          )}

          {page === "extensions" && <PluginsManager />}

          {page === "pairing" &&
            (desktop ? (
              <RemoteSection />
            ) : (
              <Card>
                <Row title="Managed on the computer" description="Pairing can only be changed in the desktop app." />
              </Card>
            ))}

          {page === "about" && (
            <>
              <Card title="Claude Code">
                <Row title="Installation" description={status?.path ?? "Not detected"}>
                  <span className="text-[13px] text-muted-foreground">{status?.version ?? "—"}</span>
                </Row>
                <Row
                  title="Account"
                  description={status?.loggedIn ? `Signed in via ${status.authMethod}` : "Not signed in — run `claude auth login` in a terminal"}
                >
                  <span className={cn("text-[13px] font-medium", status?.loggedIn ? "text-success" : "text-destructive")}>{status?.loggedIn ? status.subscriptionType ?? "Signed in" : "Signed out"}</span>
                </Row>
              </Card>
              <Card title="Credits">
                <Row title="Design" description="Visual design, colour tokens and icons adapted from opencode (MIT License, © 2025 opencode). See THIRD_PARTY_NOTICES.md." />
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
