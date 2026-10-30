import { parse as parseYaml } from "yaml";
import { ParsedDependency, RepoFileContent, DependencyEcosystem } from "./github-types";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface PackageLockJson {
  packages?: Record<string, { version?: string; dev?: boolean }>;
  dependencies?: Record<string, { version?: string; dev?: boolean }>;
}

interface ComposerJson {
  require?: Record<string, string>;
  "require-dev"?: Record<string, string>;
}

interface ComposerLockPackage {
  name: string;
  version: string;
}

interface ComposerLockJson {
  packages?: ComposerLockPackage[];
  "packages-dev"?: ComposerLockPackage[];
}

interface PnpmLockPackageEntry {
  resolution?: { integrity?: string };
  dev?: boolean;
}

interface PnpmLockYaml {
  lockfileVersion?: string | number;
  packages?: Record<string, PnpmLockPackageEntry>;
  snapshots?: Record<string, PnpmLockPackageEntry>;
}

const stripSemverPrefix = (version: string): string => {
  return version.replace(/^[~^>=<|!\s*]+/, "").replace(/\s*\|\|.*$/, "");
};

const isConcreteVersion = (version: string): boolean => {
  return /^\d+\.\d+(\.\d+)?([.-].+)?$/.test(version);
};

export const parseNpmDependencies = (
  packageJsonRaw: string,
  packageJsonPath: string,
  packageLockJsonRaw?: string,
  packageLockJsonPath?: string
): ParsedDependency[] => {
  let packageJson: PackageJson;
  try {
    packageJson = JSON.parse(packageJsonRaw);
  } catch {
    return [];
  }

  // Every installed copy, including nested ones; top-level installs first so find() by name
  // returns the version the manifest resolves to.
  const lockEntries: { name: string; version: string; isDev: boolean }[] = [];

  if (packageLockJsonRaw) {
    let lockJson: PackageLockJson;
    try {
      lockJson = JSON.parse(packageLockJsonRaw);
    } catch {
      lockJson = {};
    }

    if (lockJson.packages) {
      Object.entries(lockJson.packages).forEach(([key, value]) => {
        if (!key || !value.version) return;
        const name = extractPackageLockDependencyName(key);
        if (!name) return;
        const entry = { name, version: value.version, isDev: !!value.dev };
        if (key === `node_modules/${name}`) lockEntries.unshift(entry);
        else lockEntries.push(entry);
      });
    } else if (lockJson.dependencies) {
      Object.entries(lockJson.dependencies).forEach(([name, value]) => {
        if (!value.version) return;
        lockEntries.push({ name, version: value.version, isDev: !!value.dev });
      });
    }
  }

  const dependencies: ParsedDependency[] = [];
  // name@version already listed
  const seen = new Set<string>();

  const addFromManifest = (deps: Record<string, string> | undefined, isDev: boolean) => {
    if (!deps) return;
    Object.entries(deps).forEach(([name, versionRange]) => {
      const lockEntry = lockEntries.find((entry) => entry.name === name);
      const version = lockEntry?.version ?? stripSemverPrefix(versionRange);

      if (!isConcreteVersion(version) || seen.has(`${name}@${version}`)) return;
      seen.add(`${name}@${version}`);

      dependencies.push({
        name,
        version,
        ecosystem: "npm",
        isDev: lockEntry?.isDev ?? isDev,
        manifestPath: packageJsonPath,
        lockfilePath: packageLockJsonPath,
        sourceDirectory: getParentDir(packageJsonPath),
      });
    });
  };

  addFromManifest(packageJson.dependencies, false);
  addFromManifest(packageJson.devDependencies, true);

  if (packageLockJsonRaw && lockEntries.length > 0) {
    lockEntries.forEach(({ name, version, isDev }) => {
      if (seen.has(`${name}@${version}`)) return;
      seen.add(`${name}@${version}`);
      dependencies.push({
        name,
        version,
        ecosystem: "npm",
        isDev,
        manifestPath: packageJsonPath,
        lockfilePath: packageLockJsonPath,
        sourceDirectory: getParentDir(packageJsonPath),
      });
    });
  }

  return dependencies;
};

const normalizeComposerVersion = (version: string): string => {
  return version.replace(/^v/i, "");
};

export const parseComposerDependencies = (
  composerJsonRaw: string,
  composerJsonPath: string,
  composerLockJsonRaw?: string,
  composerLockJsonPath?: string
): ParsedDependency[] => {
  let composerJson: ComposerJson;
  try {
    composerJson = JSON.parse(composerJsonRaw);
  } catch {
    return [];
  }

  const dependencies: ParsedDependency[] = [];
  const seen = new Set<string>();

  if (composerLockJsonRaw) {
    let lockJson: ComposerLockJson;
    try {
      lockJson = JSON.parse(composerLockJsonRaw);
    } catch {
      lockJson = {};
    }

    const addLockPackages = (packages: ComposerLockPackage[] | undefined, isDev: boolean) => {
      if (!packages) return;
      packages.forEach((pkg) => {
        if (seen.has(pkg.name)) return;
        if (isPhpPlatformPackage(pkg.name)) return;
        seen.add(pkg.name);

        const version = normalizeComposerVersion(pkg.version);
        if (!isConcreteVersion(version)) return;

        dependencies.push({
          name: pkg.name,
          version,
          ecosystem: "Packagist",
          isDev,
          manifestPath: composerJsonPath,
          lockfilePath: composerLockJsonPath,
          sourceDirectory: getParentDir(composerJsonPath),
        });
      });
    };

    addLockPackages(lockJson.packages, false);
    addLockPackages(lockJson["packages-dev"], true);
  } else {
    const addFromManifest = (deps: Record<string, string> | undefined, isDev: boolean) => {
      if (!deps) return;
      Object.entries(deps).forEach(([name, versionRange]) => {
        if (seen.has(name)) return;
        if (isPhpPlatformPackage(name)) return;
        seen.add(name);

        const version = stripSemverPrefix(normalizeComposerVersion(versionRange));
        if (!isConcreteVersion(version)) return;

        dependencies.push({
          name,
          version,
          ecosystem: "Packagist",
          isDev,
          manifestPath: composerJsonPath,
          lockfilePath: composerLockJsonPath,
          sourceDirectory: getParentDir(composerJsonPath),
        });
      });
    };

    addFromManifest(composerJson.require, false);
    addFromManifest(composerJson["require-dev"], true);
  }

  return dependencies;
};

const isPhpPlatformPackage = (name: string): boolean => {
  return name === "php" || name.startsWith("ext-") || name.startsWith("lib-");
};

const PNPM_V6_KEY_PATTERN = /^\/(.+)\/(.+)$/;
const PNPM_V9_KEY_PATTERN = /^(.+)@(.+)$/;

const parsePnpmPackageKey = (key: string): { name: string; version: string } | null => {
  const v6Match = key.match(PNPM_V6_KEY_PATTERN);
  if (v6Match) {
    const rawVersion = v6Match[2].split("_")[0].split("(")[0];
    return { name: v6Match[1], version: rawVersion };
  }

  const v9Match = key.match(PNPM_V9_KEY_PATTERN);
  if (v9Match) {
    const rawVersion = v9Match[2].split("_")[0].split("(")[0];
    return { name: v9Match[1], version: rawVersion };
  }

  return null;
};

export const parsePnpmLockDependencies = (
  pnpmLockRaw: string,
  manifestPath?: string,
  lockfilePath?: string
): ParsedDependency[] => {
  let lockData: PnpmLockYaml;
  try {
    lockData = parseYaml(pnpmLockRaw) as PnpmLockYaml;
  } catch {
    return [];
  }

  if (!lockData) return [];

  const packages = lockData.packages ?? lockData.snapshots ?? {};
  const dependencies: ParsedDependency[] = [];
  const seen = new Set<string>();

  Object.entries(packages).forEach(([key, entry]) => {
    const parsed = parsePnpmPackageKey(key);
    if (!parsed) return;

    const { name, version } = parsed;
    if (!isConcreteVersion(version)) return;

    const dedupeKey = `${name}@${version}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    dependencies.push({
      name,
      version,
      ecosystem: "npm",
      isDev: entry?.dev === true,
      manifestPath,
      lockfilePath,
      sourceDirectory: manifestPath ? getParentDir(manifestPath) : lockfilePath ? getParentDir(lockfilePath) : undefined,
    });
  });

  return dependencies;
};

const YARN_NON_REGISTRY_PROTOCOL = /^(workspace|link|portal|file|patch|exec|git\+?\w*|github|https?):/;

// Handles both classic ("name@range":\n  version "x") and berry ("name@npm:range":\n  version: x) formats.
export const parseYarnLockDependencies = (
  yarnLockRaw: string,
  manifestPath?: string,
  lockfilePath?: string
): ParsedDependency[] => {
  const dependencies: ParsedDependency[] = [];
  const seen = new Set<string>();
  let name: string | null = null;

  yarnLockRaw.split(/\r?\n/).forEach((line) => {
    if (/^[^\s#]/.test(line)) {
      const descriptor = line.replace(/:$/, "").split(",")[0].trim().replace(/^"|"$/g, "");
      const at = descriptor.indexOf("@", 1);
      const range = descriptor.slice(at + 1);
      name = at > 0 && !YARN_NON_REGISTRY_PROTOCOL.test(range) ? descriptor.slice(0, at) : null;
      return;
    }

    const versionMatch = line.match(/^\s+version:?\s+"?([^"\s]+)"?\s*$/);
    if (!name || !versionMatch) return;
    const version = versionMatch[1];
    if (!isConcreteVersion(version) || seen.has(`${name}@${version}`)) return;
    seen.add(`${name}@${version}`);
    dependencies.push(toDependency(name, version, "npm", manifestPath, lockfilePath));
  });

  return dependencies;
};

const toDependency = (
  name: string,
  version: string,
  ecosystem: DependencyEcosystem,
  manifestPath?: string,
  lockfilePath?: string
): ParsedDependency => ({
  name,
  version,
  ecosystem,
  isDev: false,
  manifestPath,
  lockfilePath,
  sourceDirectory: getParentDir(manifestPath ?? lockfilePath ?? ""),
});

const unquote = (value: string | undefined): string | undefined => value?.match(/^"(.*)"$/)?.[1];

// shortcut: reads only top-level `key = value` lines of [[package]] tables (enough for Cargo/poetry/uv lockfiles);
// switch to a real TOML parser if we ever need nested values.
const readTomlPackages = (raw: string): Record<string, string>[] => {
  const packages: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;

  raw.split(/\r?\n/).forEach((line) => {
    if (line.startsWith("[")) {
      const header = line.trim().replace(/^\[+|\]+$/g, "");
      if (line.trim() === "[[package]]") packages.push((current = {}));
      else if (!header.startsWith("package.")) current = null;
      return;
    }
    const match = line.match(/^([\w-]+)\s*=\s*(.+)$/);
    if (current && match && !(match[1] in current)) current[match[1]] = match[2].trim();
  });

  return packages;
};

// poetry.lock marks non-PyPI packages with [package.source] type; uv.lock with a non-registry source.
export const parsePythonLockDependencies = (lockRaw: string, lockfilePath: string): ParsedDependency[] => {
  return readTomlPackages(lockRaw).flatMap((pkg) => {
    const name = unquote(pkg.name);
    const version = unquote(pkg.version);
    const fromRegistry = (!pkg.source || pkg.source.includes("registry")) && (!pkg.type || pkg.type === '"legacy"');
    return name && version && fromRegistry ? [toDependency(name, version, "PyPI", undefined, lockfilePath)] : [];
  });
};

// Workspace members and path crates have no source; git crates have a non-registry source. Neither is on crates.io.
export const parseCargoLockDependencies = (cargoLockRaw: string, lockfilePath: string): ParsedDependency[] => {
  return readTomlPackages(cargoLockRaw).flatMap((pkg) => {
    const name = unquote(pkg.name);
    const version = unquote(pkg.version);
    const fromRegistry = unquote(pkg.source)?.startsWith("registry+") ?? false;
    return name && version && fromRegistry ? [toDependency(name, version, "crates.io", undefined, lockfilePath)] : [];
  });
};

const REQUIREMENT_PIN =/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*===?\s*([^\s,*]+)$/;

// Only exact `name==version` pins are scanned; ranges cannot be resolved without an index lookup.
export const parseRequirementsTxtDependencies = (raw: string, manifestPath: string): ParsedDependency[] => {
  return raw.split(/\r?\n/).flatMap((line) => {
    const requirement = line.replace(/(^|\s)#.*$/, "").split(";")[0].replace(/\\$/, "").trim();
    const match = requirement.match(REQUIREMENT_PIN);
    return match ? [toDependency(match[1], match[2], "PyPI", manifestPath)] : [];
  });
};

// Includes `// indirect` requires; a replace to a local path drops the module (nothing to look up in OSV).
export const parseGoModDependencies = (goModRaw: string, manifestPath: string): ParsedDependency[] => {
  const requires: [string, string][] = [];
  const replaces = new Map<string, [string, string] | null>();
  let block: string | null = null;

  goModRaw.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.replace(/\/\/.*$/, "").trim();
    const opening = line.match(/^(\w+)\s*\($/);
    if (opening) return void (block = opening[1]);
    if (line === ")") return void (block = null);

    const statement = block ? [block, line] : (line.match(/^(\w+)\s+(.+)$/)?.slice(1) ?? []);
    const [directive, args] = statement;
    if (directive === "require") {
      const [path, version] = args.split(/\s+/);
      if (path && version) requires.push([path, version]);
    } else if (directive === "replace") {
      const [from, to] = args.split("=>").map((side) => side.trim().split(/\s+/));
      if (from?.[0] && to?.[0]) replaces.set(from.join(" "), to[1] ? [to[0], to[1]] : null);
    }
  });

  return requires.flatMap(([path, version]) => {
    const replaced = [`${path} ${version}`, path].map((key) => replaces.get(key)).find((entry) => entry !== undefined);
    if (replaced === null) return [];
    const [name, resolvedVersion] = replaced ?? [path, version];
    return [toDependency(name, resolvedVersion.replace(/^v/, ""), "Go", manifestPath)];
  });
};

const normalizePythonName =(name: string): string => name.toLowerCase().replace(/[-_.]+/g, "-");

export interface ParseResult {
  dependencies: ParsedDependency[];
  locationCount: number;
}

const getParentDir = (filePath: string): string => {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash === -1 ? "" : filePath.substring(0, lastSlash);
};

const getFileName = (filePath: string): string => {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash === -1 ? filePath : filePath.substring(lastSlash + 1);
};

interface DirectoryGroup {
  dir: string;
  files: Map<string, string>;
}

const joinDirFile = (dir: string, fileName: string): string => {
  return dir ? `${dir}/${fileName}` : fileName;
};

const extractPackageLockDependencyName = (key: string): string => {
  const normalized = key.replace(/^node_modules\//, "");
  const segments = normalized.split("/node_modules/");
  return segments[segments.length - 1] ?? "";
};

const groupFilesByDirectory = (files: RepoFileContent[]): DirectoryGroup[] => {
  const dirMap = new Map<string, Map<string, string>>();

  files.forEach((file) => {
    const dir = getParentDir(file.path);
    const fileName = getFileName(file.path);

    if (!dirMap.has(dir)) {
      dirMap.set(dir, new Map());
    }
    dirMap.get(dir)!.set(fileName, file.content);
  });

  return Array.from(dirMap.entries()).map(([dir, fileMap]) => ({
    dir,
    files: fileMap,
  }));
};

const parseDirectoryGroup = (group: DirectoryGroup): ParsedDependency[] => {
  const results: ParsedDependency[] = [];
  const packageJsonPath = joinDirFile(group.dir, "package.json");
  const packageLockPath = joinDirFile(group.dir, "package-lock.json");
  const pnpmLockPath = joinDirFile(group.dir, "pnpm-lock.yaml");
  const composerJsonPath = joinDirFile(group.dir, "composer.json");
  const composerLockPath = joinDirFile(group.dir, "composer.lock");

  const pnpmLock = group.files.get("pnpm-lock.yaml");
  if (pnpmLock) {
    results.push(...parsePnpmLockDependencies(
      pnpmLock,
      group.files.has("package.json") ? packageJsonPath : undefined,
      pnpmLockPath
    ));
  }

  const yarnLock = group.files.get("yarn.lock");
  if (yarnLock) {
    results.push(...parseYarnLockDependencies(
      yarnLock,
      group.files.has("package.json") ? packageJsonPath : undefined,
      joinDirFile(group.dir, "yarn.lock")
    ));
  }

  const packageJson = group.files.get("package.json");
  // yarn.lock pins every manifest dependency, so manifest ranges would only add guessed versions.
  if (packageJson && !yarnLock) {
    const packageLock = group.files.get("package-lock.json");
    results.push(...parseNpmDependencies(packageJson, packageJsonPath, packageLock, packageLock ? packageLockPath : undefined));
  }

  const composerJson = group.files.get("composer.json");
  if (composerJson) {
    const composerLock = group.files.get("composer.lock");
    results.push(...parseComposerDependencies(composerJson, composerJsonPath, composerLock, composerLock ? composerLockPath : undefined));
  }

  const pythonLocked = ["poetry.lock", "uv.lock"].flatMap((fileName) => {
    const raw = group.files.get(fileName);
    return raw ? parsePythonLockDependencies(raw, joinDirFile(group.dir, fileName)) : [];
  });
  results.push(...pythonLocked);

  const goMod = group.files.get("go.mod");
  if (goMod) results.push(...parseGoModDependencies(goMod, joinDirFile(group.dir, "go.mod")));

  const cargoLock = group.files.get("Cargo.lock");
  if (cargoLock) results.push(...parseCargoLockDependencies(cargoLock, joinDirFile(group.dir, "Cargo.lock")));

  const requirementsTxt = group.files.get("requirements.txt");
  if (requirementsTxt) {
    // Lockfile versions win; requirements.txt only adds packages the lockfile does not cover.
    const lockedNames = new Set(pythonLocked.map((dependency) => normalizePythonName(dependency.name)));
    results.push(...parseRequirementsTxtDependencies(requirementsTxt, joinDirFile(group.dir, "requirements.txt"))
      .filter((dependency) => !lockedNames.has(normalizePythonName(dependency.name))));
  }

  return results;
};

export const parseDependencyFiles = (files: RepoFileContent[]): ParseResult => {
  const groups = groupFilesByDirectory(files);
  const allDependencies: ParsedDependency[] = [];

  groups.forEach((group) => {
    allDependencies.push(...parseDirectoryGroup(group));
  });

  const deduplicated = deduplicateDependencies(allDependencies);

  return {
    dependencies: deduplicated,
    locationCount: groups.length,
  };
};

const deduplicateDependencies = (dependencies: ParsedDependency[]): ParsedDependency[] => {
  const seen = new Map<string, ParsedDependency>();

  dependencies.forEach((dep) => {
    const key = `${dep.ecosystem}:${dep.name}@${dep.version}:${dep.manifestPath ?? dep.lockfilePath ?? ""}`;
    if (!seen.has(key)) {
      seen.set(key, dep);
    }
  });

  return Array.from(seen.values());
};

export const SUPPORTED_ECOSYSTEMS: { ecosystem: DependencyEcosystem; label: string; files: string[] }[] = [
  { ecosystem: "npm", label: "npm", files: ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"] },
  { ecosystem: "Packagist", label: "Composer (PHP)", files: ["composer.json", "composer.lock"] },
  { ecosystem: "PyPI", label: "Python (PyPI)", files: ["requirements.txt", "poetry.lock", "uv.lock"] },
  { ecosystem: "Go", label: "Go modules", files: ["go.mod"] },
  { ecosystem: "crates.io", label: "Rust (crates.io)", files: ["Cargo.lock"] },
];
