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
  packageLockJsonRaw?: string
): ParsedDependency[] => {
  let packageJson: PackageJson;
  try {
    packageJson = JSON.parse(packageJsonRaw);
  } catch {
    return [];
  }

  const lockVersions = new Map<string, { version: string; isDev: boolean }>();

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
        const name = key.replace(/^node_modules\//, "");
        if (!name) return;
        lockVersions.set(name, { version: value.version, isDev: !!value.dev });
      });
    } else if (lockJson.dependencies) {
      Object.entries(lockJson.dependencies).forEach(([name, value]) => {
        if (!value.version) return;
        lockVersions.set(name, { version: value.version, isDev: !!value.dev });
      });
    }
  }

  const dependencies: ParsedDependency[] = [];
  const seen = new Set<string>();

  const addFromManifest = (deps: Record<string, string> | undefined, isDev: boolean) => {
    if (!deps) return;
    Object.entries(deps).forEach(([name, versionRange]) => {
      if (seen.has(name)) return;
      seen.add(name);

      const lockEntry = lockVersions.get(name);
      const version = lockEntry?.version ?? stripSemverPrefix(versionRange);

      if (!isConcreteVersion(version)) return;

      dependencies.push({
        name,
        version,
        ecosystem: "npm",
        isDev: lockEntry?.isDev ?? isDev,
      });
    });
  };

  addFromManifest(packageJson.dependencies, false);
  addFromManifest(packageJson.devDependencies, true);

  if (packageLockJsonRaw && lockVersions.size > 0) {
    lockVersions.forEach(({ version, isDev }, name) => {
      if (seen.has(name)) return;
      seen.add(name);
      dependencies.push({ name, version, ecosystem: "npm", isDev });
    });
  }

  return dependencies;
};

const normalizeComposerVersion = (version: string): string => {
  return version.replace(/^v/i, "");
};

export const parseComposerDependencies = (
  composerJsonRaw: string,
  composerLockJsonRaw?: string
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
  pnpmLockRaw: string
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
    });
  });

  return dependencies;
};

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

  const pnpmLock = group.files.get("pnpm-lock.yaml");
  if (pnpmLock) {
    results.push(...parsePnpmLockDependencies(pnpmLock));
  }

  const packageJson = group.files.get("package.json");
  if (packageJson) {
    const packageLock = group.files.get("package-lock.json");
    results.push(...parseNpmDependencies(packageJson, packageLock));
  }

  const composerJson = group.files.get("composer.json");
  if (composerJson) {
    const composerLock = group.files.get("composer.lock");
    results.push(...parseComposerDependencies(composerJson, composerLock));
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
    const key = `${dep.ecosystem}:${dep.name}@${dep.version}`;
    if (!seen.has(key)) {
      seen.set(key, dep);
    }
  });

  return Array.from(seen.values());
};

export const SUPPORTED_ECOSYSTEMS: { ecosystem: DependencyEcosystem; label: string; files: string[] }[] = [
  { ecosystem: "npm", label: "npm", files: ["package.json", "package-lock.json", "pnpm-lock.yaml"] },
  { ecosystem: "Packagist", label: "Composer (PHP)", files: ["composer.json", "composer.lock"] },
];
