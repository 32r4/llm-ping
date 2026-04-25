import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const srcWebDir = resolve(rootDir, "src", "web");
const publicDir = resolve(rootDir, "public");
const publicAssetsDir = resolve(publicDir, "assets");
const tscCli = resolve(rootDir, "node_modules", "typescript", "bin", "tsc");

const buildHtml = async () => {
  const sourcePath = resolve(srcWebDir, "index.html");
  const targetPath = resolve(publicDir, "index.html");
  const source = await readFile(sourcePath, "utf8");
  const banner = "<!-- Generated from src/web/index.html. Edit the source file instead. -->";
  const output = source.startsWith("<!doctype html>")
    ? source.replace("<!doctype html>", "<!doctype html>\n" + banner)
    : banner + "\n" + source;

  await writeFile(targetPath, output, "utf8");
};

const buildStyles = async () => {
  const sourcePath = resolve(srcWebDir, "styles.css");
  const targetPath = resolve(publicAssetsDir, "styles.css");
  const source = await readFile(sourcePath, "utf8");
  const banner =
    "/* Generated from src/web/styles.css. Edit the source file instead. */\n";

  await writeFile(targetPath, banner + source, "utf8");
};

const buildScript = () => {
  execFileSync(process.execPath, [tscCli, "-p", "tsconfig.web.json"], {
    cwd: rootDir,
    stdio: "inherit"
  });
};

await mkdir(publicAssetsDir, { recursive: true });
buildScript();
await Promise.all([buildHtml(), buildStyles()]);
