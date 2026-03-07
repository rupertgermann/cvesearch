import assert from "node:assert/strict";
import test from "node:test";
import { parseDependencyFiles, parseNpmDependencies } from "../src/lib/dependency-parser";

test("parseNpmDependencies extracts nested package-lock dependency names correctly", () => {
  const dependencies = parseNpmDependencies(
    JSON.stringify({ dependencies: { "@types/node": "^20.11.30" } }),
    "packages/web/package.json",
    JSON.stringify({
      packages: {
        "": { version: "1.0.0" },
        "node_modules/foo": { version: "1.0.0" },
        "node_modules/foo/node_modules/@types/node": { version: "20.11.30", dev: true },
      },
    }),
    "packages/web/package-lock.json"
  );

  assert.equal(dependencies.some((dependency) => dependency.name === "foo/node_modules/@types/node"), false);
  assert.deepEqual(
    dependencies.find((dependency) => dependency.name === "@types/node"),
    {
      name: "@types/node",
      version: "20.11.30",
      ecosystem: "npm",
      isDev: true,
      manifestPath: "packages/web/package.json",
      lockfilePath: "packages/web/package-lock.json",
      sourceDirectory: "packages/web",
    }
  );
});

test("parseDependencyFiles preserves duplicate dependencies across manifest locations", () => {
  const result = parseDependencyFiles([
    {
      path: "package.json",
      content: JSON.stringify({ dependencies: { react: "19.2.3" } }),
    },
    {
      path: "packages/admin/package.json",
      content: JSON.stringify({ dependencies: { react: "19.2.3" } }),
    },
  ]);

  assert.equal(result.locationCount, 2);
  assert.equal(result.dependencies.length, 2);
  assert.deepEqual(
    result.dependencies.map((dependency) => dependency.manifestPath).sort(),
    ["package.json", "packages/admin/package.json"]
  );
});
