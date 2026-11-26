const { spawnSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
// Load local backend settings before imports create a PostgreSQL pool or API.
// Existing process environment values take precedence, matching Node --env-file.
if (fs.existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
const target = process.argv[2] || "server/index";
if (!["server/index", "scripts/import", "scripts/seed"].includes(target))
  throw new Error("Unknown entry point");
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/typescript/bin/tsc"),
    "-p",
    "tsconfig.server.json",
  ],
  { cwd: root, stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status || 1);
fs.writeFileSync(
  path.join(root, ".server-build/package.json"),
  '{"type":"commonjs"}',
);
// Node 22.19+ can require synchronous ESM. Keep these shared source modules as
// .mjs alongside the compiled server instead of launching a second backend.
for (const directory of ["server", "worker", "shared"]) {
  const destination = path.join(root, ".server-build", directory);
  fs.mkdirSync(destination, { recursive: true });
  for (const name of fs.readdirSync(path.join(root, directory)))
    if (name.endsWith(".mjs"))
      fs.copyFileSync(path.join(root, directory, name), path.join(destination, name));
}
const child = spawn(
  process.execPath,
  [path.join(root, ".server-build", target + ".js"), ...process.argv.slice(3)],
  { cwd: root, stdio: "inherit", env: process.env },
);
child.on("exit", (code) => process.exit(code || 0));
