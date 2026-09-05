/**
 * Cliente fino da API da ASAAS (gateway de pagamento — boleto, Pix, cartão).
 *
 * ⚠️ FACHADA FINA, sem regra de negócio: quem decide SE uma cobrança pode ser
 * criada/cancelada é `app/api/v1/billing/charges/_handler.ts`. Este arquivo só
 * sabe falar com a API remota e traduzir a resposta dela.
 *
 * Doc: https://docs.asaas.com/reference. Auth por header `access_token` (a
 * chave da conta, não OAuth) — nunca logado, nunca persistido em texto puro
 * (quem guarda a chave é `lib/billing/credenciais/guardar.ts`, cifrada).
 *
 * Nenhuma função aqui toca dado de cartão: cartão é resolvido pelo
 * `invoiceUrl` — um link de checkout HOSPEDADO pela própria ASAAS.
 * DeskcommCRM nunca recebe nem armazena um PAN.
 *
 * Nomes de campo CONFIRMADOS contra chamadas reais de sandbox em 2026-09-04
 * (customer search/create, payment PIX/boleto, pixQrCode, identificationField,
 * cancelamento e um webhook real capturado via webhook.site) — não são só a
 * documentação pública da v3. Duas correções que só a chamada real revelou:
 * `/myAccount` não tem campo `id` (`ContaAsaas` usa `cpfCnpj`), e o boleto
 * precisa de um segundo endpoint (`identificationField`) pra linha digitável,
 * que a v1 desta implementação não buscava.
 */
import { ApiError } from "@/lib/api/types";

export type AsaasEnvironment = "sandbox" | "production";
export type AsaasMethod = "boleto" | "pix" | "cartao";

const BASE_URL: Record<AsaasEnvironment, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};

/** O `billingType` que a ASAAS espera, vocabulário deles — nunca vaza pra fora deste arquivo. */
const BILLING_TYPE: Record<AsaasMethod, string> = {
  boleto: "BOLETO",
  pix: "PIX",
  cartao: "CREDIT_CARD",
};

export interface CredencialAsaas {
  apiKey: string;
  environment: AsaasEnvironment;
}

interface AsaasErroBody {
  errors?: { code?: string; description?: string }[];
}

/**
 * Chamada crua contra a API. Erro de rede e erro HTTP viram `ApiError`
 * (nunca a exceção do `fetch` sobe crua) — quem chama (o `_handler.ts`)
 * decide se isso vira recusa de negócio ou 500.
 *
 * ⚠️ UMA retentativa, e SÓ pra leitura (GET, sem `init.method` ou `"GET"`).
 * Medido nesta implementação: a conexão com a sandbox da ASAAS engasga de vez
 * em quando (timeout de conexão do undici, ~10s) e passa limpo na tentativa
 * seguinte, sem padrão nenhum de causa — rede, não lógica. Escrita (POST
 * `/payments`, `/customers`; DELETE de cancelamento) NUNCA retenta aqui: a
 * ASAAS não documenta chave de idempotência nessas rotas, e reenviar um POST
 * que na verdade chegou lá (só a RESPOSTA que se perdeu) arriscaria criar a
 * cobrança em dobro — pior que devolver `asaas_indisponivel` e deixar quem
 * chamou (humano ou agente) decidir tentar de novo conscientemente.
 */
async function chamar<T>(
  credencial: CredencialAsaas,
  path: string,
  requestId: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${BASE_URL[credencial.environment]}${path}`;
  const podeRetentar = (init?.method ?? "GET") === "GET";
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        access_token: credencial.apiKey,
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    if (podeRetentar) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        res = await fetch(url, {
          ...init,
          headers: {
            "content-type": "application/json",
            access_token: credencial.apiKey,
            ...(init?.headers ?? {}),
          },
        });
      } catch (err2) {
        throw new ApiError(
          502,
          "asaas_indisponivel",
          undefined,
          requestId,
          err2 instanceof Error ? err2.message : "Não foi possível falar com a ASAAS.",
        );
      }
    } else {
      throw new ApiError(
        502,
        "asaas_indisponivel",
        undefined,
        requestId,
        err instanceof Error ? err.message : "Não foi possível falar com a ASAAS.",
      );
    }
  }

  const bodyText = await res.text();
  let body: unknown = null;
  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      // corpo não-JSON — segue com null, o status já diz o suficiente.
    }
  }

  if (!res.ok) {
    const erro = body as AsaasErroBody | null;
    const mensagem = erro?.errors?.[0]?.description ?? `A ASAAS recusou (HTTP ${res.status}).`;
    // 401/403 da ASAAS = chave inválida/revogada — vocabulário próprio pro
    // chamador saber que é problema de CREDENCIAL, não de negócio.
    const code = res.status === 401 || res.status === 403 ? "asaas_credencial_invalida" : "asaas_recusou";
    throw new ApiError(res.status === 401 || res.status === 403 ? 401 : 422, code, undefined, requestId, mensagem);
  }

  return body as T;
}

/**
 * Confirmado contra a API real de sandbox (2026-09-04): `/myAccount` NÃO tem
 * campo `id` — a suposição original (`{id, name, email}`) estava errada.
 * `cpfCnpj` é o identificador mais estável que a resposta de fato traz, e é
 * o que aparece pra confirmar "conectado à conta certa" na tela.
 */
export interface ContaAsaas {
  name: string;
  cpfCnpj: string;
  email: string;
}

/** O round-trip "quem sou eu" — usado só para VALIDAR a chave no cadastro. */
export async function validarConta(credencial: CredencialAsaas, requestId: string): Promise<ContaAsaas> {
  return chamar<ContaAsaas>(credencial, "/myAccount", requestId);
}

export interface DadosCliente {
  /** Nosso `contact_id` — é por ele que buscamos o cliente ASAAS já existente, nunca recriamos. */
  externalReference: string;
  nome: string;
  cpfCnpj: string;
  email?: string;
  telefone?: string;
}

interface AsaasClienteListagem {
  data: { id: string }[];
}

interface AsaasCliente {
  id: string;
}

/**
 * Acha o "customer" ASAAS deste contato pelo `externalReference` (nosso
 * `contact_id`), ou cria um novo. NUNCA cria duplicado: a ASAAS já resolve
 * "é o mesmo cliente" por nós, então não precisamos de uma tabela de mapa
 * própria — DIRC letra I, integrar em vez de duplicar.
 */
export async function resolverClienteAsaas(
  credencial: CredencialAsaas,
  dados: DadosCliente,
  requestId: string,
): Promise<string> {
  const existentes = await chamar<AsaasClienteListagem>(
    credencial,
    `/customers?externalReference=${encodeURIComponent(dados.externalReference)}`,
    requestId,
  );
  const encontrado = existentes.data[0];
  if (encontrado) return encontrado.id;

  const criado = await chamar<AsaasCliente>(credencial, "/customers", requestId, {
    method: "POST",
    body: JSON.stringify({
      name: dados.nome,
      cpfCnpj: dados.cpfCnpj,
      email: dados.email,
      mobilePhone: dados.telefone,
      externalReference: dados.externalReference,
    }),
  });
  return criado.id;
}

export interface PedidoDeCobranca {
  asaasCustomerId: string;
  method: AsaasMethod;
  amountCents: number;
  /** ISO `YYYY-MM-DD`. */
  dueDate: string;
  description?: string;
  /** Nosso `billing_charges.id` — carimbado de volta pelo webhook em `payment.externalReference`. */
  externalReference: string;
}

export interface CobrancaAsaas {
  id: string;
  status: string;
  invoiceUrl: string;
  bankSlipUrl: string | null;
}

export async function criarCobranca(
  credencial: CredencialAsaas,
  pedido: PedidoDeCobranca,
  requestId: string,
): Promise<CobrancaAsaas> {
  return chamar<CobrancaAsaas>(credencial, "/payments", requestId, {
    method: "POST",
    body: JSON.stringify({
      customer: pedido.asaasCustomerId,
      billingType: BILLING_TYPE[pedido.method],
      value: pedido.amountCents / 100,
      dueDate: pedido.dueDate,
      description: pedido.description,
      externalReference: pedido.externalReference,
    }),
  });
}

export interface PixQrCode {
  encodedImage: string;
  payload: string;
}

/** Só chamado pra método `pix` — o QR/copia-e-cola não vem no objeto de criação. */
export async function buscarPixQrCode(
  credencial: CredencialAsaas,
  externalId: string,
  requestId: string,
): Promise<PixQrCode> {
  return chamar<PixQrCode>(credencial, `/payments/${externalId}/pixQrCode`, requestId);
}

export interface LinhaDigitavelBoleto {
  identificationField: string;
  barCode: string;
}

/**
 * Só chamado pra método `boleto` — a "linha digitável" (o que a gente guarda
 * em `boleto_barcode`) não vem no objeto de criação, é um endpoint à parte.
 * Confirmado contra a API real de sandbox (2026-09-04): o campo certo pra
 * copiar-e-colar é `identificationField`, não `barCode` (esse é o código de
 * barras cru, formato diferente do que aparece no boleto pra digitar).
 */
export async function buscarLinhaDigitavelBoleto(
  credencial: CredencialAsaas,
  externalId: string,
  requestId: string,
): Promise<LinhaDigitavelBoleto> {
  return chamar<LinhaDigitavelBoleto>(credencial, `/payments/${externalId}/identificationField`, requestId);
}

export async function consultarCobranca(
  credencial: CredencialAsaas,
  externalId: string,
  requestId: string,
): Promise<CobrancaAsaas & { status: string }> {
  return chamar<CobrancaAsaas & { status: string }>(credencial, `/payments/${externalId}`, requestId);
}

/** A ASAAS usa DELETE para cancelar uma cobrança — vocabulário deles, não nosso. */
export async function cancelarCobranca(
  credencial: CredencialAsaas,
  externalId: string,
  requestId: string,
): Promise<void> {
  await chamar<unknown>(credencial, `/payments/${externalId}`, requestId, { method: "DELETE" });
}
