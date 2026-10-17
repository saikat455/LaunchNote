import { createHash, randomBytes } from "node:crypto";

// 192 bits of randomness: impossible to guess
export function newInviteToken() {
  return randomBytes(24).toString("base64url");
}

// Only the hash is stored, so a database leak can't be used to join projects
export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}