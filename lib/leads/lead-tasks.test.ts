import { describe, expect, it } from "vitest";

import { escolherTarefaMaisProxima, estaAtrasada } from "./lead-tasks";

describe("escolherTarefaMaisProxima", () => {
  it("null quando não há tarefas", () => {
    expect(escolherTarefaMaisProxima([])).toBeNull();
  });

  it("null quando só há feitas/descartadas — não sobra o que mostrar", () => {
    const tarefas = [
      { due_at: "2026-01-01T00:00:00Z", status: "done" },
      { due_at: "2026-01-02T00:00:00Z", status: "dismissed" },
    ];
    expect(escolherTarefaMaisProxima(tarefas)).toBeNull();
  });

  it("escolhe a pendente de prazo mais próximo, ignorando as decididas", () => {
    const maisProxima = { due_at: "2026-01-01T00:00:00Z", status: "pending", id: "a" };
    const tarefas = [
      { due_at: "2026-01-05T00:00:00Z", status: "pending", id: "b" },
      maisProxima,
      { due_at: "2026-01-01T00:00:00Z", status: "done", id: "c" },
    ];
    expect(escolherTarefaMaisProxima(tarefas)).toBe(maisProxima);
  });
});

describe("estaAtrasada", () => {
  const agora = new Date("2026-06-15T12:00:00Z");

  it("pendente com prazo no passado é atrasada", () => {
    expect(estaAtrasada({ status: "pending", due_at: "2026-06-14T00:00:00Z" }, agora)).toBe(true);
  });

  it("pendente com prazo no futuro não é atrasada", () => {
    expect(estaAtrasada({ status: "pending", due_at: "2026-06-16T00:00:00Z" }, agora)).toBe(false);
  });

  it("feita/descartada nunca é atrasada, mesmo com prazo vencido", () => {
    expect(estaAtrasada({ status: "done", due_at: "2026-01-01T00:00:00Z" }, agora)).toBe(false);
    expect(estaAtrasada({ status: "dismissed", due_at: "2026-01-01T00:00:00Z" }, agora)).toBe(false);
  });
});
