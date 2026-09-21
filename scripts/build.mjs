import * as esbuild from "esbuild";
import { copyFile, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const watch = process.argv.includes("--watch");
const fixture = process.argv.includes("--fixture") || watch;
const sourcemap = watch;

const FIXTURE_MATCH = "http://127.0.0.1:18080/*";

const staticFiles = ["content.css", "popup.html", "options.html"];

async function writeManifest() {
  const raw = await readFile(join("extension-src", "manifest.json"), "utf8");
  const manifest = JSON.parse(raw);
  if (fixture) {
    const scripts = manifest.content_scripts?.[0];
    if (scripts && Array.isArray(scripts.matches) && !scripts.matches.includes(FIXTURE_MATCH)) {
      scripts.matches.push(FIXTURE_MATCH);
    }
  }
  await writeFile(join("extension", "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function copyStatic() {
  const srcDir = "extension-src";
  const outDir = "extension";
  await mkdir(join(outDir, "icons"), { recursive: true });

  for (const file of staticFiles) {
    await copyFile(join(srcDir, file), join(outDir, file));
  }

  const icons = await readdir(join(srcDir, "icons"));
  for (const icon of icons) {
    await copyFile(join(srcDir, "icons", icon), join(outDir, "icons", icon));
  }

  await writeManifest();
}

async function removeShippedSourceMaps() {
  const files = await readdir("extension");
  for (const file of files) {
    if (file.endsWith(".js.map")) {
      await unlink(join("extension", file));
    }
  }
}

const ctx = await esbuild.context({
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    popup: "src/popup.ts",
    options: "src/options.ts",
  },
  bundle: true,
  outdir: "extension",
  format: "esm",
  target: "chrome120",
  sourcemap,
  logLevel: "info",
});

await copyStatic();

if (watch) {
  await ctx.watch();
  console.log("Watching for changes (fixture matches on)…");
} else {
  await ctx.rebuild();
  await ctx.dispose();
  if (!sourcemap) {
    await removeShippedSourceMaps();
  }
  console.log(
    fixture
      ? "Fixture build complete → extension/ (127.0.0.1:18080 matches)"
      : "Production build complete → extension/",
  );
}
