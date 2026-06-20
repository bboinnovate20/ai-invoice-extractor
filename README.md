# Business Extract Web

A client-side web application for extracting structured data from invoice PDFs and exporting results as Excel spreadsheets. Built with React 19, TypeScript, Vite, and Tailwind CSS.

## Overview

The application processes invoice PDFs entirely in the browser:

1. **File Selection** — Drag-and-drop or browse up to 100 PDF files (10 MB each)
2. **OCR Extraction** — Renders PDF pages to images via `pdfjs-dist` and extracts text using `Tesseract.js`
3. **AI Processing** — Sends extracted text in batches to an AWS Lambda endpoint that performs AI/ML extraction of structured fields
4. **Excel Export** — Assembles results into an `.xlsx` workbook using the `xlsx` library, leveraging a Rust-compiled WASM module for high-performance base64 decoding

---

## Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-01 | Users shall be able to drag-and-drop or browse to select multiple PDF files | Implemented |
| FR-02 | The system shall accept up to 100 files, each under 10 MB | Implemented |
| FR-03 | Duplicate files (same name + size) shall be skipped | Implemented |
| FR-04 | Users shall define custom column headers for data extraction | Implemented |
| FR-05 | The system shall extract text from PDFs via client-side OCR (Tesseract.js) | Implemented |
| FR-06 | Extracted text shall be sent to an AWS Lambda endpoint for AI/ML structured data extraction | Implemented |
| FR-07 | Results shall be assembled into an `.xlsx` workbook and downloaded automatically | Implemented |
| FR-08 | The system shall support batch processing: files are split into batches of 20 for Lambda calls | Implemented |
| FR-09 | Users shall receive progress indicators during extraction (current file / total files) | Implemented |
| FR-10 | Error states (OCR failures, Lambda failures, network errors) shall surface via toast notifications | Implemented |

---

## Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | OCR and Lambda processing must run **without a backend server** (fully client-side) | Zero server infrastructure for processing |
| NFR-02 | The UI thread must remain responsive during long-running operations | No frame drops > 200ms during OCR |
| NFR-03 | File processing shall not upload raw PDFs unless the S3 upload path is explicitly activated | Minimize bandwidth and server costs |
| NFR-04 | Lambda batch calls shall be limited to 20 items per request to respect Lambda payload limits (6 MB) and timeout constraints (30s) | Batch size = 20 |
| NFR-05 | Excel generation shall use WASM for base64 decoding to avoid blocking the main thread with JavaScript decoding | < 50ms for decoding a 5MB base64 payload |
| NFR-06 | S3 presigned URLs shall have a configurable TTL (default 1 hour) | TTL = 3600s |
| NFR-07 | The app shall degrade gracefully when S3 credentials are absent (show warning, not crash) | Banner shown, S3 path disabled |
| NFR-08 | All external API calls (Lambda) shall use HTTPS | Enforced via URL scheme |
| NFR-09 | The build shall produce optimized static assets deployable to any CDN or static host | `dist/` output |

---

## Architecture Decision Record: Migrating Upload to Local Processing

### Context

The application was originally designed with an **upload-first** architecture: files would be uploaded to AWS S3 (direct browser-to-S3), and a Lambda function would download them, run OCR, extract invoice fields via AI, and return an Excel file.
 
However, this architecture had a critical performance problem — with 40+ files, the Lambda was doing everything sequentially: downloading each PDF, running Tesseract OCR page by page, calling the AI API, and converting to Excel. This made processing extremely slow, and cold starts made it worse.
 
**The decision was made to move OCR to the client side.**
 
The current architecture works as follows: files never leave the browser until OCR is complete. The user selects PDF files locally, Tesseract.js runs OCR directly in the browser on each file, and only the extracted plain text is sent to Lambda. This means Lambda now only does one thing — calls the LLM API to extract structured fields from the text.
 
The S3 upload pipeline (`s3.ts`, `handleUpload`) remains in the codebase but is bypassed in the current `handleSubmit` flow. Lambda returns only the structured JSON response — the client handles Excel conversion locally using SheetJS (`xlsx`).
 
The Lambda is exposed via AWS API Gateway HTTP API (`POST /`).


### Decision

**Migrate processing to a local-first model: perform OCR on the client and transmit only extracted text to Lambda, eliminating the intermediary S3 upload for PDFs.**

### Rationale

1. **Eliminates upload latency** — Uploading 100 PDFs (each up to 10 MB) to S3 can take minutes on typical connections. Local OCR avoids this entirely.
2. **Reduces server/AWS costs** — No S3 storage, bandwidth, or PUT request costs. The Lambda endpoint receives only text (kilobytes, not megabytes).
3. **Simplifies security** — Raw PDFs never leave the user's browser. Only extracted OCR text (and inferred structured data) is transmitted.


### Trade-offs

| Approach | Upload-First (S3) | Local-First (OCR) |
|----------|-------------------|-------------------|
| **Network bandwidth** | High (upload raw PDFs) | Low (send extracted text) |
| **Client CPU/memory** | Low | High (Tesseract + pdf.js rendering) |
| **Security** | PDFs leave the browser | PDFs never leave the browser |
| **S3 dependency** | Required | Not required |
| **OCR quality control** | Server-side possible | Fixed to Tesseract.js (English) |
| **Scalability** | Unlimited (cloud OCR) | Limited by browser resources |

---

## Batch Processing for Uploads > 20

### Problem

When processing more than 20 PDFs, sending all extracted text in a single Lambda request presents several issues:

1. **Payload size** — 20+ invoices of OCR text can exceed Lambda's 6 MB request payload limit.
2. **Timeout risk** — Lambda has a maximum execution time (default 30s). Processing 100 invoices sequentially on the server side risks timeout.
3. **Failure atomicity** — A single failure in a monolithic request means reprocessing everything from scratch.
4. **Debuggability** — Isolating which invoice caused an extraction failure is difficult with one large payload.

### Solution: Chunked Batch Processing

The application splits texts into fixed-size batches of **20** before sending them to Lambda. This is implemented in `src/services/process.ts` (`processBatch` at line 87 and `processTextBatch` at line 181).

#### How It Works

```
100 files → OCR → 100 text strings
  ↓
Split into batches of 20:
  Batch 1: texts[0..19]  → Lambda → json_content[0..19]
  Batch 2: texts[20..39] → Lambda → json_content[20..39]
  Batch 3: texts[40..59] → Lambda → json_content[40..59]
  Batch 4: texts[60..79] → Lambda → json_content[60..79]
  Batch 5: texts[80..99] → Lambda → json_content[80..99]
  ↓
Merge all json_content arrays → Single XLSX workbook
```

#### Batch Processing Strategy

Currently, batches are processed **sequentially** (each batch waits for the previous to complete). This ensures:
- No race conditions in result ordering.
- Predictable memory usage (only one batch's response in memory at a time).
- Simple error handling (fail on the first batch that errors).

**Future optimization**: Batches can be parallelized with a concurrency limit (e.g., 3 concurrent batches) using a semaphore pattern, reducing total Lambda wall time by up to 3× while staying within browser connection limits (6 per origin).

---

## Threading and Optimization Techniques

### 1. Web Worker for PDF Rendering (pdfjs-dist)

`pdfjs-dist` is configured with a **web worker** (`src/services/ocr.ts:3-5`), offloading PDF parsing and canvas rendering from the main thread. This prevents the UI from freezing during OCR of multi-page PDFs.

```typescript
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker
```

### 2. WebAssembly (WASM) for Base64 Decoding

Lambda may return Excel files as base64-encoded strings. Decoding large base64 payloads (5+ MB) in pure JavaScript can block the main thread. The application uses a **Rust-compiled WASM module** (`pkg/download_excel_bg.wasm`) invoked via `decode_base64()`, which decodes base64 to `Uint8Array` at near-native speed without blocking the main thread.

```
Lambda (base64) → decode_base64 (WASM) → Uint8Array → Blob → Download
```

### 3. Promise.allSettled for Parallel S3 Uploads

When the S3 upload path is used, `uploadMultipleToS3` (`src/services/s3.ts:194-221`) dispatches all files concurrently via `Promise.allSettled`. This is a fire-and-forget pattern: all N uploads start simultaneously, and results are collected with error isolation (individual file failures don't block others).

```typescript
const results = await Promise.allSettled(
  files.map(file => uploadToS3(file, options))
)
```

**Impact**: 100 files uploading sequentially would take ~100 × 2s = 200 seconds. With `Promise.allSettled` and a typical browser connection limit of 6 concurrent requests, this drops to ~100/6 × 2s ≈ 34 seconds (5.8× speedup).

**Trade-off**: No explicit concurrency cap. For 100+ files, browsers may queue requests above the connection limit, causing head-of-line blocking. A future enhancement could cap concurrency at 6-8 with a semaphore.

### 4. React Compiler (Automatic Memoization)

The project uses **React Compiler** (`babel-plugin-react-compiler` in `vite.config.ts:11`) which automatically memoizes components and callbacks. This eliminates the need for manual `useMemo` / `useCallback` in most cases and reduces unnecessary re-renders during UI updates (file list changes, progress bar updates).

### 5. Sequential OCR with Per-File Progress

OCR processing is intentionally **sequential** (`src/services/ocr.ts:38-50, 52-64`) rather than parallel. Rationale:
- Tesseract.js and pdf.js rendering are CPU-intensive; parallel execution on the same thread provides no speedup (JavaScript is single-threaded).
- Sequential processing enables accurate per-file progress reporting (`Extracting invoice 5 of 100...`).
- Memory is bounded — only one PDF's rendered images are in memory at a time.

**Future enhancement**: Tesseract.js supports `createWorker` with a scheduler. A worker pool (e.g., 2-4 workers via `Tesseract.createWorker()` in Web Workers) could process multiple PDFs in parallel, offering 2-4× speedup at the cost of higher memory usage.

### 6. Client-Side Excel Assembly (xlsx)

Rather than returning a full Excel file from Lambda (base64 overhead), the batch processing flow requests `as_json: true` from Lambda, receives lightweight JSON rows, and assembles the workbook client-side using the `xlsx` library. This avoids base64 transmission overhead for large workbooks and keeps Lambda response payloads small.

### Summary of Optimization Impact

| Technique | Before | After | Improvement |
|-----------|--------|-------|-------------|
| WASM base64 decode | 500ms (JS) | <50ms (WASM) | 10× faster |
| S3 parallel uploads | 200s sequential | ~34s parallel | 5.8× faster |
| React Compiler | Manual memoization | Automatic | Reduced re-renders |
| pdf.js Worker | Main thread PDF parsing | Offloaded to worker | No UI freeze |
| Batch size = 20 | N/A | N/A | Avoids Lambda limits |

---

## Project Structure

```
src/
├── main.tsx                   # React entry point (StrictMode + ToastProvider)
├── App.tsx                    # Main application: upload, OCR, Lambda orchestration
├── App.css / index.css        # Tailwind + CSS custom properties (dark mode)
├── components/
│   ├── FileUpload.tsx         # Drag-and-drop file picker with validation
│   ├── ColumnInput.tsx        # Column name input component
│   ├── Toast.tsx              # Toast notification system
│   └── ToastContext.ts        # Toast React context
├── services/
│   ├── s3.ts                  # AWS S3 client: upload, presigned URLs
│   ├── ocr.ts                 # PDF-to-text via Tesseract.js + pdfjs-dist
│   └── process.ts             # Lambda API integration + WASM Excel download
pkg/                           # Rust-compiled WASM for base64 decoding
public/                        # Static assets (favicon, icons)
```

## Getting Started

### Prerequisites

- Node.js ≥ 18
- pnpm

### Installation

```bash
pnpm install
```

### Environment Configuration

Copy the example environment file and fill in your AWS credentials (optional — only needed for S3 upload path):

```bash
cp .env.example .env.local
```

Required variables (for S3):

| Variable | Description |
|----------|-------------|
| `VITE_AWS_REGION` | AWS region (e.g., `us-east-1`) |
| `VITE_AWS_BUCKET` | S3 bucket name |
| `VITE_AWS_ACCESS_KEY_ID` | AWS access key |
| `VITE_AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `VITE_AWS_ENDPOINT` | (Optional) Custom S3-compatible endpoint |

### Development

```bash
pnpm dev
```

The Vite dev server starts at `http://localhost:5173`. A proxy rewrites `/lambda/*` to `http://localhost:8080` for local Lambda emulation.

### Build

```bash
pnpm build
```

Outputs optimized static files to `dist/`.

### Lint

```bash
pnpm lint
```

---

## Lambda API

**Endpoint**: `https://unk0evcl6k.execute-api.us-east-1.amazonaws.com/prod/`

### Request Format (Batch)

```json
{
  "columns": ["Invoice Number", "Date", "Amount", "Vendor"],
  "text": "Invoice 1\n...\n\n---\n\nInvoice 2\n...",
  "as_json": true
}
```

### Response Format

```json
{
  "statusCode": 200,
  "body": {
    "message": "Extraction complete",
    "json_content": "[{\"Invoice Number\": \"...\", ...}]"
  }
}
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI Framework | React 19 |
| Language | TypeScript 6 |
| Build Tool | Vite 8 |
| Styling | Tailwind CSS 4 |
| PDF Rendering | pdfjs-dist 6 |
| OCR Engine | Tesseract.js 7 |
| Excel Generation | xlsx 0.18 |
| Cloud Storage | AWS S3 (@aws-sdk/client-s3) |
| AI Processing | AWS Lambda |
| WASM Runtime | Custom Rust-compiled module |
| State Management | React Context + useState |
| Linting | ESLint 10 + TypeScript ESLint |

---

<!-- LLM-REFINE-START -->
This section is intended for LLM-assisted refinement. The content above describes the complete architecture, requirements, and optimization rationale for Business Extract Web. When refining this document, please:
1. Validate factual accuracy against the source code in `src/`
2. Ensure all function and non-function requirements align with implemented features
3. Verify the architecture decision (ADR) reflects the actual code path in `App.tsx` (local-first, S3 dormant)
4. Confirm batch size (20) and rationale match implementations in `services/process.ts`
5. Check that optimization technique descriptions match actual usage in `services/ocr.ts`, `services/s3.ts`, and `pkg/`
6. Suggest improvements for clarity, conciseness, and technical accuracy without introducing speculative features
<!-- LLM-REFINE-END -->
