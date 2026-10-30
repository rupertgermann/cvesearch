import { DependencyEcosystem, ParsedDependency } from "./github-types";

const PURL_TYPE_TO_ECOSYSTEM: Record<string, DependencyEcosystem> = {
  npm: "npm",
  pypi: "PyPI",
  golang: "Go",
  cargo: "crates.io",
  composer: "Packagist",
  maven: "Maven",
  gem: "RubyGems",
  nuget: "NuGet",
};

interface SbomComponent {
  purl?: unknown;
  components?: unknown;
}

interface SpdxPackage {
  externalRefs?: { referenceType?: unknown; referenceLocator?: unknown }[];
}

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// pkg:type/namespace/name@version?qualifiers#subpath -> OSV package, or null for unsupported/unversioned purls.
const purlToDependency = (purl: string, manifestPath: string): ParsedDependency | null => {
  const match = purl.match(/^pkg:([^/]+)\/([^?#]+?)@([^?#]+)/i);
  if (!match) return null;
  const ecosystem = PURL_TYPE_TO_ECOSYSTEM[match[1].toLowerCase()];
  if (!ecosystem) return null;

  const segments = match[2].split("/").filter(Boolean).map(decode);
  const version = decode(match[3]);
  if (segments.length === 0 || !version) return null;

  // OSV names Maven packages groupId:artifactId; every other supported type joins namespace and name with "/".
  const name = ecosystem === "Maven" ? segments.join(":") : segments.join("/");
  return { name, version, ecosystem, isDev: false, manifestPath };
};

const collectCycloneDxPurls = (components: unknown, out: string[]): void => {
  if (!Array.isArray(components)) return;
  for (const component of components as SbomComponent[]) {
    if (typeof component?.purl === "string") out.push(component.purl);
    collectCycloneDxPurls(component?.components, out);
  }
};

/** Parses a CycloneDX or SPDX JSON SBOM; returns null when the content is neither. */
export const parseSbom = (content: string, filename: string): ParsedDependency[] | null => {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(content);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") return null;

  const purls: string[] = [];
  if (doc.bomFormat === "CycloneDX") {
    collectCycloneDxPurls(doc.components, purls);
  } else if (typeof doc.spdxVersion === "string") {
    for (const pkg of Array.isArray(doc.packages) ? (doc.packages as SpdxPackage[]) : []) {
      for (const ref of Array.isArray(pkg?.externalRefs) ? pkg.externalRefs : []) {
        if (ref?.referenceType === "purl" && typeof ref.referenceLocator === "string") purls.push(ref.referenceLocator);
      }
    }
  } else {
    return null;
  }

  const seen = new Set<string>();
  const dependencies: ParsedDependency[] = [];
  for (const purl of purls) {
    const dependency = purlToDependency(purl, filename);
    if (!dependency) continue;
    const key = `${dependency.ecosystem}:${dependency.name}@${dependency.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dependencies.push(dependency);
  }
  return dependencies;
};
