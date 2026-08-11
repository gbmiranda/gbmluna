import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const OUT_DIR = "dist";

mkdirSync(OUT_DIR, { recursive: true });

await build({
  entryPoints: [
    "src/background.ts",
    "src/popup.ts",
    "src/offscreen.ts",
    "src/content.ts",
  ],
  bundle: true,
  format: "esm",
  target: "chrome120",
  outdir: OUT_DIR,
});

cpSync("public", OUT_DIR, { recursive: true });

console.log(`Extensão gerada em ${OUT_DIR}/`);
