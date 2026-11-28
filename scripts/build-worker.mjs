import fs from "node:fs";
import path from "node:path";
const assets = {};
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else {
      const relative =
        "/" + path.relative("dist/client", file).replaceAll("\\", "/");
      assets[relative] = {
        type: types[path.extname(file)] || "application/octet-stream",
        body: fs.readFileSync(file).toString("base64"),
      };
    }
  }
}
scan("dist/client");
const baseRoutes = JSON.parse(
  fs.readFileSync("public/data/catalog.json", "utf8"),
).routes;
fs.mkdirSync("dist/server", { recursive: true });
fs.mkdirSync("dist/.openai", { recursive: true });
fs.writeFileSync(
  "dist/server/index.js",
  fs.readFileSync("worker/supabase-store.mjs", "utf8") +
    "\n" +
    fs.readFileSync("shared/fares.mjs", "utf8") +
    "\n" +
    fs
      .readFileSync("shared/trips.mjs", "utf8")
      .replace(/^import[^;]+;\s*/gm, "") +
    "\n" +
    // Local place names used by /api/places; it has no imports, so include as is.
    fs.readFileSync("shared/places.mjs", "utf8") +
    "\n" +
    fs.readFileSync("worker/verification.mjs", "utf8") +
    "\n" +
    fs
      .readFileSync("worker/handler.mjs", "utf8")
      .replace(/^import[^;]+;\s*/gm, "") +
    "\nexport default createHandler(" +
    JSON.stringify({
      baseRoutes,
      fareReference: JSON.parse(
        fs.readFileSync("public/data/fare-reference.json", "utf8"),
      ),
      assets,
      researchCodes: JSON.parse(
        fs.readFileSync("public/data/code-research.json", "utf8"),
      ),
    }) +
    ");\n",
);
if (fs.existsSync(".openai/hosting.json")) {
  fs.copyFileSync(".openai/hosting.json", "dist/.openai/hosting.json");
}
console.log(
  `Built Worker with ${Object.keys(assets).length} embedded assets and ${baseRoutes.length} route records.`,
);
