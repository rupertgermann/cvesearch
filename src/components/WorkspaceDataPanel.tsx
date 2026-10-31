"use client";

import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { Badge, Button, Callout, Card, Flex, Heading, Text } from "@radix-ui/themes";
import ConfirmationDialog from "./ConfirmationDialog";

interface ImportResult {
  success: boolean;
  mode: "merge" | "replace";
  imported: {
    watchlist: number;
    savedViews: number;
    alertRules: number;
    inventoryAssets: number;
    triageRecords: number;
  };
}

export default function WorkspaceDataPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState<null | "export" | "import">(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  const handleExport = async () => {
    setBusy("export");
    setMessage(null);

    try {
      const res = await fetch("/api/workspace/export", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to export workspace data");
      }

      const snapshot = await res.json();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const date = typeof snapshot?.exportedAt === "string" ? snapshot.exportedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `cvesearch-workspace-${date}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage({ type: "success", text: "Workspace export downloaded." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to export workspace data" });
    } finally {
      setBusy(null);
    }
  };

  const importSnapshot = async (file: File) => {
    setBusy("import");
    setMessage(null);

    try {
      const text = await file.text();
      const snapshot = JSON.parse(text);
      const res = await fetch("/api/workspace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, snapshot }),
      });
      const data = (await res.json().catch(() => null)) as ImportResult | { error?: string } | null;

      if (!res.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Failed to import workspace data");
      }

      const result = data as ImportResult;
      setMessage({
        type: "success",
        text: `Imported ${result.imported.watchlist} watchlist items, ${result.imported.savedViews} saved views, ${result.imported.alertRules} alert rules, ${result.imported.inventoryAssets} inventory assets, and ${result.imported.triageRecords} triage records using ${result.mode} mode.`,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to import workspace data" });
    } finally {
      setBusy(null);
      setPendingImportFile(null);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (mode === "replace") {
      setPendingImportFile(file);
      return;
    }

    await importSnapshot(file);
  };

  return (
    <Card size="3" className="border border-white/[0.06] bg-white/[0.03]">
      <Flex justify="between" align={{ initial: "start", md: "center" }} gap="4" wrap="wrap">
        <div>
          <Heading size="4" className="text-white">Workspace Data</Heading>
          <Text as="p" size="2" color="gray" className="mt-1 max-w-3xl">
            Export or import watchlist items, saved views, alert rules, inventory assets, and triage records for this workspace.
          </Text>
        </div>
        <Flex gap="2" wrap="wrap">
          <Badge color={mode === "merge" ? "cyan" : "gray"} variant="soft">{mode === "merge" ? "Merge Mode" : "Replace Mode"}</Badge>
          <Button variant="soft" color="gray" disabled={busy !== null} onClick={() => void handleExport()}>
            {busy === "export" ? "Exporting..." : "Export JSON"}
          </Button>
          <Button disabled={busy !== null} onClick={() => fileInputRef.current?.click()}>
            {busy === "import" ? "Importing..." : "Import JSON"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImport(event)}
            className="hidden"
          />
        </Flex>
      </Flex>

      <Flex gap="2" wrap="wrap" className="mt-4">
        <Button variant={mode === "merge" ? "solid" : "soft"} color="cyan" onClick={() => setMode("merge")}>
          Merge Import
        </Button>
        <Button variant={mode === "replace" ? "solid" : "soft"} color="amber" onClick={() => setMode("replace")}>
          Replace Existing
        </Button>
      </Flex>

      <Text as="p" size="1" color="gray" className="mt-2">
        `Merge` keeps current data and upserts imported records. `Replace` clears current workspace data first.
      </Text>

      {message ? (
        <div className="mt-4">
          <Callout.Root color={message.type === "error" ? "red" : "green"} variant="soft">
            <Callout.Text>{message.text}</Callout.Text>
          </Callout.Root>
        </div>
      ) : null}

      <ConfirmationDialog
        open={pendingImportFile !== null}
        title="Replace existing workspace data?"
        message="Replace mode clears the current workspace before importing the selected snapshot. This is intended for full restores, not incremental merges."
        confirmLabel="Replace and Import"
        busy={busy !== null}
        onConfirm={() => {
          if (!pendingImportFile) {
            return;
          }
          void importSnapshot(pendingImportFile);
        }}
        onClose={() => {
          setPendingImportFile(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }}
      />
    </Card>
  );
}
