#!/usr/bin/env node

(async () => {
  await import("./packages/smcp/bin/smcp.js");
})().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
