# Mufin Junior Backend Quest v1.1.2 — Devlog

## Quest 1 — RPA Web Crawling

### What Works
**ArXiv** (`arxiv.org`) — crawl-first approach finds PDF links directly in the DOM. No handler needed. Runs in ~0.14s.

**KCI** (`kci.go.kr`) — needs `needsSession: true`, Puppeteer visits origin page first to establish cookies, then downloads via `page.goto` + `response.buffer()`.

### What Doesn't Work and Why

**SSRN** — behind Cloudflare. Tried in order:
1. Plain `https.get` → 403
2. Headless Puppeteer → 403 (headless detected)
3. `puppeteer-extra-plugin-stealth` + `headless: false` → still 403
- Verdict: skip. Cloudflare wins without residential proxies.

**MDPI** — behind Akamai CDN. Plain HTTP returns `Access Denied` HTML disguised as a file.
- Verdict: skip. Same class of problem as Cloudflare.

### Architecture
Crawl-first: load the page with Puppeteer, scan all `<a href>` for `.pdf` / `/pdf/` patterns, download matches directly via `https.get`. If direct download returns non-PDF bytes (`%PDF` header check fails), retry via browser session. Handlers array exists as an explicit override for sites where PDF links aren't in the DOM at all.

### Key Lesson
Check if `curl URL` returns the actual file before writing any code. If curl is blocked, Puppeteer will be too. CDN-protected sites (Cloudflare, Akamai) cannot be reliably scraped without rotating residential proxies.

### Approaches Tried (in order)
1. Generic heuristic scraper with `page.evaluate` string → `__name is not defined` (tsx transforms functions before browser serialization)
2. `page.evaluate` with real nested function → same issue
3. `$$eval` to move logic to Node side → fixed serialization, but SSRN still returned 0 links (JS-rendered button missing at `domcontentloaded`)
4. Switched to `networkidle2` + CDP response interception → file downloaded but corrupted (intercepted wrong response)
5. `page.waitForResponse` → timeout (listener registered after navigation)
6. `page.goto` → `response.buffer()` → 403 (headless detected by Cloudflare)
7. `puppeteer-extra-plugin-stealth` → still 403
8. Switched to ArXiv → plain HTTPS works, 0.14s ✓
9. Rewrote as crawl-first (scan DOM for PDF links) + handler fallback → clean, works for both ArXiv and KCI

---

## Quest 2 — Merging PDFs

### What Works
`pdf-lib` — load each PDF, copy pages into a new document, save. Sub-second for typical files.

### Implementation
```
npx tsx src/quest2/merge.ts <file1.pdf> <file2.pdf> [more...]
```
Takes any number of files as CLI args. Logs page count per file and total. Output: `outputs/quest2/merged.pdf`.

### Notes
No complications. `pdf-lib`'s `copyPages` + `addPage` is the right API — no edge cases encountered.

---

## Quest 3 — Korean PDF → English Translation

### What Works
3-step pipeline: extract text positions via `pdfjs-dist` → translate via free Google Translate endpoint → overlay English text with `pdf-lib`.

```
npx tsx src/quest3/translate.ts <korean.pdf>
```
Output: `outputs/quest3/translated.pdf`

### Issues Hit

**`__name is not defined`** — same tsx serialization issue as Quest 1. Avoided by not using `page.evaluate` for this quest.

**`WinAnsi cannot encode "『"` error** — Google Translate occasionally keeps Korean punctuation/brackets in the translated output. Helvetica (StandardFonts) can't encode CJK characters. Fix: strip anything outside WinAnsi range (`/[^\x20-\x7E\xA0-\xFF]/g`) before drawing.

**Font size tuning** — `height * 0.85` was too large (overflow), `height * 0.55` capped at 9pt was too small. Settled on `Math.min(Math.max(height * 0.7, 6), 11)`.

**`widthOfTextAtSize` crash** — calling this on untrusted translated text caused encoding errors. Replaced with safe estimate: `text.length * fontSize * 0.55`.

### Known Limitations
- Scanned/image-based PDFs return 0 text items — OCR required for those
- Layout fidelity isn't perfect — text positioning is approximate, overlapping text occurs on dense pages
- Free Google Translate endpoint has no SLA — may rate-limit on large PDFs (batching + 300ms delay mitigates this)

---

## Quest 4 — Linux Crawling

### Environment
WSL2 (Windows Subsystem for Linux) on the same Windows machine. Real Linux kernel, accessible at `/mnt/c/...`. No separate Linux machine needed.

### What It Does
General-purpose page crawler. Extracts title, text blocks (`p, h1-h4, li`), links, and image URLs from any target URL. Saves structured output to:
- `outputs/quest4/results.json`
- `outputs/quest4/links.csv`
- `logs/quest4.log` (timestamped, appended on every run)

### Linux-Specific Requirements
```bash
# Chromium deps — Ubuntu/Debian, run once
sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2
```

Required Puppeteer flags on Linux:
- `--no-sandbox`
- `--disable-setuid-sandbox`
- `--disable-dev-shm-usage`

### Reliability
Retry wrapper: 3 attempts with exponential backoff (1s, 2s, 4s). Handles site downtime and transient network failures. Each attempt logged with timestamp.

### Automation
```bash
# Cron — runs every hour
0 * * * * cd /mnt/c/CODES/junior-backend-quest-v1.1.2 && npx tsx src/quest4/linux-crawl.ts >> logs/cron.log 2>&1
```

---

## Stack Summary

| Quest | Key Libraries | Approach |
|---|---|---|
| Q1 | `puppeteer-extra`, `puppeteer-extra-plugin-stealth` | Crawl DOM for PDF links, direct HTTPS download, browser session fallback |
| Q2 | `pdf-lib` | Load → copy pages → save |
| Q3 | `pdfjs-dist`, `pdf-lib`, `axios` | Extract positions → translate → overlay |
| Q4 | `puppeteer-extra`, `puppeteer-extra-plugin-stealth` | Generic DOM scraper, JSON/CSV output, retry + logging |

## Performance

| Quest | Target | Actual |
|---|---|---|
| Q1 (ArXiv) | ≤ 16s | ~0.14s ✓ |
| Q2 | < 1s | < 0.5s ✓ |
| Q3 | < 30s | varies by PDF size |
| Q4 | ≤ 30s | < 5s ✓ |