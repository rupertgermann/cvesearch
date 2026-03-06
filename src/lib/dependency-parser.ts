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
  const packageJson: PackageJson = JSON.parse(packageJsonRaw);
  const lockVersions = new Map<string, { version: string; isDev: boolean }>();

  if (packageLockJsonRaw) {
    const lockJson: PackageLockJson = JSON.parse(packageLockJsonRaw);

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
  const composerJson: ComposerJson = JSON.parse(composerJsonRaw);
  const dependencies: ParsedDependency[] = [];
  const seen = new Set<string>();

  if (composerLockJsonRaw) {
    const lockJson: ComposerLockJson = JSON.parse(composerLockJsonRaw);

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

export const parseDependencyFiles = (files: RepoFileContent[]): ParsedDependency[] => {
  const fileMap = new Map(files.map((file) => [file.path, file.content]));
  const allDependencies: ParsedDependency[] = [];

  const packageJson = fileMap.get("package.json");
  if (packageJson) {
    const lockJson = fileMap.get("package-lock.json");
    allDependencies.push(...parseNpmDependencies(packageJson, lockJson ?? undefined));
  }

  const composerJson = fileMap.get("composer.json");
  if (composerJson) {
    const lockJson = fileMap.get("composer.lock");
    allDependencies.push(...parseComposerDependencies(composerJson, lockJson ?? undefined));
  }

  return allDependencies;
};

export const SUPPORTED_ECOSYSTEMS: { ecosystem: DependencyEcosystem; label: string; files: string[] }[] = [
  { ecosystem: "npm", label: "npm", files: ["package.json", "package-lock.json"] },
  { ecosystem: "Packagist", label: "Composer (PHP)", files: ["composer.json", "composer.lock"] },
];
