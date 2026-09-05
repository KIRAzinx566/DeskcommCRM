import { describe, expect, it, vi } from "vitest";

import { bufToBytea, byteaToBuffer, decryptKey, encryptKey } from "./aes_gcm";

// `@/lib/env` computa `env` UMA vez, no import — `beforeAll` roda tarde demais
// pra mudar `process.env` (o módulo já leu). Molde de
// `app/api/v1/health/route.test.ts`: mocka `env` direto, com duas chaves
// DISTINTAS (nunca a mesma para os dois domínios, senão o teste de separação
// não prova nada).
vi.mock("@/lib/env", () => ({
  env: {
    AI_CRED_AES_KEY: "GsqN1TlgU20IQpOfdkaiNEt1S4QkalBkb0aLevgmEws=",
    BILLING_CRED_AES_KEY: "MRfAvFFMQfht+bkYErLTPG0evelTlMgxjdL8a5+GyX8=",
  },
}));

describe("aes_gcm — segredo por tenant", () => {
  it("round-trip com a chave padrão (AI_CRED_AES_KEY)", () => {
    const encrypted = encryptKey("minha-chave-secreta-123");
    const decrypted = decryptKey(encrypted);
    expect(decrypted).toBe("minha-chave-secreta-123");
  });

  it("round-trip com uma chave alternativa (BILLING_CRED_AES_KEY)", () => {
    const encrypted = encryptKey("$aact_hml_asaas_key", "BILLING_CRED_AES_KEY");
    const decrypted = decryptKey(encrypted, "BILLING_CRED_AES_KEY");
    expect(decrypted).toBe("$aact_hml_asaas_key");
  });

  it("as duas chaves não se misturam: cifrado com uma não decifra com a outra", () => {
    const encrypted = encryptKey("segredo-de-ia", "AI_CRED_AES_KEY");
    expect(() => decryptKey(encrypted, "BILLING_CRED_AES_KEY")).toThrow();
  });

  it("bufToBytea/byteaToBuffer são inversos", () => {
    const encrypted = encryptKey("outra-chave", "BILLING_CRED_AES_KEY");
    const hex = bufToBytea(encrypted.ciphertext);
    expect(byteaToBuffer(hex)).toEqual(encrypted.ciphertext);
  });

  it("last4 é sempre os últimos 4 caracteres do plaintext", () => {
    const encrypted = encryptKey("abcXYZ7890");
    expect(encrypted.last4).toBe("7890");
  });
});
