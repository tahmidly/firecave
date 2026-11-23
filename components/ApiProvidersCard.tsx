"use client";

import { useEffect, useState } from "react";
import type { ApiProvider } from "@/shared/types";
import { getApi } from "@/lib/transport";
import { uid } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Btn, Card, Field, Row, Segmented } from "@/components/settings-ui";

const KINDS: { id: ApiProvider["kind"]; label: string; url: string; example: string }[] = [
  { id: "openai", label: "OpenAI-compatible", url: "https://api.openai.com/v1", example: "gpt-4.1, gpt-4.1-mini" },
  { id: "anthropic", label: "Anthropic", url: "https://api.anthropic.com", example: "claude-sonnet-5-5" },
  { id: "gemini", label: "Google Gemini", url: "https://generativelanguage.googleapis.com", example: "gemini-2.5-pro, gemini-2.5-flash" },
];

const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));

/** Settings → Providers: custom providers reached with your own API key (chat only). */
export function ApiProvidersCard({ onChanged }: { onChanged?: () => void }) {
  const api = getApi();
  const [list, setList] = useState<ApiProvider[]>([]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<ApiProvider["kind"]>("openai");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [key, setKey] = useState("");
  const [models, setModels] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api?.apiProvidersList?.().then(setList).catch(() => {});
  }, [api]);

  if (!api?.apiProvidersList) return null;

  const k = KINDS.find((x) => x.id === kind)!;

  function reset() {
    setAdding(false);
    setName("");
    setBaseUrl("");
    setKey("");
    setModels("");
    setError(null);
  }

  async function save() {
    setError(null);
    try {
      const next = await api!.apiProvidersSave!({
        id: uid(),
        name: name.trim() || k.label,
        kind,
        baseUrl: baseUrl.trim() || k.url,
        models: models.split(/[,\n]/).map((m) => m.trim()).filter(Boolean),
        apiKey: key,
      });
      setList(next);
      reset();
      onChanged?.();
    } catch (e) {
      setError(clean(e));
    }
  }

  async function remove(id: string) {
    setList(await api!.apiProvidersDelete!(id));
    onChanged?.();
  }

  return (
    <Card
      title="Custom (API key)"
      action={
        !adding && (
          <Btn onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} /> Add provider
          </Btn>
        )
      }
    >
      {list.length === 0 && !adding && <Row title="None yet" description="Add any OpenAI-compatible, Anthropic or Google Gemini endpoint with your own key." />}
      {list.map((p) => (
        <Row
          key={p.id}
          title={
            <span className="flex items-center gap-2">
              {p.name}
              <span className="rounded-[4px] bg-layer-2 px-1.5 text-[11px] font-normal text-muted-foreground">{KINDS.find((x) => x.id === p.kind)?.label}</span>
            </span>
          }
          description={
            <span className="block truncate">
              {p.models.join(", ")} · <span className="font-mono text-[12px]">{p.baseUrl}</span>
            </span>
          }
        >
          <span className={`text-[13px] font-medium ${p.hasKey ? "text-success" : "text-warning"}`}>{p.hasKey ? "Key saved" : "No key"}</span>
          <button onClick={() => void remove(p.id)} aria-label={`Remove ${p.name}`} className="flex size-7 items-center justify-center rounded-[6px] text-faint hover:bg-accent hover:text-destructive">
            <Icon name="trash" />
          </button>
        </Row>
      ))}

      {adding && (
        <div className="space-y-3 border-t border-border py-4 first:border-t-0">
          <div className="flex items-center justify-between gap-4">
            <div className="text-[14px] font-medium">New provider</div>
            <Segmented value={kind} options={KINDS.map((x) => ({ id: x.id, label: x.label }))} onChange={setKind} />
          </div>
          <div className="grid gap-2">
            <Field placeholder={`Name (e.g. ${k.label})`} value={name} onChange={(e) => setName(e.target.value)} />
            <Field placeholder={k.url} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="font-mono" />
            <Field type="password" autoComplete="off" placeholder="API key" value={key} onChange={(e) => setKey(e.target.value)} className="font-mono" />
            <Field placeholder={`Model ids, comma separated (e.g. ${k.example})`} value={models} onChange={(e) => setModels(e.target.value)} className="font-mono" />
          </div>
          <p className="flex gap-2 text-[12px] leading-4 text-muted-foreground">
            <Icon name="lock" size={14} className="text-faint" />
            The key is encrypted with Windows&apos; own protection and stays on this computer. It is only used to call this provider, never shown again, and never sent to other devices. API providers are chat only: no files or commands.
          </p>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
          <div className="flex justify-end gap-1.5">
            <Btn variant="ghost" onClick={reset}>
              Cancel
            </Btn>
            <Btn variant="primary" disabled={!models.trim()} onClick={() => void save()}>
              Add provider
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}
