/**
 * AES-256-GCM helpers para segredo por tenant (`ai_provider_credentials`,
 * `billing_gateway_credentials`).
 *
 * Key source: uma env var de 32 bytes em base64 — `AI_CRED_AES_KEY` por
 * default, ou outra passada explicitamente em `keyEnvVar` (ex.:
 * `BILLING_CRED_AES_KEY` para segredo de gateway de pagamento). Chaves
 * SEPARADAS por domínio de propósito: vazamento de uma não deveria expor o
 * segredo do outro.
 *
 * Output do `encryptKey`: três `Buffer`s separados (ciphertext, IV de 12 bytes,
 * tag de 16 bytes) que são gravados como `bytea` na tabela. Pra uso via PostgREST
 * use o helper `bufToBytea()` que produz a literal `\x<hex>`.
 *
 * Plaintext NUNCA deve ser logado, persistido ou retornado em response — apenas
 * o `last4` é exposto via view `*_safe`.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
const TAG_LENGTH_BYTES = 16;

export type KeyEnvVar = "AI_CRED_AES_KEY" | "BILLING_CRED_AES_KEY";

const cachedKeys = new Map<KeyEnvVar, Buffer>();

function getKey(keyEnvVar: KeyEnvVar = "AI_CRED_AES_KEY"): Buffer {
  const cached = cachedKeys.get(keyEnvVar);
  if (cached) return cached;
  const raw = env[keyEnvVar];
  if (!raw) {
    throw new Error(
      `${keyEnvVar} não configurada. Defina em .env.local (32 bytes base64).`,
    );
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    throw new Error(`${keyEnvVar} inválida: base64 malformado.`);
  }
  if (buf.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `${keyEnvVar} deve ter exatamente 32 bytes (lido: ${buf.length}). Gere com: openssl rand -base64 32`,
    );
  }
  cachedKeys.set(keyEnvVar, buf);
  return buf;
}

export interface EncryptedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  /** Últimos 4 chars do plaintext, mostrados na UI pra identificação. */
  last4: string;
}

export function encryptKey(plaintext: string, keyEnvVar?: KeyEnvVar): EncryptedSecret {
  if (!plaintext || typeof plaintext !== "string") {
    throw new Error("plaintext inválido pra encryptKey()");
  }
  const key = getKey(keyEnvVar);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== TAG_LENGTH_BYTES) {
    throw new Error(`tag length inesperada: ${tag.length}`);
  }
  const last4 = plaintext.slice(-4);
  return { ciphertext, iv, tag, last4 };
}

export function decryptKey(
  input: {
    ciphertext: Buffer;
    iv: Buffer;
    tag: Buffer;
  },
  keyEnvVar?: KeyEnvVar,
): string {
  const { ciphertext, iv, tag } = input;
  const key = getKey(keyEnvVar);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Converte um Buffer em literal hex aceito pelo PostgREST pra colunas `bytea`.
 */
export function bufToBytea(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}

/**
 * Inverso de `bufToBytea`: aceita o que o PostgREST devolve em colunas bytea
 * (string `\xHEX` em modo padrão, ou Buffer/Uint8Array dependendo do driver).
 */
export function byteaToBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    return Buffer.from(hex, "hex");
  }
  throw new Error("byteaToBuffer: formato inesperado");
}
