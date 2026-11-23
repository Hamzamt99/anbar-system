// Isolated synthetic-only probe. Never bind production DB or accept password input.
import { pbkdf2Sync } from "node:crypto";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
export default {
  async fetch() {
    const measurements = [];
    for (const [name, iterations] of [
      ["native", 100000],
      ["native", 600000],
      ["noble", 600000],
    ]) {
      const start = performance.now();
      try {
        if (name === "native")
          pbkdf2Sync(
            "synthetic-password",
            "synthetic-salt",
            iterations,
            32,
            "sha256",
          );
        else
          pbkdf2(
            sha256,
            new TextEncoder().encode("synthetic-password"),
            new TextEncoder().encode("synthetic-salt"),
            { c: iterations, dkLen: 32 },
          );
        measurements.push({
          method: name,
          iterations,
          elapsed_ms: performance.now() - start,
          ok: true,
        });
      } catch (e) {
        measurements.push({ method: name, iterations, error: e.message });
      }
    }
    return Response.json({
      measurements,
      note: "Hosted performance.now is frozen during CPU work; use local inspector CPU profile or Workers trace metrics, not hosted elapsed_ms.",
    });
  },
};
