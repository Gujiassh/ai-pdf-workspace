import { cp, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const publicRoot = join(projectRoot, "public", "pdfjs");
const imageRoot = join(publicRoot, "images");
const sourceImageRoot = join(pdfjsRoot, "web", "images");
const imageNames = (await readdir(sourceImageRoot)).filter((name) => name.startsWith("annotation-") && name.endsWith(".svg"));

await mkdir(publicRoot, { recursive: true });
await mkdir(imageRoot, { recursive: true });
await Promise.all([
  cp(join(pdfjsRoot, "build", "pdf.min.mjs"), join(publicRoot, "pdf.min.mjs")),
  cp(join(pdfjsRoot, "build", "pdf.worker.min.mjs"), join(publicRoot, "pdf.worker.min.mjs")),
  ...imageNames.map((name) => cp(join(sourceImageRoot, name), join(imageRoot, name))),
]);
