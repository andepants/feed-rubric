import * as esbuild from "esbuild";
import { mkdir, copyFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const watch = process.argv.includes("--watch");

const staticFiles = [
  "manifest.json",
  "content.css",
  "popup.html",
  "options.html",
];

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
  sourcemap: true,
  logLevel: "info",
});

await copyStatic();

if (watch) {
  await ctx.watch();
  console.log("Watching for changes…");
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log("Build complete → extension/");
}
