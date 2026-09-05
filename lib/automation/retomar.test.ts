import { describe, expect, it } from "vitest";
import { decidirRetomada } from "./retomar";
import type { ActionResultDetail } from "./types";

const r = (status: ActionResultDetail["status"]): ActionResultDetail => ({ type: "add_tag", status });

describe("decidirRetomada", () => {
  it("recusa por rule_changed quando a contagem de ações da regra atual diverge do run", () => {
    const decisao = decidirRetomada(3, [r("failed"), r("success")]);
    expect(decisao).toEqual({ ok: false, codigo: "rule_changed" });
  });

  it("recusa por no_actions_to_resend quando nada é failed/skipped", () => {
    const decisao = decidirRetomada(2, [r("success"), r("postponed")]);
    expect(decisao).toEqual({ ok: false, codigo: "no_actions_to_resend" });
  });

  it("devolve só os índices failed/skipped — success e postponed ficam de fora", () => {
    const decisao = decidirRetomada(4, [r("success"), r("failed"), r("postponed"), r("skipped")]);
    expect(decisao).toEqual({ ok: true, indices: [1, 3] });
  });

  it("lista vazia (regra sem ações) não diverge de run vazio, mas não tem o que retomar", () => {
    expect(decidirRetomada(0, [])).toEqual({ ok: false, codigo: "no_actions_to_resend" });
  });
});
