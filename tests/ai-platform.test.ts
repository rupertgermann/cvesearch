import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { interpretSearchPromptHeuristically } from "../src/lib/ai";

test("search assistant evaluation fixtures remain stable", () => {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "ai-search-evals.json");
  const cases = JSON.parse(readFileSync(fixturePath, "utf8")) as Array<{
    prompt: string;
    expected: {
      minSeverity: string;
      sort: string;
      queryIncludes: string;
      requiresClarification: boolean;
      hasSince: boolean;
    };
  }>;

  for (const item of cases) {
    const result = interpretSearchPromptHeuristically(item.prompt);
    assert.equal(result.minSeverity, item.expected.minSeverity);
    assert.equal(result.sort, item.expected.sort);
    assert.equal(result.needsClarification, item.expected.requiresClarification);
    assert.equal(Boolean(result.since), item.expected.hasSince);

    if (item.expected.queryIncludes) {
      assert.match(result.query.toLowerCase(), new RegExp(item.expected.queryIncludes));
    }
  }
});
