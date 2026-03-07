import { InventoryAssetRecord } from "./workspace-types";

export const INVENTORY_UPDATED_EVENT = "cvesearch:inventory-updated";

let inventoryCache: InventoryAssetRecord[] = [];

export async function loadInventoryAssets(): Promise<InventoryAssetRecord[]> {
  const res = await fetch("/api/inventory", { cache: "no-store" });
  if (!res.ok) {
    inventoryCache = [];
    return [];
  }

  const data = await res.json().catch(() => []);
  inventoryCache = Array.isArray(data) ? data.filter(isInventoryAssetRecord) : [];
  return inventoryCache;
}

export function readInventoryAssets(): InventoryAssetRecord[] {
  return inventoryCache;
}

export async function createInventoryAsset(input: Omit<InventoryAssetRecord, "id" | "createdAt" | "updatedAt">): Promise<InventoryAssetRecord> {
  const res = await fetch("/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Failed to create inventory asset");
  }

  const asset = await res.json();
  if (!isInventoryAssetRecord(asset)) {
    throw new Error("Invalid inventory asset response");
  }

  inventoryCache = [asset, ...inventoryCache.filter((item) => item.id !== asset.id)];
  dispatchInventoryUpdated();
  return asset;
}

export async function updateInventoryAsset(id: string, input: Partial<Omit<InventoryAssetRecord, "id" | "createdAt" | "updatedAt">>): Promise<InventoryAssetRecord> {
  const res = await fetch(`/api/inventory/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Failed to update inventory asset");
  }

  const asset = await res.json();
  if (!isInventoryAssetRecord(asset)) {
    throw new Error("Invalid inventory asset response");
  }

  inventoryCache = inventoryCache.map((item) => (item.id === asset.id ? asset : item));
  dispatchInventoryUpdated();
  return asset;
}

export async function deleteInventoryAsset(id: string): Promise<void> {
  const res = await fetch(`/api/inventory/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Failed to delete inventory asset");
  }

  inventoryCache = inventoryCache.filter((item) => item.id !== id);
  dispatchInventoryUpdated();
}

function dispatchInventoryUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(INVENTORY_UPDATED_EVENT));
  }
}

function isInventoryAssetRecord(value: unknown): value is InventoryAssetRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.id === "string"
    && typeof record.name === "string"
    && typeof record.vendor === "string"
    && typeof record.product === "string"
    && typeof record.version === "string"
    && typeof record.environment === "string"
    && typeof record.criticality === "string"
    && typeof record.notes === "string"
    && typeof record.createdAt === "string"
    && typeof record.updatedAt === "string";
}
