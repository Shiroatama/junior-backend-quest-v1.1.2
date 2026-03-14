# mufin-quest

> Lean TypeScript + Node.js solution for the Mufin Junior Backend Quest v1.1.2.
> Zero frameworks. Pure Node.js. Built for speed and clarity.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js (v20+) | Required by spec |
| Language | TypeScript | Type safety, maintainability |
| Runner | `tsx` | Run TS directly without compile step |
| Browser Automation | `puppeteer` | Headless Chrome for Quest 1 & 4 |
| PDF Manipulation | `pdf-lib` | Merge + overlay text (Quest 2 & 3) |
| PDF Text Extraction | `pdfjs-dist` | Extract Korean text (Quest 3) |
| Translation | `axios` (free Google Translate API) | No API key needed for basic use |

No Express. No Next.js. No frameworks — just Node.js and purpose-built libraries.

---

## Prerequisites

- Node.js v20 or higher
- npm v9 or higher
- Git
- Windows OS (Quest 1) or Linux (Quest 4)

---

## Setup

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/mufin-quest.git
cd mufin-quest

# 2. Install dependencies
npm install

# 3. Verify setup
npx tsx --version
```

---

## Project Structure

```
mufin-quest/
├── src/
│   ├── quest1/
│   │   └── crawl.ts          # RPA: search address → download PDFs
│   ├── quest2/
│   │   └── merge.ts          # Merge PDF A + PDF B → single output
│   ├── quest3/
│   │   └── translate.ts      # Extract Korean text → translate → overlay
│   └── quest4/
│       └── linux-crawl.ts    # Linux-compatible headless crawl
├── outputs/                  # All generated PDFs land here
├── logs/                     # Quest 4 execution logs
├── package.json
├── tsconfig.json
└── README.md
```

---

## Quest 1 — RPA Web Crawling (Windows)

**Goal**: Search for an address on a target site, download all PDF files. Target: ≤ 16 seconds. Stretch: ≤ 8 seconds.

### Step-by-step implementation

1. Launch headless Chromium via Puppeteer
2. Navigate to target URL
3. Input the address into the search field and submit
4. Wait for results to load (use `networkidle2` or explicit selector wait — avoid arbitrary `sleep`)
5. Scrape all PDF links from the results page
6. Download PDFs in parallel using `Promise.all` with Node's `https` module
7. Save to `/outputs/quest1/`
8. Log total elapsed time

### Run

```bash
npx tsx src/quest1/crawl.ts
```

### Performance tips

- Use `page.setRequestInterception(true)` to block images, fonts, and CSS — only load HTML and XHR
- Download PDFs in parallel, not sequentially
- Use `networkidle0` only if necessary; prefer explicit element waits
- Reuse a single browser instance across requests if crawling multiple addresses

### Expected output

```
[Quest 1] Starting crawl...
[Quest 1] Found 3 PDF(s)
[Quest 1] Downloaded: outputs/quest1/doc_1.pdf
[Quest 1] Downloaded: outputs/quest1/doc_2.pdf
[Quest 1] Downloaded: outputs/quest1/doc_3.pdf
[Quest 1] Completed in 7.4s ✓
```

---

## Quest 2 — Merge PDFs

**Goal**: Combine PDF A (10 pages) + PDF B (3 pages) into a single 13-page document.

### Step-by-step implementation

1. Load both PDFs using `pdf-lib`'s `PDFDocument.load()`
2. Create a new `PDFDocument`
3. Copy all pages from PDF A into the new document
4. Copy all pages from PDF B into the new document
5. Save the merged document to `/outputs/quest2/merged.pdf`
6. Assert page count === 13

### Run

```bash
npx tsx src/quest2/merge.ts --a=path/to/a.pdf --b=path/to/b.pdf
```

### Expected output

```
[Quest 2] Loaded PDF A: 10 pages
[Quest 2] Loaded PDF B: 3 pages
[Quest 2] Merged: outputs/quest2/merged.pdf (13 pages) ✓
```

---

## Quest 3 — Korean PDF → English Translation

**Goal**: Extract Korean text from a PDF, translate it to English, and overlay the translated text back onto the PDF.

### Step-by-step implementation

1. **Extract text** — Use `pdfjs-dist` to extract text content per page, preserving rough position data (x, y, width, height)
2. **Chunk text** — Group extracted text into translatable segments (avoid hitting rate limits)
3. **Translate** — Send chunks to Google Translate via the free `translate.googleapis.com` endpoint using `axios`. No API key required for lightweight use.
4. **Overlay** — Use `pdf-lib` to draw white rectangles over original Korean text bounding boxes, then render English text using an embedded font (PDFLib standard fonts or a custom TTF)
5. **Save** — Write output to `/outputs/quest3/translated.pdf`

### Run

```bash
npx tsx src/quest3/translate.ts --input=path/to/korean.pdf
```

### Notes

- `pdfjs-dist` provides `getTextContent()` which returns items with `transform` matrix (position) and `str` (text)
- For the free Google Translate endpoint: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=en&dt=t&q=ENCODED_TEXT`
- If the PDF uses custom Korean fonts, text extraction may be lossy — flag this in your Loom video
- For pixel-perfect overlay, match font size from the extracted item's `height` field

### Expected output

```
[Quest 3] Extracting text from 5 pages...
[Quest 3] Translating 47 text segments...
[Quest 3] Overlaying translated text...
[Quest 3] Saved: outputs/quest3/translated.pdf ✓
```

---

## Quest 4 — Linux Web Crawling

**Goal**: Crawl a target website on Linux, extract structured data, automate with error handling. Store results as JSON or CSV.

### Step-by-step implementation

1. Use Puppeteer in headless mode (works on Linux with `--no-sandbox` flag)
2. Navigate to the target URL
3. Extract target data (text, links, images — depends on site)
4. Write output to `/outputs/quest4/results.json`
5. Append a timestamped entry to `/logs/quest4.log` on each run
6. Handle errors: catch network timeouts, selector failures, and site downtime — retry up to 3 times with exponential backoff
7. Optionally wire to a cron job using `crontab -e`

### Run

```bash
npx tsx src/quest4/linux-crawl.ts
```

### Linux-specific setup

```bash
# Install Chromium dependencies on Ubuntu/Debian
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2

# Run Puppeteer with no-sandbox (required on Linux without a display)
# Already handled in code via: args: ['--no-sandbox', '--disable-setuid-sandbox']
```

### Cron job example (runs every hour)

```bash
0 * * * * cd /path/to/mufin-quest && npx tsx src/quest4/linux-crawl.ts >> logs/cron.log 2>&1
```

### Expected output (log)

```
[2025-01-15T10:00:01Z] [Quest 4] Crawl started
[2025-01-15T10:00:04Z] [Quest 4] Fetched 24 records
[2025-01-15T10:00:04Z] [Quest 4] Saved: outputs/quest4/results.json
[2025-01-15T10:00:04Z] [Quest 4] Completed in 3.1s ✓
```

---

## package.json (reference)

```json
{
  "name": "mufin-quest",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "quest1": "tsx src/quest1/crawl.ts",
    "quest2": "tsx src/quest2/merge.ts",
    "quest3": "tsx src/quest3/translate.ts",
    "quest4": "tsx src/quest4/linux-crawl.ts"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "pdf-lib": "^1.17.1",
    "pdfjs-dist": "^4.0.0",
    "puppeteer": "^21.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.3.0"
  }
}
```

---

## tsconfig.json (reference)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

---

## Performance Benchmarks

| Quest | Target | Stretch Goal | Strategy |
|---|---|---|---|
| Q1 | ≤ 16s | ≤ 8s | Block assets, parallel downloads |
| Q2 | < 1s | < 0.5s | Pure in-memory, no disk reads mid-op |
| Q3 | < 30s | < 15s | Batch translate requests |
| Q4 | ≤ 30s | < 10s | Block assets, targeted selectors |

---

## Deliverables Checklist

- [ ] Quest 1: `src/quest1/crawl.ts` + Loom video showing ≤ 16s run
- [ ] Quest 2: `src/quest2/merge.ts` + merged PDF output + Loom video
- [ ] Quest 3: `src/quest3/translate.ts` + translated PDF output + Loom video
- [ ] Quest 4: `src/quest4/linux-crawl.ts` + `/logs/quest4.log` + Loom video
- [ ] GitHub repo link
- [ ] Email submission to recruiting@mufin.co.kr

---

## Notes for AI Agents / Future Devs

- Each quest is a **standalone script** — no shared state between quests
- All file I/O is relative to project root; create `outputs/` and `logs/` dirs if missing
- Puppeteer downloads Chromium on first `npm install` (~300MB) — this is expected
- For Quest 3, if the free Google Translate endpoint gets rate-limited, add a delay between chunk requests or use `@vitalets/google-translate-api` as a drop-in
- Quest 4 Linux compatibility depends on having Chromium deps installed — the setup block above covers Ubuntu/Debian