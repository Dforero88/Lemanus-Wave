import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function readGitValue(command, fallback) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const commit = readGitValue("git rev-parse --short=7 HEAD", "dev");
const branch = readGitValue("git branch --show-current", "local");
const builtAt = new Date().toISOString();

writeFileSync(
  new URL("../src/build-info.ts", import.meta.url),
  `export const BUILD_INFO = ${JSON.stringify({ commit, branch, builtAt }, null, 2)} as const;\n`
);
