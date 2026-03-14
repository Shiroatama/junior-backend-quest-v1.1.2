import { createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { type Browser, type Page } from "puppeteer";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const puppeteer = require("puppeteer-extra") as any;
puppeteer.use(require("puppeteer-extra-plugin-stealth")());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUTPUT_DIR = path.join(ROOT, "outputs", "quest4");
const LOG_FILE = path.join(ROOT, "logs", "quest4.log");

// Usage: npx tsx src/quest4/linux-crawl.ts <url>
const DEFAULT_URL = "https://arxiv.org/";
const targetUrl = process.argv[2] ?? DEFAULT_URL;

const MAX_RETRIES = 3;

// ─── Logging ──────────────────────────────────────────────────────────────────

async function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  await fs.appendFile(LOG_FILE, line + "\n").catch(() => {});
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CrawlResult {
  url: string;
  title: string;
  links: string[];
  images: string[];
  text: string[];
  crawledAt: string;
}

// ─── Crawl ────────────────────────────────────────────────────────────────────

async function crawlPage(page: Page, url: string): Promise<CrawlResult> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

  return page.evaluate(() => {
    const text = Array.from(document.querySelectorAll("p, h1, h2, h3, h4, li"))
      .map((el) => el.textContent?.trim() ?? "")
      .filter((t) => t.length > 10);

    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((el) => (el as HTMLAnchorElement).href)
      .filter((h) => h.startsWith("http"));

    const images = Array.from(document.querySelectorAll("img[src]"))
      .map((el) => (el as HTMLImageElement).src)
      .filter((s) => s.startsWith("http"));

    return {
      url: location.href,
      title: document.title,
      links: [...new Set(links)],
      images: [...new Set(images)],
      text: [...new Set(text)],
      crawledAt: new Date().toISOString(),
    };
  });
}

// ─── Retry with exponential backoff ───────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === retries;
      await log(`Attempt ${attempt}/${retries} failed: ${(err as Error).message}`);
      if (isLast) throw err;
      const delay = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
      await log(`Retrying in ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.join(ROOT, "logs"), { recursive: true });

  await log(`Crawl started → ${targetUrl}`);

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",               // required on Linux
        "--disable-setuid-sandbox",   // required on Linux
        "--disable-dev-shm-usage",    // prevents crashes in low-memory Linux envs
        "--disable-gpu",
      ],
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
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    const result = await withRetry(() => crawlPage(page, targetUrl));

    await log(`Crawled: "${result.title}"`);
    await log(`Links: ${result.links.length} | Images: ${result.images.length} | Text blocks: ${result.text.length}`);

    // Save JSON
    const outFile = path.join(OUTPUT_DIR, "results.json");
    await fs.writeFile(outFile, JSON.stringify(result, null, 2));
    await log(`Saved → ${outFile}`);

    // Also save CSV of links
    const csvFile = path.join(OUTPUT_DIR, "links.csv");
    const csv = ["url", ...result.links].join("\n");
    await fs.writeFile(csvFile, csv);
    await log(`Saved → ${csvFile}`);

    const secs = ((Date.now() - start) / 1000).toFixed(2);
    await log(`Completed in ${secs}s ${+secs <= 30 ? "✓ PASS" : "✗ SLOW"}`);
  } catch (err) {
    await log(`Fatal: ${(err as Error).message}`);
    process.exit(1);
  } finally {
    await browser?.close();
  }
}

main();