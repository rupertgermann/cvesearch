"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Flex, Grid, Heading, Text, TextArea, TextField } from "@radix-ui/themes";
import { createInventoryAsset, deleteInventoryAsset, INVENTORY_UPDATED_EVENT, loadInventoryAssets } from "@/lib/inventory";
import { InventoryAssetRecord } from "@/lib/workspace-types";

const DEFAULT_FORM = {
  name: "",
  vendor: "",
  product: "",
  version: "",
  environment: "production",
  criticality: "medium" as InventoryAssetRecord["criticality"],
  notes: "",
};

export default function InventoryAssetsPanel({ initialAssets }: { initialAssets: InventoryAssetRecord[] }) {
  const [assets, setAssets] = useState<InventoryAssetRecord[]>(initialAssets);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [busy, setBusy] = useState<null | "create" | `delete:${string}`>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const sync = async () => setAssets(await loadInventoryAssets());
    void sync();
    window.addEventListener(INVENTORY_UPDATED_EVENT, sync);
    return () => window.removeEventListener(INVENTORY_UPDATED_EVENT, sync);
  }, []);

  const criticalCount = useMemo(() => assets.filter((asset) => asset.criticality === "critical").length, [assets]);

  async function handleCreate() {
    if (!form.name.trim() || (!form.vendor.trim() && !form.product.trim())) {
      setMessage({ type: "error", text: "Provide an asset name plus at least a vendor or product." });
      return;
    }

    setBusy("create");
    setMessage(null);
    try {
      const created = await createInventoryAsset(form);
      setAssets((current) => [created, ...current.filter((asset) => asset.id !== created.id)]);
      setForm(DEFAULT_FORM);
      setMessage({ type: "success", text: `Added ${created.name} to the inventory.` });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to create inventory asset" });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(id: string) {
    setBusy(`delete:${id}`);
    setMessage(null);
    try {
      await deleteInventoryAsset(id);
      setAssets((current) => current.filter((asset) => asset.id !== id));
      setMessage({ type: "success", text: "Removed inventory asset." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to delete inventory asset" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card size="3" className="border border-white/[0.06] bg-white/[0.03]">
      <Flex justify="between" align={{ initial: "start", md: "center" }} gap="4" wrap="wrap">
        <div>
          <Heading size="4" className="text-white">Inventory Mapping</Heading>
          <Text as="p" size="2" color="gray" className="mt-1 max-w-3xl">
            Track internal systems, vendors, and products so exposure agents can estimate likely impact against your environment.
          </Text>
        </div>
        <Flex gap="2" wrap="wrap">
          <Badge color="cyan" variant="soft">{assets.length} assets</Badge>
          <Badge color={criticalCount > 0 ? "red" : "gray"} variant="soft">{criticalCount} critical</Badge>
        </Flex>
      </Flex>

      <Grid columns={{ initial: "1", lg: "2" }} gap="4" className="mt-4">
        <Card size="2" className="border border-white/[0.06] bg-black/20">
          <Heading size="3" className="text-white">Add Inventory Asset</Heading>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <TextField.Root value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Public API Gateway" />
            </Field>
            <Field label="Environment">
              <TextField.Root value={form.environment} onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value }))} placeholder="production" />
            </Field>
            <Field label="Vendor">
              <TextField.Root value={form.vendor} onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))} placeholder="Acme" />
            </Field>
            <Field label="Product">
              <TextField.Root value={form.product} onChange={(event) => setForm((current) => ({ ...current, product: event.target.value }))} placeholder="gateway" />
            </Field>
            <Field label="Version">
              <TextField.Root value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} placeholder="1.2.x" />
            </Field>
            <Field label="Criticality">
              <select
                value={form.criticality}
                onChange={(event) => setForm((current) => ({ ...current, criticality: event.target.value as InventoryAssetRecord["criticality"] }))}
                className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none"
              >
                <option value="critical">critical</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <TextArea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Internet-facing gateway serving customer traffic" />
              </Field>
            </div>
          </div>

          <Button className="mt-4" disabled={busy !== null} onClick={() => void handleCreate()}>
            {busy === "create" ? "Adding..." : "Add Asset"}
          </Button>
        </Card>

        <Card size="2" className="border border-white/[0.06] bg-black/20">
          <Heading size="3" className="text-white">Tracked Assets</Heading>
          {assets.length > 0 ? (
            <div className="mt-4 space-y-3">
              {assets.map((asset) => (
                <Card key={asset.id} size="2" className="border border-white/[0.06] bg-white/[0.03]">
                  <Flex justify="between" align="start" gap="3">
                    <div>
                      <Heading size="3" className="text-white">{asset.name}</Heading>
                      <Text as="p" size="2" color="gray" className="mt-1">
                        {[asset.vendor, asset.product, asset.version].filter(Boolean).join(" / ") || "No vendor or product specified"}
                      </Text>
                      <Flex gap="2" wrap="wrap" className="mt-3">
                        <Badge color="cyan" variant="soft">{asset.environment}</Badge>
                        <Badge color={asset.criticality === "critical" ? "red" : asset.criticality === "high" ? "amber" : asset.criticality === "medium" ? "blue" : "gray"} variant="soft">{asset.criticality}</Badge>
                      </Flex>
                      {asset.notes ? <Text as="p" size="2" color="gray" className="mt-3">{asset.notes}</Text> : null}
                    </div>
                    <Button color="red" variant="soft" disabled={busy !== null} onClick={() => void handleDelete(asset.id)}>
                      {busy === `delete:${asset.id}` ? "Removing..." : "Delete"}
                    </Button>
                  </Flex>
                </Card>
              ))}
            </div>
          ) : (
            <Text as="p" size="2" color="gray" className="mt-4">
              No assets tracked yet. Add vendor and product mappings here so exposure guidance can estimate internal impact.
            </Text>
          )}
        </Card>
      </Grid>

      {message ? (
        <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${message.type === "error" ? "border-red-500/20 bg-red-500/10 text-red-200" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"}`}>
          {message.text}
        </div>
      ) : null}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <Text as="span" size="1" weight="bold" className="mb-2 block uppercase tracking-wider text-gray-500">{label}</Text>
      {children}
    </label>
  );
}
