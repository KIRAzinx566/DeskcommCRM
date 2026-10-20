/**
 * A regra que junta o canal direto (fork) e a resposta ao caso (upstream) no
 * número interno de avisos: o comando `RESPONDER`/`PERGUNTAR <caso>` vence
 * sempre; o resto vai ao canal direto quando ele está ligado e consegue
 * responder; fora disso, o ingestor segue para o caminho do upstream.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ehNumeroInternoDeAviso = vi.fn();
const lerConfigCanalDireto = vi.fn();
const criarEnviadorDoCanal = vi.fn();
const processarMensagemDoCanalDireto = vi.fn();

vi.mock("@/lib/escalacao/numero-interno-de-aviso", () => ({
  ehNumeroInternoDeAviso: (...a: unknown[]) => ehNumeroInternoDeAviso(...a),
}));
vi.mock("./config", () => ({ lerConfigCanalDireto: (...a: unknown[]) => lerConfigCanalDireto(...a) }));
vi.mock("./transporte", () => ({ criarEnviadorDoCanal: (...a: unknown[]) => criarEnviadorDoCanal(...a) }));
vi.mock("./entrada", () => ({
  processarMensagemDoCanalDireto: (...a: unknown[]) => processarMensagemDoCanalDireto(...a),
}));

import { entregarAoCanalDireto } from "./do-numero-interno";

const admin = {} as never;
const CASO = "11111111-2222-4333-8444-555555555555";

function entrada(texto: string | null, direction: "inbound" | "outbound" = "inbound") {
  return {
    organizationId: "org-1",
    channelSessionId: "sessao-1",
    identidade: { kind: "phone" as const, phone: "+5511999990000", lid: null },
    direction,
    texto,
    externalId: "msg-1",
  };
}

describe("entregarAoCanalDireto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ehNumeroInternoDeAviso.mockResolvedValue(true);
    lerConfigCanalDireto.mockResolvedValue({
      ligado: true,
      telefoneDestino: "+5511999990000",
      agenteId: "agente-1",
      selecionadoEm: null,
    });
    criarEnviadorDoCanal.mockResolvedValue(async () => true);
    processarMensagemDoCanalDireto.mockResolvedValue(undefined);
  });

  it("texto comum do número interno vai ao canal direto", async () => {
    await expect(entregarAoCanalDireto(admin, entrada("como estão as vendas?"))).resolves.toBe(true);
    expect(processarMensagemDoCanalDireto).toHaveBeenCalledOnce();
  });

  it("o comando do caso vence: segue para o caminho do upstream", async () => {
    await expect(entregarAoCanalDireto(admin, entrada(`RESPONDER ${CASO} pode liberar`))).resolves.toBe(false);
    expect(processarMensagemDoCanalDireto).not.toHaveBeenCalled();
  });

  it("canal direto desligado: não fica com a mensagem", async () => {
    lerConfigCanalDireto.mockResolvedValue({ ligado: false, telefoneDestino: "+5511999990000" });
    await expect(entregarAoCanalDireto(admin, entrada("oi"))).resolves.toBe(false);
  });

  it("sem como responder pelo canal: não fica com a mensagem", async () => {
    criarEnviadorDoCanal.mockResolvedValue(null);
    await expect(entregarAoCanalDireto(admin, entrada("oi"))).resolves.toBe(false);
    expect(processarMensagemDoCanalDireto).not.toHaveBeenCalled();
  });

  it("quem não é o número interno passa direto, sem ler a configuração", async () => {
    ehNumeroInternoDeAviso.mockResolvedValue(false);
    await expect(entregarAoCanalDireto(admin, entrada("oi"))).resolves.toBe(false);
    expect(lerConfigCanalDireto).not.toHaveBeenCalled();
  });

  it("mensagem de saída nunca entra no canal direto", async () => {
    await expect(entregarAoCanalDireto(admin, entrada("oi", "outbound"))).resolves.toBe(false);
    expect(ehNumeroInternoDeAviso).not.toHaveBeenCalled();
  });
});
