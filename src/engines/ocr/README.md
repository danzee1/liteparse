# src/engines/ocr/

OCR engines for extracting text from images.

## Files

### interface.ts
**Defines the OcrEngine contract.**

```typescript
interface OcrEngine {
  name: string;
  recognize(image: string | Buffer, options: OcrOptions): Promise<OcrResult[]>;
  recognizeBatch(images: (string | Buffer)[], options: OcrOptions): Promise<OcrResult[][]>;
}

interface OcrOptions {
  language: string | string[];
  correctRotation?: boolean;
}

interface OcrResult {
  text: string;
  bbox: [number, number, number, number];  // [x1, y1, x2, y2]
  confidence: number;  // 0-1 scale
}
```

---

### tesseract.ts
**In-process OCR using Tesseract.js - zero setup required.**

This is the default OCR engine when no `ocrServerUrl` is configured.

**Key Features:**
- Worker-based processing (runs in background thread)
- Accepts file paths or `Buffer` input directly (no temp files needed)
- Language caching (reuses worker for same language)
- Automatic language code normalization (e.g., `en` → `eng`)
- Low-confidence filtering (removes results < 30%)
- Supports offline usage via `TESSDATA_PREFIX` env var or `tessdataPath` config for pre-downloaded `.traineddata` files

**Language Normalization:**
Maps common ISO 639-1 codes to Tesseract's 3-letter codes:
- `en` → `eng`, `fr` → `fra`, `de` → `deu`, `es` → `spa`
- `zh` → `chi_sim`, `zh-tw` → `chi_tra`, `ja` → `jpn`, `ko` → `kor`
- Unknown codes passed through as-is

**Lifecycle:**
- `initialize(language)` - Create/recreate worker for language
- `recognize(image, options)` - OCR single image (accepts file path or Buffer)
- `recognizeBatch(images, options)` - OCR multiple images sequentially
- `terminate()` - Clean up worker (called by LiteParse after parsing)

**Design Decisions:**
- **30% confidence threshold**: Filters noisy OCR results (tesseract.ts:59)
- **Worker caching**: Avoids expensive reinitialization when language unchanged
- **Sequential batch processing**: Tesseract.js workers aren't parallelizable

---

### http-simple.ts
**HTTP client for external OCR servers.**

Used when `ocrServerUrl` is configured. Allows using more powerful OCR backends (EasyOCR, PaddleOCR, etc.) running as separate services.

**API Specification:**
Servers must conform to `OCR_API_SPEC.md`:
- **Endpoint**: POST to configured URL
- **Request**: `multipart/form-data` with `file` (image) and `language` fields
- **Response**: `{ results: [{ text, bbox: [x1,y1,x2,y2], confidence }] }`

**Features:**
- 60-second timeout per request
- Graceful error handling (returns empty array on failure)
- Detailed error logging for debugging

**Design Decision:**
Simple sequential processing rather than batching because:
1. External servers may have their own batching/queuing
2. Keeps the API simple and predictable
3. Allows per-image error handling

**Example Servers:**
See `ocr/easyocr/` and `ocr/paddleocr/` for reference implementations.
