import assert from "node:assert/strict";
import test from "node:test";
import { parseSbom } from "../src/lib/sbom-parser";

test("parseSbom maps CycloneDX component purls (including nested) to OSV packages", () => {
  const deps = parseSbom(JSON.stringify({
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    components: [
      { name: "lodash", purl: "pkg:npm/lodash@4.17.20" },
      { name: "core", purl: "pkg:npm/%40angular/core@15.0.0" },
      { name: "no-purl" },
      {
        name: "app",
        purl: "pkg:pypi/django@3.2.0",
        components: [{ purl: "pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1?type=jar" }],
      },
      { purl: "pkg:golang/github.com/gin-gonic/gin@v1.6.0" },
      { purl: "pkg:cargo/hyper@0.14.0" },
      { purl: "pkg:composer/laravel/framework@8.0.0" },
      { purl: "pkg:gem/rails@6.0.0" },
      { purl: "pkg:nuget/Newtonsoft.Json@12.0.1" },
      { purl: "pkg:deb/debian/openssl@1.1.1" },
      { purl: "pkg:npm/no-version" },
      { purl: "pkg:npm/lodash@4.17.20" },
    ],
  }), "bom.json");

  assert.ok(deps);
  assert.deepEqual(
    deps.map((dep) => `${dep.ecosystem}|${dep.name}|${dep.version}`),
    [
      "npm|lodash|4.17.20",
      "npm|@angular/core|15.0.0",
      "PyPI|django|3.2.0",
      "Maven|org.apache.logging.log4j:log4j-core|2.14.1",
      "Go|github.com/gin-gonic/gin|v1.6.0",
      "crates.io|hyper|0.14.0",
      "Packagist|laravel/framework|8.0.0",
      "RubyGems|rails|6.0.0",
      "NuGet|Newtonsoft.Json|12.0.1",
    ]
  );
  assert.equal(deps[0].manifestPath, "bom.json");
});

test("parseSbom reads SPDX package purl external refs", () => {
  const deps = parseSbom(JSON.stringify({
    spdxVersion: "SPDX-2.3",
    packages: [
      { name: "lodash", externalRefs: [
        { referenceCategory: "SECURITY", referenceType: "cpe23Type", referenceLocator: "cpe:2.3:a:lodash:lodash:4.17.20" },
        { referenceCategory: "PACKAGE-MANAGER", referenceType: "purl", referenceLocator: "pkg:npm/lodash@4.17.20" },
      ] },
      { name: "no-refs" },
    ],
  }), "sbom.spdx.json");

  assert.deepEqual(deps?.map((dep) => `${dep.ecosystem}|${dep.name}|${dep.version}`), ["npm|lodash|4.17.20"]);
});

test("parseSbom returns null for anything that is not a CycloneDX or SPDX JSON document", () => {
  assert.equal(parseSbom("not json", "bom.json"), null);
  assert.equal(parseSbom(JSON.stringify({ lockfileVersion: 3, packages: {} }), "package-lock.json"), null);
  assert.equal(parseSbom("null", "bom.json"), null);
});
