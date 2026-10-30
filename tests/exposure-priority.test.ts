import assert from "node:assert/strict";
import test from "node:test";
import { compareExposurePriority, getExposurePriority, type ExposurePriorityInput } from "../src/lib/exposure";

type Case = [name: string, input: Partial<ExposurePriorityInput>, priority: string, why: string];

const KEV = { cveID: "CVE-1" } as NonNullable<ExposurePriorityInput["cve"]["kev"]>;
const inv = (environment: string, criticality: ExposurePriorityInput["criticality"]) => ({ source: "inventory" as const, environment, criticality, isDev: null });
const repo = (isDev: boolean) => ({ source: "repo" as const, environment: null, criticality: null, isDev });

const cases: Case[] = [
  ["KEV on production inventory asset", { ...inv("production", "low"), cve: { kev: KEV } }, "P1", "KEV + prod"],
  ["EPSS >= 0.5 on high-criticality non-prod asset", { ...inv("staging", "high"), cve: { epss: 0.5 } }, "P1", "EPSS 50% + high-criticality asset"],
  ["KEV on non-production, low criticality", { ...inv("dev", "low"), cve: { kev: KEV } }, "P2", "KEV + non-prod"],
  ["CVSS >= 7 on production", { ...inv("Prod-EU", "medium"), cve: { cvss3: 7.5, epss: 0.1 } }, "P2", "CVSS 7.5 + prod"],
  ["CVSS >= 7 on non-production", { ...inv("test", "medium"), cve: { cvss3: 9.8 } }, "P3", "CVSS 9.8 + non-prod"],
  ["EPSS >= 0.5 alone on non-production", { ...inv("test", "low"), cve: { epss: 0.9 } }, "P3", "EPSS 90% + non-prod"],
  ["medium CVSS on production", { ...inv("production", "medium"), cve: { cvss: 5 } }, "P3", "CVSS 5.0 + prod"],
  ["no signal at all", { ...inv("production", "medium"), cve: {} }, "P3", "no KEV, EPSS or CVSS signal + prod"],
  ["KEV on repo runtime dependency", { ...repo(false), cve: { kev: KEV } }, "P1", "KEV + monitored repo + runtime dep"],
  ["KEV on repo dev dependency drops to P2", { ...repo(true), cve: { kev: KEV } }, "P2", "KEV + monitored repo + dev dep (down one level)"],
  ["CVSS >= 7 on repo dev dependency drops to P3", { ...repo(true), cve: { cvss3: 8 } }, "P3", "CVSS 8.0 + monitored repo + dev dep (down one level)"],
  ["P3 dev dependency stays P3", { ...repo(true), cve: { cvss3: 3 } }, "P3", "CVSS 3.0 + monitored repo + dev dep (down one level)"],
];

for (const [name, input, priority, why] of cases) {
  test(`priority: ${name}`, () => {
    const row: ExposurePriorityInput = { source: "inventory", environment: null, criticality: null, isDev: null, cve: {}, ...input };
    assert.deepEqual(getExposurePriority(row), { priority, priorityReason: why });
  });
}

test("queue order is priority, then EPSS descending", () => {
  const rows = [
    { priority: "P2" as const, cve: { epss: 0.9 } },
    { priority: "P1" as const, cve: {} },
    { priority: "P2" as const, cve: { epss: 0.95 } },
    { priority: "P1" as const, cve: { epss: 0.01 } },
  ];
  assert.deepEqual([...rows].sort(compareExposurePriority).map((row) => [row.priority, row.cve.epss]), [
    ["P1", 0.01], ["P1", undefined], ["P2", 0.95], ["P2", 0.9],
  ]);
});
