import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export function randomTokenId(): string {
  return randomUUID();
}

export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeSecretEqual(left: string | undefined, right: string): boolean {
  if (!left) {
    return false;
  }

  const candidate = Buffer.from(left);
  const expected = Buffer.from(right);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
