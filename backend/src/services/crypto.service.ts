import crypto from "crypto";
import fs from "fs";
import { pipeline } from "stream/promises";
import { Readable, Writable } from "stream";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

function getEncryptionKey(): Buffer {
  const hexKey = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!hexKey || hexKey.length !== 64) {
    throw new Error("DOCUMENT_ENCRYPTION_KEY must be a valid 64-character hex string (32 bytes).");
  }
  return Buffer.from(hexKey, "hex");
}

export interface EncryptedStreamResult {
  ivHex: string;
  authTagHex: string;
}

export class CryptoService {
  static async encryptFileStream(
    inputStream: Readable,
    outputPath: string
  ): Promise<EncryptedStreamResult> {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const outputStream = fs.createWriteStream(outputPath);

    await pipeline(inputStream, cipher, outputStream);

    const authTag = cipher.getAuthTag();

    return {
      ivHex: iv.toString("hex"),
      authTagHex: authTag.toString("hex"),
    };
  }

  static async decryptFileStream(
    encryptedFilePath: string,
    ivHex: string,
    authTagHex: string,
    outputStream: Writable
  ): Promise<void> {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const readStream = fs.createReadStream(encryptedFilePath);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    await pipeline(readStream, decipher, outputStream);
  }
}
