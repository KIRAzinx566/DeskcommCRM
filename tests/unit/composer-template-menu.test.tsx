import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { findExactShortcut, resolveSlash, TemplateMenu } from "@/components/inbox/composer/TemplateMenu";

describe("resolveSlash", () => {
  it("abre com / no início e captura o query", () => {
    expect(resolveSlash("/fech")).toEqual({ open: true, query: "fech" });
    expect(resolveSlash("/")).toEqual({ open: true, query: "" });
  });
  it("não abre se tem espaço ou não começa com /", () => {
    expect(resolveSlash("/fech agora").open).toBe(false);
    expect(resolveSlash("oi")).toEqual({ open: false, query: "" });
  });
});

describe("TemplateMenu", () => {
  const templates = [
    { id: "1", title: "Saudação", body: "Oi {{primeiro_nome}}", shortcut: "oi" },
    { id: "2", title: "Fechamento", body: "Fechado!", shortcut: "fech" },
  ];
  it("filtra por título/shortcut e devolve o escolhido", () => {
    const onPick = vi.fn();
    render(<TemplateMenu open query="fech" templates={templates as never} onPick={onPick} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Fechamento"));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "2" }));
  });
});

describe("findExactShortcut", () => {
  const templates = [
    { id: "1", title: "Saudação", body: "Oi {{primeiro_nome}}", shortcut: "oi" },
    { id: "2", title: "Fechamento", body: "Fechado!", shortcut: "fech" },
    { id: "3", title: "Sem atalho", body: "x", shortcut: null },
  ];

  it("atalho digitado por inteiro expande — mesmo case-insensitive", () => {
    expect(findExactShortcut("fech", templates as never)).toMatchObject({ id: "2" });
    expect(findExactShortcut("FECH", templates as never)).toMatchObject({ id: "2" });
  });

  it("atalho PARCIAL não expande — só o menu de busca continua filtrando", () => {
    // `/fe` é o começo de "fech", não o atalho inteiro — expandir aqui
    // trocaria o texto no meio da digitação, contra a vontade de quem
    // ainda está escrevendo o atalho.
    expect(findExactShortcut("fe", templates as never)).toBeNull();
    expect(findExactShortcut("fechado", templates as never)).toBeNull();
  });

  it("query vazia não expande — '/' sozinho é convite pro menu, não atalho de ninguém", () => {
    expect(findExactShortcut("", templates as never)).toBeNull();
  });

  it("template sem shortcut nunca é encontrado por texto vazio", () => {
    expect(findExactShortcut("", templates as never)).not.toMatchObject({ id: "3" });
  });
});
