import { describe, expect, it } from 'vitest';

import { LAYOUT_PADRAO, normalizarLayout } from './layout';
import type { Personagem } from './personagens';
import { atividades, caminho, destino, JANELA_MS, lugaresDoLayout } from './rotina';

const agente = (id: string, extra: Partial<Personagem> = {}): Personagem => ({
  id: `agente:${id}`,
  nome: id,
  setor: 'comercial',
  mesa: [590, 140],
  cabelo: '#000',
  acessorio: 'headset',
  tarefa: 'Esperando cliente',
  trabalhando: false,
  pausado: false,
  ajuda: false,
  foraDoAr: false,
  rotina: true,
  ...extra,
});

const COPA = new Set(['cafe', 'agua', 'sofa', 'alongar', 'planta', 'pingpong']);
const LUGARES = lugaresDoLayout(LAYOUT_PADRAO);

describe('a rotina dos agentes no escritório', () => {
  it('trabalho e pedido de ajuda sempre puxam para a mesa — nunca café com trabalho esperando', () => {
    for (let janela = 0; janela < 50; janela++) {
      const a = atividades(
        [agente('bia', { trabalhando: true }), agente('leo', { ajuda: true }), agente('ana'), agente('re')],
        janela * JANELA_MS,
        LUGARES,
      );
      expect(a['agente:bia']).toBe('digitando');
      expect(a['agente:leo']).toBe('ajuda');
    }
  });

  it('pausado cochila; fora do ar descansa (os dois sentados na copa)', () => {
    const a = atividades([agente('bia', { pausado: true }), agente('leo', { foraDoAr: true, pausado: true })], 0, LUGARES);
    expect(a['agente:bia']).toBe('dormindo');
    expect(a['agente:leo']).toBe('descansando');
  });

  it('livre vive: ao longo do dia passa pela copa, e não fica sempre na mesma coisa', () => {
    const vistas = new Set<string>();
    for (let janela = 1; janela < 60; janela += 2) vistas.add(atividades([agente('bia')], janela * JANELA_MS, LUGARES)['agente:bia']!);
    expect(vistas.size).toBeGreaterThan(2);
    expect([...vistas].some((v) => COPA.has(v))).toBe(true);
  });

  it('é a mesma resposta para o canvas e o painel no mesmo instante (determinística)', () => {
    const todos = [agente('bia'), agente('leo'), agente('ana')];
    expect(atividades(todos, 123_456_789, LUGARES)).toEqual(atividades(todos, 123_456_789, LUGARES));
  });

  it('ping-pong só com dois livres — sozinho ninguém joga', () => {
    const janelaPar = 2 * JANELA_MS;
    const dois = atividades([agente('bia'), agente('leo')], janelaPar, LUGARES);
    expect(Object.values(dois).filter((v) => v === 'pingpong')).toHaveLength(2);
    expect(atividades([agente('bia')], janelaPar, LUGARES)['agente:bia']).not.toBe('pingpong');
  });

  it('móvel tirado do escritório tira a atividade: sem mesa de ping-pong, sem cafeteira, ninguém joga nem toma café', () => {
    const semJogoNemCafe = lugaresDoLayout({
      itens: LAYOUT_PADRAO.itens.filter((i) => i.tipo !== 'pingpong' && i.tipo !== 'cafeteira'),
    });
    for (let janela = 0; janela < 40; janela++) {
      const a = atividades([agente('bia'), agente('leo')], janela * JANELA_MS, semJogoNemCafe);
      expect(Object.values(a)).not.toContain('pingpong');
      expect(Object.values(a)).not.toContain('cafe');
    }
  });

  it('móvel arrastado leva a atividade junto: o café é onde a cafeteira está', () => {
    const movido = lugaresDoLayout({ itens: [{ id: 'c', tipo: 'cafeteira', x: 600, y: 100 }] });
    expect(destino(agente('bia'), 'cafe', 0, movido)).toEqual([622, 150]);
  });

  it('dados parados (Painel) não entram na rotina', () => {
    expect(atividades([agente('painel', { rotina: false })], 0, LUGARES)).toEqual({});
  });

  it('cochilar e descansar disputam os mesmos assentos; sem assento sobrando, fica de pé ao lado', () => {
    const assentos = LUGARES.assento;
    expect(destino(agente('a'), 'dormindo', 0, LUGARES)).toEqual(assentos[0]);
    expect(destino(agente('b'), 'descansando', 1, LUGARES)).toEqual(assentos[1]);
    const [x, y] = assentos[assentos.length - 1]!;
    expect(destino(agente('c'), 'sofa', assentos.length, LUGARES)).toEqual([x + 14, y + 18]);
  });

  it('da mesa para a copa: sai pela porta, anda no corredor, entra pela outra porta — sem atravessar parede', () => {
    expect(caminho([590, 166], [92, 132])).toEqual([
      [720, 258],
      [720, 283],
      [240, 283],
      [240, 258],
      [92, 132],
    ]);
    expect(caminho([92, 132], [124, 134])).toEqual([[124, 134]]);
  });

  it('de uma sala de cima para uma de baixo, troca de corredor por Operações', () => {
    expect(caminho([590, 166], [600, 520])).toEqual([
      [720, 258],
      [720, 283],
      [480, 283],
      [480, 415],
      [720, 415],
      [720, 446],
      [600, 520],
    ]);
  });

  it('layout salvo com lixo vira layout válido — nunca quebra a tela', () => {
    const l = normalizarLayout({ itens: [{ tipo: 'foguete', x: 1, y: 1 }, { tipo: 'puff', x: 'a' }], visual: { a1: { cabelo: 'vermelho' } } });
    expect(l.itens).toEqual([]);
    expect(l.visual.a1?.cabelo).toBeUndefined();
    expect(normalizarLayout(null)).toBe(LAYOUT_PADRAO);
  });
});
