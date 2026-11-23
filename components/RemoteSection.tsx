"use client";

import { useCallback, useEffect, useState } from "react";
import type { RemoteConfig, RemoteInfo } from "@/shared/types";
import { getApi } from "@/lib/transport";
import { Switch } from "@/components/ui/switch";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { Btn, Card, Field, Row, Segmented } from "@/components/settings-ui";

/** Settings → Pairing. Desktop only: these API methods do not exist over the network. */
export function RemoteSection() {
  const api = getApi();
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [port, setPort] = useState("3777");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const refresh = useCallback(async () => {
    if (!api?.remoteGet) return;
    const i = await api.remoteGet();
    setInfo(i);
    setPort((p) => (document.activeElement?.id === "remote-port" ? p : String(i.port)));
  }, [api]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000); // keeps "devices connected" fresh
    return () => clearInterval(t);
  }, [refresh]);

  if (!api?.remoteSet || !info) return null;

  async function apply(patch: Partial<RemoteConfig>) {
    if (!api?.remoteSet || !info) return;
    setBusy(true);
    setError(null);
    try {
      setInfo(await api.remoteSet({ enabled: info.enabled, access: info.access, port: Number(port), ...patch }));
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!api?.remoteRegenerate) return;
    setInfo(await api.remoteRegenerate());
    setConfirmRegen(false);
  }

  const status = info.running ? `On · ${info.clients} device${info.clients === 1 ? "" : "s"} connected` : "Off · nothing is listening on the network";

  return (
    <>
      <Card title="Remote control">
        <Row
          title="Control this app from another device"
          description={
            <span className="flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${info.running ? "bg-success" : "bg-faint"}`} />
              {status}
            </span>
          }
        >
          <Switch checked={info.enabled} disabled={busy} onCheckedChange={(v) => void apply({ enabled: v })} />
        </Row>
        {info.enabled && (
          <>
            <Row title="Who can connect" description={info.access === "lan" ? "Phones and laptops on your router" : "Only this computer (for testing)"}>
              <Segmented
                value={info.access}
                disabled={busy}
                options={[
                  { id: "lan", label: "Local network" },
                  { id: "local", label: "This computer" },
                ]}
                onChange={(v) => void apply({ access: v })}
              />
            </Row>
            <Row title="Port" description="Between 1024 and 65535">
              <Field id="remote-port" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} className="w-20 text-center font-mono" />
              <Btn disabled={busy || Number(port) === info.port} onClick={() => void apply({})}>
                Apply
              </Btn>
            </Row>
          </>
        )}
        {(info.error || error) && <p className="pb-3 text-[13px] text-destructive">{info.error ? `Could not start: ${info.error}` : error}</p>}
      </Card>

      {info.enabled && (
        <Card title="Connect a device">
          <Row title="Address" description="Open this on the other device">
            <div className="flex flex-col items-end gap-1">
              {info.urls.map((u) => (
                <div key={u} className="flex items-center gap-1">
                  <code className="font-mono text-[13px]">{u}</code>
                  <CopyButton text={u} />
                </div>
              ))}
            </div>
          </Row>
          <Row title="Access token" description="The device asks for it once">
            <code className="w-56 truncate text-right font-mono text-[13px]">{reveal ? info.token : "•".repeat(24)}</code>
            <button onClick={() => setReveal((r) => !r)} aria-label="Show or hide token" className="flex size-6 items-center justify-center rounded-[4px] text-faint hover:bg-accent hover:text-foreground">
              <Icon name={reveal ? "outline-eye-slash" : "eye"} size={14} />
            </button>
            <CopyButton text={info.token} />
          </Row>
          <Row title="New token" description={confirmRegen ? "Every connected device will be signed out." : "Sign out every device and make a new token"}>
            {confirmRegen ? (
              <>
                <Btn variant="ghost" onClick={() => setConfirmRegen(false)}>
                  Cancel
                </Btn>
                <Btn variant="danger" onClick={() => void regenerate()}>
                  Regenerate
                </Btn>
              </>
            ) : (
              <Btn onClick={() => setConfirmRegen(true)}>
                <Icon name="refresh" size={14} /> Regenerate
              </Btn>
            )}
          </Row>
        </Card>
      )}

      <div className="flex gap-2.5 rounded-[10px] bg-layer-1 p-4 text-[13px] leading-5 text-muted-foreground shadow-raised">
        <Icon name="warning" className="mt-0.5 text-warning" />
        <div className="space-y-1.5">
          <p>Anyone with the token can have Claude read and edit your project files and run approved commands on this PC. Keep it private, and regenerate it if it leaks.</p>
          <p>
            Traffic is plain HTTP, so use it only on a network you trust. To reach it away from home, use a VPN such as Tailscale. Don&apos;t port-forward this to the internet. Windows may ask to allow Firecave through the firewall:
            allow Private networks only.
          </p>
        </div>
      </div>
    </>
  );
}

/** Compact remote-control switch for the sidebar footer, with a gear that opens Settings → Pairing. */
export function RemoteQuickToggle({ onSettings }: { onSettings: () => void }) {
  const api = getApi();
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api?.remoteGet) return;
    let off = false;
    const load = () => void api.remoteGet!().then((i) => !off && setInfo(i)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, [api]);

  if (!api?.remoteSet || !info) return null;

  return (
    <div className="flex h-8 items-center gap-2 rounded-[6px] px-2 text-[13px] text-faint">
      <Icon name="monitor" />
      <span className="min-w-0 flex-1 truncate" title={info.urls[0]}>
        Remote control
        {info.running && <span className="ml-1.5 text-[11px] text-success">{info.clients ? `${info.clients} connected` : "on"}</span>}
      </span>
      <Switch
        checked={info.enabled}
        disabled={busy}
        aria-label="Remote control"
        onCheckedChange={async (v) => {
          setBusy(true);
          try {
            setInfo(await api.remoteSet!({ enabled: v, access: info.access, port: info.port }));
          } finally {
            setBusy(false);
          }
        }}
      />
      <button onClick={onSettings} aria-label="Remote control settings" className="flex size-6 items-center justify-center rounded-[4px] hover:bg-sidebar-accent hover:text-foreground">
        <Icon name="settings-gear" size={14} />
      </button>
    </div>
  );
}
