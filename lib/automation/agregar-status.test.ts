import { describe, expect, it } from "vitest";
import { agregarStatusDoRun } from "./agregar-status";
import type { ActionResultDetail } from "./types";

const r = (status: ActionResultDetail["status"]): ActionResultDetail => ({ type: "add_tag", status });

describe("agregarStatusDoRun", () => {
  it("tudo success → success", () => {
    expect(agregarStatusDoRun([r("success"), r("success")])).toBe("success");
  });

  it("tudo failed → failed", () => {
    expect(agregarStatusDoRun([r("failed"), r("failed")])).toBe("failed");
  });

  it("uma failed, uma success → partial", () => {
    expect(agregarStatusDoRun([r("failed"), r("success")])).toBe("partial");
  });

  it("skipped conta como não-enviada — junto com failed, nunca vira success sozinho", () => {
    expect(agregarStatusDoRun([r("skipped")])).toBe("failed");
    expect(agregarStatusDoRun([r("skipped"), r("success")])).toBe("partial");
  });

  it("só postponed (sem falha) → adiado", () => {
    expect(agregarStatusDoRun([r("postponed"), r("success")])).toBe("adiado");
  });

  it("falha vence adiamento — uma falhou e outra ficou esperando é partial, não adiado", () => {
    expect(agregarStatusDoRun([r("failed"), r("postponed")])).toBe("partial");
  });

  it("lista vazia → success (nada pra reportar como errado)", () => {
    expect(agregarStatusDoRun([])).toBe("success");
  });
});
