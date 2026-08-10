import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";

function assetEnvironment() {
  return {
    ASSETS: {
      fetch: async () => new Response("<!doctype html><title>CodexVault</title>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    },
  };
}

test("browser walkthrough redirects production HTTP to HTTPS", async () => {
  const response = await worker.fetch(
    new Request("http://vault.basementboys.org/demo?mode=fake"),
    assetEnvironment(),
  );

  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("location"),
    "https://vault.basementboys.org/demo?mode=fake",
  );
});

test("browser walkthrough responses carry strict visit-safety headers", async () => {
  const response = await worker.fetch(
    new Request("https://vault.basementboys.org/"),
    assetEnvironment(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
  assert.match(response.headers.get("permissions-policy") ?? "", /payment=\(\)/);

  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /upgrade-insecure-requests/);
});
