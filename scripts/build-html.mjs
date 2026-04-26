import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const publicDir = resolve(rootDir, "public");
const buildWebScript = resolve(scriptDir, "build-web.mjs");
const htmlPath = resolve(publicDir, "index.html");
const cssPath = resolve(publicDir, "assets", "styles.css");
const jsPath = resolve(publicDir, "assets", "app.js");
const apiClientPath = resolve(publicDir, "assets", "api-client.js");
const timingPath = resolve(publicDir, "assets", "timing.js");
const outputPath = resolve(publicDir, "llm-ping.html");

const inlineStyleTag = '<link rel="stylesheet" href="/assets/styles.css" />';
const inlineScriptTag = '<script type="module" src="/assets/app.js"></script>';

const injectBanner = (html) => {
  const banner =
    "<!-- Generated single-file local build. Requests run directly from the browser and require upstream CORS support. -->";

  return html.startsWith("<!doctype html>")
    ? html.replace("<!doctype html>", "<!doctype html>\n" + banner)
    : banner + "\n" + html;
};

const escapeInlineScript = (source) => source.replaceAll("</script", "<\\/script");
const escapeInlineStyle = (source) => source.replaceAll("</style", "<\\/style");
const stripAppImport = (source) =>
  source
    .replace(
      /^import\s+\{\s*sendInvokeRequest,\s*sendModelsRequest,\s*sendProbeRequest\s*\}\s+from\s+"\.\/api-client(?:\.js(?:\.js)?)?";?\r?\n/,
      ""
    )
    .replace(
      /^import\s+\{\s*ensureCompletedTiming,\s*formatDurationMs,\s*getNowMs,\s*hasTimingValues\s*\}\s+from\s+"\.\/timing(?:\.js(?:\.js)?)?";?\r?\n/,
      ""
    );
const stripApiClientImports = (source) =>
  source.replace(/^import\s+\{\s*getNowMs\s*\}\s+from\s+"\.\/timing(?:\.js(?:\.js)?)?";?\r?\n/, "");
const stripApiClientExports = (source) => source.replaceAll(/^export\s+/gm, "");
const stripTimingExports = (source) => source.replaceAll(/^export\s+/gm, "");

execFileSync(process.execPath, [buildWebScript], {
  cwd: rootDir,
  stdio: "inherit"
});

const [htmlSource, cssSource, jsSource, apiClientSource, timingSource] = await Promise.all([
  readFile(htmlPath, "utf8"),
  readFile(cssPath, "utf8"),
  readFile(jsPath, "utf8"),
  readFile(apiClientPath, "utf8"),
  readFile(timingPath, "utf8")
]);

const inlineModuleSource = `${stripTimingExports(timingSource)}\n${stripApiClientExports(stripApiClientImports(apiClientSource))}\n${stripAppImport(jsSource)}`;

const bundledHtml = injectBanner(
  htmlSource
    .replace(inlineStyleTag, `<style>\n${escapeInlineStyle(cssSource)}\n</style>`)
    .replace(inlineScriptTag, `<script type="module">\n${escapeInlineScript(inlineModuleSource)}\n</script>`)
);

if (bundledHtml === htmlSource) {
  throw new Error("Unable to inline assets into HTML. Expected stylesheet or script tag was not found.");
}

await writeFile(outputPath, bundledHtml, "utf8");
