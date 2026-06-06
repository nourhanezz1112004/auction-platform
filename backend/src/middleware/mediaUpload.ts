// backend/src/middleware/mediaUpload.ts
// Secure image upload: MIME validation, re-encode via sharp, S3 storage.
// Rejects files that lie about their extension, strips EXIF, enforces max size.

import { Request, Response, NextFunction } from "express";
import multer from "multer";
import sharp from "sharp";
import { fromBuffer } from "file-type";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const ALLOWED_MIME = new Set(["image/jpeg","image/png","image/webp"]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB raw input
const OUTPUT_MAX_PX = 2000;
const OUTPUT_QUALITY = 85;
const BUCKET = process.env.S3_BUCKET!;
const CDN_URL = process.env.CDN_URL ?? `https://${BUCKET}.s3.amazonaws.com`;

// Multer: memory storage (we re-encode before persisting)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES, files: 10 },
  fileFilter: (_req, file, cb) => {
    // Reject obvious non-images by declared MIME (real check happens after buffer read)
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    } else {
      cb(null, true);
    }
  },
});

// Re-encodes and uploads a single buffer to S3, returns the CDN URL
async function processAndUpload(buffer: Buffer, originalName: string): Promise<string> {
  // 1. Verify actual MIME type from magic bytes (ignores declared type)
  const fileType = await fromBuffer(buffer);
  if (!fileType || !ALLOWED_MIME.has(fileType.mime)) {
    throw new Error(`Rejected: actual file type is ${fileType?.mime ?? "unknown"}`);
  }

  // 2. Re-encode via sharp: strips EXIF, resizes, normalises format → WebP
  const processed = await sharp(buffer)
    .rotate()                           // auto-orient from EXIF before stripping
    .resize(OUTPUT_MAX_PX, OUTPUT_MAX_PX, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: OUTPUT_QUALITY })  // normalise to WebP
    .toBuffer();

  // 3. Content-addressed filename (SHA256 of processed bytes)
  const hash = crypto.createHash("sha256").update(processed).digest("hex").slice(0, 16);
  const key = `items/${hash}.webp`;

  // 4. Upload to S3
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: processed,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
    // No ACL needed if bucket policy grants public read
  }));

  return `${CDN_URL}/${key}`;
}

// ── Express middleware ─────────────────────────────────────────────────────────
export const uploadItemImages = [
  // Step 1: parse multipart with multer
  upload.array("images", 10),

  // Step 2: re-encode and upload each file
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No images provided" });
      return;
    }

    try {
      const urls = await Promise.all(
        files.map((f) => processAndUpload(f.buffer, f.originalname))
      );
      (req as any).uploadedImageUrls = urls;
      next();
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Image processing failed" });
    }
  },
];

// ── Error handler for multer errors ──────────────────────────────────────────
export function handleUploadError(err: any, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "File too large (max 10 MB per image)" });
      return;
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      res.status(400).json({ error: "Too many files (max 10 images)" });
      return;
    }
  }
  next(err);
}
