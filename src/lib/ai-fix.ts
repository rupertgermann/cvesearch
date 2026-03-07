import { callModel, resolveAISettings } from "./ai";
import {
  AIFixResult,
  FixFileChange,
  OSVVulnerability,
  ParsedDependency,
  RepoFileContent,
} from "./github-types";
import { AISettings } from "./types";

interface GenerateFixInput {
  vulnerability: OSVVulnerability;
  matchedDependency: ParsedDependency;
  fixedVersion: string | null;
  dependencyFiles: RepoFileContent[];
  sourceFiles: RepoFileContent[];
}

export const generateVulnerabilityFix = async (
  input: GenerateFixInput,
  settings?: Partial<AISettings>
): Promise<AIFixResult> => {
  const runtime = resolveAISettings(settings);

  if (runtime.provider === "heuristic") {
    return buildHeuristicFix(input);
  }

  try {
    const prompt = buildFixPrompt(input);
    const response = await callModel(prompt, runtime);
    return sanitizeFixResult(JSON.parse(response), input);
  } catch {
    return buildHeuristicFix(input);
  }
};

const buildFixPrompt = (input: GenerateFixInput): string => {
  const { vulnerability, matchedDependency, fixedVersion, dependencyFiles, sourceFiles } = input;
  const ecosystem = matchedDependency.ecosystem === "Packagist" ? "PHP Composer" : "npm";

  const parts = [
    "You are a senior security engineer. Analyze this vulnerability and generate a fix.",
    "",
    "Return ONLY valid JSON matching this exact shape:",
    '{"analysis":"string","fileChanges":[{"path":"string","content":"string (full file content)","description":"string"}],"prTitle":"string","prBody":"string (markdown)"}',
    "",
    "RULES:",
    "- fileChanges must contain the COMPLETE new file content for each changed file, not diffs or patches",
    "- Do NOT modify lock files (package-lock.json, composer.lock) -- they must be regenerated locally",
    "- The prBody should be markdown and explain what was changed and why",
    "- If source code changes are needed for breaking API changes, include those too",
    "- Keep the fix minimal and focused",
    "",
    "=== VULNERABILITY ===",
    `ID: ${vulnerability.id}`,
    `Aliases: ${vulnerability.aliases?.join(", ") || "none"}`,
    `Summary: ${vulnerability.summary || "N/A"}`,
    `Details: ${(vulnerability.details || "N/A").slice(0, 1500)}`,
    `Severity: ${vulnerability.severity?.map((s) => s.score).join(", ") || "unknown"}`,
    "",
    "=== AFFECTED DEPENDENCY ===",
    `Ecosystem: ${ecosystem}`,
    `Package: ${matchedDependency.name}`,
    `Current Version: ${matchedDependency.version}`,
    `Is Dev Dependency: ${matchedDependency.isDev}`,
    `Manifest Path: ${matchedDependency.manifestPath || "unknown"}`,
    `Fixed Version: ${fixedVersion || "unknown -- choose the latest safe version"}`,
    "",
    "=== CURRENT DEPENDENCY FILES ===",
  ];

  dependencyFiles.forEach((file) => {
    parts.push(`--- ${file.path} ---`);
    parts.push(file.content.slice(0, 8000));
    parts.push("");
  });

  if (sourceFiles.length > 0) {
    parts.push("=== SOURCE FILES USING THIS PACKAGE ===");
    sourceFiles.forEach((file) => {
      parts.push(`--- ${file.path} ---`);
      parts.push(file.content.slice(0, 3000));
      parts.push("");
    });
  }

  return parts.join("\n");
};

const buildHeuristicFix = (input: GenerateFixInput): AIFixResult => {
  const { vulnerability, matchedDependency, fixedVersion, dependencyFiles } = input;
  const targetVersion = fixedVersion || "latest";
  const ecosystem = matchedDependency.ecosystem === "Packagist" ? "composer" : "npm";

  const fileChanges: FixFileChange[] = [];

  const expectedManifestPath = matchedDependency.manifestPath || (ecosystem === "npm" ? "package.json" : "composer.json");
  const manifestFile = dependencyFiles.find((file) => file.path === expectedManifestPath);

  if (manifestFile && fixedVersion) {
    const updatedContent = bumpDependencyVersion(
      manifestFile.content,
      matchedDependency.name,
      fixedVersion
    );

    if (updatedContent !== manifestFile.content) {
      fileChanges.push({
        path: manifestFile.path,
        content: updatedContent,
        description: `Update ${matchedDependency.name} from ${matchedDependency.version} to ${fixedVersion}`,
      });
    }
  }

  const lockCommand = ecosystem === "npm" ? "npm install" : "composer update";

  const prBody = [
    `## Security Fix: ${vulnerability.id}`,
    "",
    `**Vulnerability:** ${vulnerability.summary || vulnerability.id}`,
    `**Package:** ${matchedDependency.name}`,
    `**Current Version:** ${matchedDependency.version}`,
    `**Manifest:** ${expectedManifestPath}`,
    `**Fixed Version:** ${targetVersion}`,
    "",
    vulnerability.aliases?.length
      ? `**Aliases:** ${vulnerability.aliases.join(", ")}`
      : "",
    "",
    "### Changes",
    "",
    fileChanges.length > 0
      ? fileChanges.map((c) => `- ${c.description}`).join("\n")
      : "- No automatic file changes could be determined. Manual review required.",
    "",
    "### After Merge",
    "",
    `Run \`${lockCommand}\` to regenerate the lock file.`,
    "",
    "---",
    "*This PR was automatically generated by CVE Search.*",
  ].filter(Boolean).join("\n");

  return {
    analysis: fileChanges.length > 0
      ? `${vulnerability.id} affects ${matchedDependency.name}@${matchedDependency.version}. The fix is to update to version ${targetVersion}. ${vulnerability.summary || ""}`
      : `${vulnerability.id} affects ${matchedDependency.name}@${matchedDependency.version} but no fixed version could be determined automatically. Manual review is needed.`,
    fileChanges,
    prTitle: `fix: update ${matchedDependency.name} to ${targetVersion} (${vulnerability.id})`,
    prBody,
  };
};

const bumpDependencyVersion = (
  manifestContent: string,
  packageName: string,
  newVersion: string
): string => {
  try {
    const manifest = JSON.parse(manifestContent);
    let changed = false;

    for (const section of ["dependencies", "devDependencies", "require", "require-dev"]) {
      if (manifest[section]?.[packageName]) {
        const currentRange = manifest[section][packageName] as string;
        const prefix = currentRange.match(/^([~^>=<]*)/)?.[1] ?? "^";
        manifest[section][packageName] = `${prefix}${newVersion}`;
        changed = true;
      }
    }

    if (!changed) return manifestContent;

    return JSON.stringify(manifest, null, 2) + "\n";
  } catch {
    return manifestContent;
  }
};

const sanitizeFixResult = (value: unknown, input: GenerateFixInput): AIFixResult => {
  const fallback = buildHeuristicFix(input);
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;

  const fileChanges: FixFileChange[] = [];
  if (Array.isArray(record.fileChanges)) {
    record.fileChanges.forEach((change: unknown) => {
      if (!change || typeof change !== "object") return;
      const c = change as Record<string, unknown>;
      if (typeof c.path === "string" && typeof c.content === "string") {
        fileChanges.push({
          path: c.path,
          content: c.content,
          description: typeof c.description === "string" ? c.description : `Update ${c.path}`,
        });
      }
    });
  }

  return {
    analysis: typeof record.analysis === "string" ? record.analysis : fallback.analysis,
    fileChanges: fileChanges.length > 0 ? fileChanges : fallback.fileChanges,
    prTitle: typeof record.prTitle === "string" ? record.prTitle : fallback.prTitle,
    prBody: typeof record.prBody === "string" ? record.prBody : fallback.prBody,
  };
};

export const extractFixedVersion = (
  vulnerability: OSVVulnerability,
  packageName: string
): string | null => {
  for (const affected of vulnerability.affected ?? []) {
    if (affected.package?.name !== packageName) continue;

    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed) return event.fixed;
      }
    }
  }
  return null;
};
