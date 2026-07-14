import { type ApiToken, setsCsv, unitLabel } from "@sbl/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download } from "lucide-react";
import { useState } from "react";
import { ImportCard } from "@/components/import-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { useRepo } from "@/lib/repo";
import { type Unit, useUnit } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const UNITS: Unit[] = ["lb", "kg"];

function download(filename: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SettingsScreen() {
  const { unit, setUnit } = useUnit();
  const repo = useRepo();
  const [exporting, setExporting] = useState<"json" | "csv" | null>(null);

  async function exportData(kind: "json" | "csv") {
    setExporting(kind);
    try {
      const bundle = await repo.exportAll();
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "json") {
        download(
          `sbl-export-${stamp}.json`,
          "application/json",
          JSON.stringify(bundle, null, 2),
        );
      } else {
        download(`sbl-sets-${stamp}.csv`, "text/csv", setsCsv(bundle));
      }
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">Units</h2>
        <p className="mt-0.5 text-2xs text-faint">
          Display only — weights are stored canonically in kg.
        </p>
        <div className="mt-3 inline-flex overflow-hidden rounded-md border border-border">
          {UNITS.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              data-testid={`unit-${u}`}
              className={cn(
                "px-3 py-1 text-xs font-medium transition-colors duration-150 ease-(--ease-out-quad)",
                unit === u
                  ? "bg-surface-active text-ink"
                  : "text-soft hover:bg-surface-hover",
              )}
            >
              {unitLabel(u)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">Export</h2>
        <p className="mt-0.5 text-2xs text-faint">
          Your data, yours — full JSON graph or a flat CSV of every set.
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            disabled={exporting !== null}
            onClick={() => void exportData("json")}
            data-testid="export-json-btn"
          >
            <Download className="size-4" />
            {exporting === "json" ? "Exporting…" : "JSON"}
          </Button>
          <Button
            size="sm"
            disabled={exporting !== null}
            onClick={() => void exportData("csv")}
            data-testid="export-csv-btn"
          >
            <Download className="size-4" />
            {exporting === "csv" ? "Exporting…" : "sets.csv"}
          </Button>
        </div>
      </div>

      <ImportCard />

      <ApiTokensSection />

      <div className="mt-4 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">Account</h2>
        <Button
          variant="danger"
          size="sm"
          className="mt-3"
          onClick={() => void supabase.auth.signOut()}
          data-testid="sign-out-btn"
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}

function ApiTokensSection() {
  const repo = useRepo();
  const qc = useQueryClient();
  const { data: tokens = [] } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => repo.listApiTokens(),
  });
  const [name, setName] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (n: string) => repo.createApiToken(n),
    onSuccess: ({ token }) => {
      setPlaintext(token);
      void qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => repo.revokeApiToken(id),
    onSettled: () => qc.invalidateQueries({ queryKey: ["api-tokens"] }),
  });

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium">API tokens</h2>
      <p className="mt-0.5 text-2xs text-faint">
        Read-only access to your data for scripts, dashboards, and the MCP
        server.
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate(name.trim());
          setName("");
        }}
      >
        <Input
          placeholder="Token name (e.g. mcp)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="token-name-input"
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={name.trim().length === 0 || create.isPending}
          data-testid="create-token-btn"
        >
          Create
        </Button>
      </form>

      {tokens.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-md border border-border">
          {tokens.map((t) => (
            <TokenRow
              key={t.id}
              token={t}
              onRevoke={() => revoke.mutate(t.id)}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={plaintext !== null}
        onOpenChange={(o) => !o && setPlaintext(null)}
      >
        <DialogContent title="Token created — copy it now">
          <p className="text-xs text-soft">
            This is shown once. Store it somewhere safe; only its hash is kept.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs"
              data-testid="token-plaintext"
            >
              {plaintext}
            </code>
            <Button
              size="icon"
              variant="ghost"
              title="Copy"
              onClick={() =>
                plaintext && void navigator.clipboard.writeText(plaintext)
              }
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TokenRow({
  token,
  onRevoke,
}: {
  token: ApiToken;
  onRevoke: () => void;
}) {
  const revoked = token.revokedAt != null;
  return (
    <li className="flex items-center justify-between px-3 py-2 text-sm">
      <span className={cn(revoked && "text-faint line-through")}>
        {token.name}
      </span>
      <span className="flex items-center gap-2">
        <span className="num text-2xs text-faint">
          created {formatDate(token.createdAt)}
          {token.lastUsedAt != null &&
            ` · used ${formatDate(token.lastUsedAt)}`}
        </span>
        {revoked ? (
          <span className="text-2xs text-faint uppercase">revoked</span>
        ) : (
          <Button
            size="sm"
            variant="danger"
            onClick={onRevoke}
            data-testid={`revoke-${token.name}`}
          >
            Revoke
          </Button>
        )}
      </span>
    </li>
  );
}
