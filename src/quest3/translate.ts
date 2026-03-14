import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import axios from "axios";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../outputs/quest3");

// Usage: npx tsx src/quest3/translate.ts <korean.pdf>
const inputPath = process.argv[2] ?? "";
if (!inputPath) {
  console.error("[Quest3] Usage: npx tsx src/quest3/translate.ts <korean.pdf>");
  process.exit(1);
}

const log = (msg: string) => console.log(`[Quest3] ${msg}`);

// ─── Types ────────────────────────────────────────────────────────────────────

interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
  pageHeight: number;
}

// ─── Step 1: Extract text with positions via pdfjs ───────────────────────────

async function extractText(pdfPath: string): Promise<TextItem[]> {
  const data = new Uint8Array(await fs.readFile(pdfPath));
  const doc = await pdfjs.getDocument({ data }).promise;
  const items: TextItem[] = [];

  for (let p = 0; p < doc.numPages; p++) {
    const page = await doc.getPage(p + 1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      // pdfjs transform: [scaleX, skewY, skewX, scaleY, x, y]
      const transform = item.transform as number[];
      const scaleY = transform[3] ?? 12;
      const x = transform[4] ?? 0;
      const y = transform[5] ?? 0;
      items.push({
        text: item.str,
        x,
        y,
        width: item.width ?? 0,
        height: Math.abs(scaleY),
        pageIndex: p,
        pageHeight: viewport.height,
      });
    }
  }

  return items;
}

// ─── Step 2: Translate via free Google Translate endpoint ─────────────────────
// Chunks text to stay under URL length limits, adds delay to avoid rate limiting

async function translateChunk(text: string): Promise<string> {
  const url = "https://translate.googleapis.com/translate_a/single";
  const res = await axios.get(url, {
    params: {
      client: "gtx",
      sl: "ko",
      tl: "en",
      dt: "t",
      q: text,
    },
  });
  // Response shape: [[[translated, original], ...], ...]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.data[0] as any[]).map((x: any) => x[0]).join("");
}

async function translateAll(items: TextItem[]): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  const unique = [...new Set(items.map((i) => i.text).filter((t) => t.trim()))];

  // Batch into ~500 char chunks to avoid hitting URL limits
  const CHUNK_SIZE = 500;
  const batches: string[][] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const t of unique) {
    if (currentLen + t.length > CHUNK_SIZE && current.length > 0) {
      batches.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(t);
    currentLen += t.length;
  }
  if (current.length > 0) batches.push(current);

  log(`Translating ${unique.length} unique string(s) in ${batches.length} batch(es)...`);

  for (const [i, batch] of batches.entries()) {
    const joined = batch.join("\n");
    const translated = await translateChunk(joined);
    const translatedLines = translated.split("\n");

    batch.forEach((orig, j) => {
      cache.set(orig, translatedLines[j] ?? orig);
    });

    // Small delay between batches to avoid rate limiting
    if (i < batches.length - 1) await new Promise((r) => setTimeout(r, 300));
  }

  return cache;
}

// ─── Step 3: Overlay translated text onto PDF ─────────────────────────────────

async function overlayTranslations(
  inputPdfPath: string,
  items: TextItem[],
  translations: Map<string, string>
): Promise<Uint8Array> {
  const bytes = await fs.readFile(inputPdfPath);
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const item of items) {
    const page = pages[item.pageIndex];
    if (!page) continue;

    const raw = translations.get(item.text);
    if (!raw || raw === item.text) continue;

    // Strip anything outside WinAnsi range (Latin-1 + common symbols)
    // Helvetica / StandardFonts cannot encode CJK, special quotes, etc.
    const translated = raw.replace(/[^\x20-\x7E\xA0-\xFF]/g, "").trim();
    if (!translated) continue;

    const fontSize = Math.min(Math.max(item.height * 0.7, 6), 11);

    // Use item.width as cover width — avoids calling widthOfTextAtSize on untrusted text
    page.drawRectangle({
      x: item.x,
      y: item.y - item.height * 0.2,
      width: Math.max(item.width, translated.length * fontSize * 0.55),
      height: item.height * 1.2,
      color: rgb(1, 1, 1),
      opacity: 1,
    });

    // Draw translated English text
    page.drawText(translated, {
      x: item.x,
      y: item.y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
      maxWidth: page.getWidth() - item.x - 10,
    });
  }

  return doc.save();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const absInput = path.resolve(inputPath);
  log(`Input:  ${absInput}`);

  log("Extracting text...");
  const items = await extractText(absInput);
  log(`Extracted ${items.length} text item(s) across ${new Set(items.map((i) => i.pageIndex)).size} page(s)`);

  if (items.length === 0) {
    log("No text found — PDF may be scanned/image-based. OCR required for that case.");
    return;
  }

  const translations = await translateAll(items);

  log("Overlaying translations...");
  const outputBytes = await overlayTranslations(absInput, items, translations);

  const outFile = path.join(OUTPUT_DIR, "translated.pdf");
  await fs.writeFile(outFile, outputBytes);

  const secs = ((Date.now() - start) / 1000).toFixed(2);
  log(`\nSaved: ${outFile}`);
  log(`Elapsed: ${secs}s`);
}

main().catch((err) => {
  console.error("[Quest3] Fatal:", err);
  process.exit(1);
});