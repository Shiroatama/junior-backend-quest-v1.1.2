import { PDFDocument } from "pdf-lib";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../outputs/quest2");

// Usage: npx tsx src/quest2/merge.ts <file1.pdf> <file2.pdf> [more.pdf...]
// npx tsx src/quest2/merge.ts outputs/quest1/2601.00044.pdf outputs/quest1/2601.00046.pdf
// Output: outputs/quest2/merged.pdf

const log = (msg: string) => console.log(`[Quest2] ${msg}`);

async function main() {
  const start = Date.now();

  const inputs = process.argv.slice(2);
  if (inputs.length < 2) {
    console.error("[Quest2] Usage: npx tsx src/quest2/merge.ts <file1.pdf> <file2.pdf> [more...]");
    process.exit(1);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const merged = await PDFDocument.create();

  for (const filepath of inputs) {
    const abs = path.resolve(filepath);
    const bytes = await fs.readFile(abs);
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
    log(`Added: ${path.basename(abs)} (${doc.getPageCount()} page(s))`);
  }

  const dest = path.join(OUTPUT_DIR, "merged.pdf");
  await fs.writeFile(dest, await merged.save());

  const secs = ((Date.now() - start) / 1000).toFixed(2);
  log(`\nMerged: ${merged.getPageCount()} total pages → ${dest}`);
  log(`Elapsed: ${secs}s`);
}

main().catch((err) => {
  console.error("[Quest2] Fatal:", err);
  process.exit(1);
});