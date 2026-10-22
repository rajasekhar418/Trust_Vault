import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { Request, Response, NextFunction } from "express";

const storage = multer.memoryStorage();
const uploadLimit = parseInt(process.env.MAX_FILE_SIZE_BYTES || "15728640", 10);

export const uploadMemory = multer({
  storage,
  limits: { fileSize: uploadLimit, files: 1 }
});

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain"
]);

export async function validateUploadedFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: "File payload is required." });
    return;
  }

  const buffer = req.file.buffer;
  const detected = await fileTypeFromBuffer(buffer);

  let finalMime = req.file.mimetype;
  if (detected) {
    finalMime = detected.mime;
  } else if (req.file.mimetype !== "text/plain") {
    res.status(400).json({ error: "Security rejection: Unverified binary signature." });
    return;
  }

  if (!ALLOWED_MIME_TYPES.has(finalMime)) {
    res.status(400).json({ error: `Rejected: File type ${finalMime} is not permitted.` });
    return;
  }

  req.file.mimetype = finalMime;
  next();
}
