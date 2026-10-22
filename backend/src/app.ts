import express from "express";
import helmet from "helmet";
import cors from "cors";
import { login } from "./controllers/auth.controller.js";
import { uploadDocument, listDocuments } from "./controllers/document.controller.js";
import { authenticate } from "./middleware/auth.middleware.js";
import { uploadMemory, validateUploadedFile } from "./middleware/upload.middleware.js";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Public Health & Auth
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});
app.post("/api/auth/login", login);

// Authenticated Document Operations
app.get("/api/documents", authenticate, listDocuments);
app.post(
  "/api/documents",
  authenticate,
  uploadMemory.single("file"),
  validateUploadedFile,
  uploadDocument
);
