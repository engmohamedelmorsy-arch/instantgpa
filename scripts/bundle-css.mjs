import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "static-site", "assets");
const sources = [
  "app.css", "theme-emerald.css", "ux-v39.css", "student-ui-v43.css", "navy-gold-v50.css",
  "home-compact-v51.css", "overview-journey-v52.css", "workspace-compact-v53.css",
  "verified-layout-v54.css", "fit-controls-v55.css", "experience-v57.css",
  "product-flow-v60.css", "modernist-v85.css",
];

const blocks = await Promise.all(sources.map(async (name) => `/* source: ${name} */\n${(await readFile(path.join(assets, name), "utf8")).trimEnd()}`));
await writeFile(path.join(assets, "app-bundle.css"), `${blocks.join("\n\n")}\n`, "utf8");
process.stdout.write(`Bundled ${sources.length} CSS layers into app-bundle.css.\n`);
