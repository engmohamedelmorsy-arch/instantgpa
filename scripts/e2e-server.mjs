import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = String(Number(process.argv[2]) || 4173);
const windows = process.platform === "win32";
const bashCandidates = [
  process.env.GIT_BASH_PATH,
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
].filter(Boolean);
const bash = windows ? bashCandidates.find((candidate) => existsSync(candidate)) : "bash";

if (!bash) {
  console.error("Git Bash is required to run the verified build on Windows.");
  process.exit(69);
}

const build = spawnSync(bash, ["scripts/build-verified.sh"], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status || 1);

const generatedConfigPath = path.join(projectRoot, "dist", "server", "wrangler.json");
const e2eConfigPath = path.join(projectRoot, "dist", "server", "wrangler.e2e.json");
const e2eConfig = JSON.parse(readFileSync(generatedConfigPath, "utf8"));
delete e2eConfig.legacy_env;
// Workers AI has no local emulator and Wrangler otherwise opens a remote
// proxy that requires a Cloudflare token. Browser journeys stub the one
// semantic endpoint they exercise, so CI must stay fully local and secretless.
delete e2eConfig.ai;
writeFileSync(e2eConfigPath, `${JSON.stringify(e2eConfig, null, 2)}\n`, "utf8");

const executable = path.join(projectRoot, "node_modules", ".bin", windows ? "wrangler.cmd" : "wrangler");
const server = spawn(executable, ["dev", "--config", "dist/server/wrangler.e2e.json", "--ip", "127.0.0.1", "--port", port], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
  shell: windows,
});

const stop = (signal) => {
  if (!server.killed) server.kill(signal);
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
server.on("exit", (code) => process.exit(code || 0));
