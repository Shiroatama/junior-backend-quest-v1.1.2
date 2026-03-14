import { createWriteStream } from "fs";
import fs from "fs/promises";
import https from "https";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { type Browser, type Page } from "puppeteer";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const puppeteer = require("puppeteer-extra") as any;
puppeteer.use(require("puppeteer-extra-plugin-stealth")());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../outputs/quest1");

// Usage: npx tsx src/quest1/crawl.ts <url>
// Crawls the page for PDF links and downloads them.
// Falls back to browser session if direct download is blocked.

const DEFAULT_URL = "https://arxiv.org/abs/2601.00044";
const inputUrl = process.argv[2] ?? DEFAULT_URL;

const log = (msg: string) => console.log(`[Quest1] ${msg}`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toFilename(url: string, index: number): string {
  const raw = url.split("/").pop()?.split("?")[0] ?? `document_${index}`;
  const clean = raw.replace(/[^a-zA-Z0-9._-]/g, "_");
  const base = clean || `document_${index}`;
  return base.endsWith(".pdf") ? base : `${base}.pdf`;
}

function downloadDirect(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const protocol = url.startsWith("https") ? https : http;

    const get = (target: string) => {
      protocol.get(target, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          file.close();
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
        file.on("error", reject);
      }).on("error", reject);
    };

    get(url);
  });
}

// ─── Step 1: crawl page for PDF links ────────────────────────────────────────

async function crawlForPdfs(page: Page): Promise<string[]> {
  const hrefs = await page.$$eval("a[href]", (els) =>
    els.map((el) => (el as HTMLAnchorElement).href)
  );

  return [...new Set(
    hrefs.filter((href) => {
      const h = href.toLowerCase();
      // Direct .pdf link or common PDF delivery patterns
      return (
        h.includes(".pdf") ||
        h.includes("/pdf/") ||
        h.includes("download") && h.includes("pdf")
      );
    })
  )];
}

// ─── Step 2: download via browser session (for session-gated sites) ───────────

async function downloadWithSession(pdfUrls: string[], originUrl: string, page: Page): Promise<void> {
  for (const [i, pdfUrl] of pdfUrls.entries()) {
    const dest = path.join(OUTPUT_DIR, toFilename(pdfUrl, i + 1));
    const res = await page.goto(pdfUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!res || res.status() !== 200) throw new Error(`HTTP ${res?.status()}`);

    const buffer = await res.buffer();
    if (buffer.slice(0, 4).toString() !== "%PDF")
      throw new Error("Response is not a PDF — likely an auth wall or wrong URL");

    await fs.writeFile(dest, buffer);
    log(`✓ ${path.basename(dest)} (${(buffer.length / 1024).toFixed(1)} KB)`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  log(`Target: ${inputUrl}\n`);

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    }) as Browser;

    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    log("Loading page...");
    await page.goto(inputUrl, { waitUntil: "networkidle2", timeout: 30_000 });

    const pdfUrls = await crawlForPdfs(page);
    log(`Found ${pdfUrls.length} PDF link(s) on page`);

    if (pdfUrls.length === 0) {
      log("No PDF links found. The PDFs may be behind a JS button or require a session.");
      return;
    }

    pdfUrls.forEach((u, i) => log(`  [${i + 1}] ${u}`));
    log("");

    // Try direct download first, fall back to session download if needed
    const results = await Promise.allSettled(
      pdfUrls.map(async (url, i) => {
        const dest = path.join(OUTPUT_DIR, toFilename(url, i + 1));
        await downloadDirect(url, dest);

        // Verify it's actually a PDF
        const buf = await fs.readFile(dest);
        if (buf.slice(0, 4).toString() !== "%PDF") {
          // Not a real PDF — retry via browser session
          log(`  Direct download blocked for [${i + 1}], retrying with browser session...`);
          await downloadWithSession([url], inputUrl, page);
        } else {
          log(`✓ ${path.basename(dest)} (${(buf.length / 1024).toFixed(1)} KB)`);
        }
      })
    );

    const passed = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    results.forEach((r, i) => {
      if (r.status === "rejected") log(`✗ [${i + 1}] ${(r.reason as Error).message}`);
    });

    const secs = ((Date.now() - start) / 1000).toFixed(2);
    log(`\nDownloaded: ${passed} | Failed: ${failed}`);
    log(`Elapsed: ${secs}s ${+secs <= 8 ? "✓ EXCELLENT" : +secs <= 16 ? "✓ PASS" : "✗ SLOW"}`);
  } finally {
    await browser?.close();
  }
}

main().catch((err) => {
  console.error("[Quest1] Fatal:", err);
  process.exit(1);
});