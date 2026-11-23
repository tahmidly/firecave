"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { setToken, verifyToken } from "@/lib/transport";

export function RemoteLogin({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const t = value.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    const err = await verifyToken(t);
    setBusy(false);
    if (err) return setError(err);
    setToken(t);
    onDone();
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 shadow-lg"
      >
        <div className="flex items-center gap-3">
          <Logo className="size-9" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Firecave</h1>
            <p className="text-xs text-muted-foreground">Remote access to your desktop app</p>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="tok">
            Access token
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="tok" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste the token from Settings" className="pl-9" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">Find it on the computer: Settings → Remote control.</p>
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={busy || !value.trim()}>
          {busy ? "Checking…" : "Connect"}
        </Button>
      </form>
    </div>
  );
}
