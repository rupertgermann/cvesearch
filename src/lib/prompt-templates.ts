import { PromptTemplateRecord } from "./workspace-types";

export const PROMPT_TEMPLATES_UPDATED_EVENT = "cvesearch:prompt-templates-updated";

let promptTemplatesCache: PromptTemplateRecord[] = [];

export async function loadPromptTemplates(): Promise<PromptTemplateRecord[]> {
  const next = await fetchPromptTemplates();
  promptTemplatesCache = next;
  return next;
}

export function readPromptTemplates(): PromptTemplateRecord[] {
  return promptTemplatesCache;
}

export async function createPromptTemplate(name: string, prompt: string): Promise<PromptTemplateRecord[]> {
  await fetchPromptTemplatesMutation("/api/prompt-templates", {
    method: "POST",
    body: JSON.stringify({ name, prompt }),
  });
  return refreshPromptTemplates();
}

export async function deletePromptTemplate(id: string): Promise<PromptTemplateRecord[]> {
  await fetchPromptTemplatesMutation(`/api/prompt-templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return refreshPromptTemplates();
}

async function refreshPromptTemplates(): Promise<PromptTemplateRecord[]> {
  const next = await fetchPromptTemplates();
  promptTemplatesCache = next;
  dispatchPromptTemplatesUpdated();
  return next;
}

function dispatchPromptTemplatesUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROMPT_TEMPLATES_UPDATED_EVENT));
  }
}

async function fetchPromptTemplates(): Promise<PromptTemplateRecord[]> {
  const res = await fetch("/api/prompt-templates", { cache: "no-store" });
  if (!res.ok) {
    return [];
  }

  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data.filter(isPromptTemplateRecord) : [];
}

async function fetchPromptTemplatesMutation(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Prompt templates request failed");
  }
}

function isPromptTemplateRecord(value: unknown): value is PromptTemplateRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.id === "string"
    && typeof record.name === "string"
    && typeof record.prompt === "string"
    && typeof record.createdAt === "string"
    && typeof record.updatedAt === "string";
}
