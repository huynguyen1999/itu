import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, KeyRound, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react';
import type { AiCredential } from '@/shared/api/client';
import { api } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

export function AiSettingsPanel() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [replacement, setReplacement] = useState<Record<string, string>>({});
  const credentials = useQuery({ queryKey: ['ai-credentials'], queryFn: () => api.listAiCredentials() });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['ai-credentials'] });
  const add = useMutation({
    mutationFn: (key: string) => api.addAiCredential(key),
    onSuccess: () => {
      setApiKey('');
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { apiKey?: string; enabled?: boolean } }) =>
      api.updateAiCredential(id, patch),
    onSuccess: refresh,
  });
  const test = useMutation({ mutationFn: (id: string) => api.testAiCredential(id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api.removeAiCredential(id), onSuccess: refresh });
  const items = credentials.data ?? [];
  const error = [credentials.error, add.error, update.error, test.error, remove.error].find(Boolean);

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-3 text-sm">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-muted-foreground">
          Gemini keys are encrypted before storage. Add up to five keys; enabled healthy keys are rotated automatically.
        </p>
      </div>

      <form
        className="grid gap-2 border-t pt-4 sm:grid-cols-[1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (apiKey.trim()) add.mutate(apiKey);
        }}
      >
        <Input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Paste a Gemini API key"
          aria-label="Gemini API key"
          disabled={items.length >= 5 || add.isPending}
        />
        <Button type="submit" disabled={items.length >= 5 || !apiKey.trim() || add.isPending}>
          {add.isPending ? <LoaderCircle className="animate-spin" /> : null}
          Add key ({items.length}/5)
        </Button>
      </form>

      {credentials.isLoading ? <p className="text-sm text-muted-foreground">Loading Gemini credentials…</p> : null}
      {items.map((credential) => (
        <CredentialRow
          key={credential.id}
          credential={credential}
          replacement={replacement[credential.id] ?? ''}
          isPending={update.isPending || test.isPending || remove.isPending}
          onReplacementChange={(value) => setReplacement((current) => ({ ...current, [credential.id]: value }))}
          onToggle={() => update.mutate({ id: credential.id, patch: { enabled: !credential.enabled } })}
          onReplace={() => {
            const value = replacement[credential.id]?.trim();
            if (!value) return;
            update.mutate({ id: credential.id, patch: { apiKey: value } });
            setReplacement((current) => ({ ...current, [credential.id]: '' }));
          }}
          onTest={() => test.mutate(credential.id)}
          onRemove={() => remove.mutate(credential.id)}
        />
      ))}
      {!credentials.isLoading && items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No Gemini keys configured.</p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Gemini credential request failed.'}
        </p>
      ) : null}
    </div>
  );
}

function CredentialRow({
  credential,
  replacement,
  isPending,
  onReplacementChange,
  onToggle,
  onReplace,
  onTest,
  onRemove,
}: {
  credential: AiCredential;
  replacement: string;
  isPending: boolean;
  onReplacementChange: (value: string) => void;
  onToggle: () => void;
  onReplace: () => void;
  onTest: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <code className="text-sm">{credential.keyHint}</code>
          <span className="text-xs font-semibold text-muted-foreground">{credential.status}</span>
          {credential.usable ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Usable" /> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onToggle}>
            {credential.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onTest}>
            <RefreshCw /> Test Connection
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={isPending}
            onClick={onRemove}
          >
            <Trash2 /> Remove
          </Button>
        </div>
      </div>
      {credential.lastError ? <p className="text-xs text-destructive">{credential.lastError}</p> : null}
      {credential.cooldownUntil ? (
        <p className="text-xs text-muted-foreground">
          Cooldown until {new Date(credential.cooldownUntil).toLocaleString()}.
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="password"
          value={replacement}
          onChange={(event) => onReplacementChange(event.target.value)}
          placeholder="Replace key"
          aria-label={`Replace ${credential.keyHint}`}
          disabled={isPending}
        />
        <Button type="button" variant="outline" disabled={!replacement.trim() || isPending} onClick={onReplace}>
          Replace
        </Button>
      </div>
    </div>
  );
}
