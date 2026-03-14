# Junior Backend Quest v1.1.2

**Submitted by:** Gabriel Breuyan  
**Stack:** Node.js v20 · TypeScript · tsx  
**Repo:** [https://github.com/YOUR_USERNAME/junior-backend-quest-v1.1.2](https://github.com/YOUR_USERNAME/junior-backend-quest-v1.1.2)

---

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/junior-backend-quest-v1.1.2
cd junior-backend-quest-v1.1.2
npm install
```

**Requirements:** Node.js v20+, npm v9+

---

## Quest 1 — RPA Web Crawling

Crawls a target page for PDF links and downloads them. Blocks unnecessary assets (images, fonts, media) for speed. Falls back to a browser session automatically if direct download is blocked.

```bash
# Default target (ArXiv)
npx tsx src/quest1/crawl.ts

# Custom URL
npx tsx src/quest1/crawl.ts "https://arxiv.org/abs/2601.00044"
```

**Output:** `outputs/quest1/*.pdf`  
**Performance:** ~0.14s on ArXiv ✓

---

## Quest 2 — Merge PDFs

Merges two or more PDFs into a single document. Accepts any number of files.

```bash
npx tsx src/quest2/merge.ts <file1.pdf> <file2.pdf> [more.pdf...]
```

**Example:**

```bash
npx tsx src/quest2/merge.ts outputs/quest1/paper_a.pdf outputs/quest1/paper_b.pdf
```

**Output:** `outputs/quest2/merged.pdf`  
**Performance:** < 0.5s ✓

---

## Quest 3 — Korean PDF → English Translation

Extracts text positions from a Korean PDF, translates via Google Translate (no API key needed), and overlays English text back onto the original PDF layout.

```bash
npx tsx src/quest3/translate.ts <korean.pdf>
```

**Example:**

```bash
npx tsx src/quest3/translate.ts outputs/quest1/korean-paper.pdf
```

**Output:** `outputs/quest3/translated.pdf`

---

## Quest 4 — Linux Crawling

Structured web crawler built for Linux. Extracts title, text blocks, links, and image URLs from any target page. Saves JSON + CSV output with timestamped logs. Includes retry logic with exponential backoff.

**Linux setup — run once (WSL2/Ubuntu):**

```bash
sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2
```

**Enter Linux environment (WSL2):**

```bash
wsl
cd /mnt/c/CODES/junior-backend-quest-v1.1.2
```

**Run:**

```bash
npx tsx src/quest4/linux-crawl.ts [url]
```

**Example:**

```bash
npx tsx src/quest4/linux-crawl.ts "https://arxiv.org/list/physics.geo-ph/recent"
```

**Output:**

- `outputs/quest4/results.json` — structured crawl data
- `outputs/quest4/links.csv` — all links found on page
- `logs/quest4.log` — timestamped log, appended on every run

---

## Project Structure

```
junior-backend-quest-v1.1.2/
├── src/
│   ├── quest1/crawl.ts          # RPA PDF crawler
│   ├── quest2/merge.ts          # PDF merger
│   ├── quest3/translate.ts      # Korean → English PDF translator
│   └── quest4/linux-crawl.ts    # Linux structured web crawler
├── outputs/
│   ├── quest1/                  # Downloaded PDFs
│   ├── quest2/                  # merged.pdf
│   ├── quest3/                  # translated.pdf
│   └── quest4/                  # results.json, links.csv
├── logs/
│   └── quest4.log
├── .cursorrules
├── DEVLOG.md                    # What worked, what didn't, and why
├── package.json
└── tsconfig.json
```

---

## Performance


| Quest | Target | Achieved           |
| ----- | ------ | ------------------ |
| Q1    | ≤ 16s  | 0.14s ✓            |
| Q2    | < 1s   | 0.31s ✓            |
| Q3    | ≤ 30s  | varies by PDF size |
| Q4    | ≤ 30s  | < 5s ✓             |


---

## Notes

- Sites behind Cloudflare or Akamai CDN (SSRN, MDPI) block automated downloads at the network level — no workaround without residential proxies. ArXiv and open-access government portals are used as targets instead.
- Quest 4 uses WSL2 as the Linux environment on a Windows machine — all Linux-specific Puppeteer flags (`--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`) are included.
- See `DEVLOG.md` for the full breakdown of approaches tried across all quests.

