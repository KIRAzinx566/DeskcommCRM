"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type NodeTypes,
  type OnBeforeDelete,
  type OnNodesDelete,
  type OnEdgesDelete,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  toReactFlow,
  fromReactFlow,
  graphsEqual,
  toFlowNode,
  type RFNode,
  type RFEdge,
  type RFNodeData,
} from "@/lib/followup/graph-mappers";
import { conditionLabel } from "@/lib/followup/edge-condition-options";
import {
  branchIdForCondition,
  conditionForBranch,
  nodeBranches,
  type FlowEdge,
  type FlowGraph,
  type NodeType,
} from "@/lib/followup/graph-schema";
import { rotuloDoRamo } from "@/lib/followup/rotulo-do-ramo";
import { useFollowupFlow, type FollowupFlowDetailRow } from "@/hooks/followup/useFollowupFlow";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { EdgeConfigPanel } from "./EdgeConfigPanel";
import { NodePalette } from "./NodePalette";
import { PublishBar } from "./PublishBar";
import { NODE_VISUALS } from "./nodes/nodeVisuals";
import { TriggerNode } from "./nodes/TriggerNode";
import { WaitNode } from "./nodes/WaitNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { ClassifyNode } from "./nodes/ClassifyNode";
import { ActionNode } from "./nodes/ActionNode";
import { EndNode } from "./nodes/EndNode";

const EMPTY_GRAPH: FlowGraph = { nodes: [], edges: [] };
const DND_MIME = "application/x-followup-node-type";

// Defined outside the component — React Flow warns (and re-mounts nodes) if
// nodeTypes is a fresh object every render.
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  wait: WaitNode,
  condition: ConditionNode,
  ai_classify: ClassifyNode,
  action: ActionNode,
  end: EndNode,
};

interface Props {
  flowId: string;
  initialData: FollowupFlowDetailRow;
}

function FlowCanvasInner({ flowId, initialData }: Props) {
  const { data: flow } = useFollowupFlow(flowId, { initialData });
  // `initial` seeds React Flow state ONCE on mount — it must NOT react to
  // `flow` changing on every refetch (that would clobber in-progress edits).
  const initial = useMemo(
    () => toReactFlow(initialData.draft_graph ?? EMPTY_GRAPH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(initial.edges);
  const [savedGraph, setSavedGraph] = useState<FlowGraph>(initialData.draft_graph ?? EMPTY_GRAPH);
  const nextId = useRef(1);
  const nextEdgeId = useRef(1);
  const { screenToFlowPosition } = useReactFlow();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const liveGraph = useMemo(() => fromReactFlow(nodes, edges), [nodes, edges]);
  const dirty = useMemo(() => !graphsEqual(liveGraph, savedGraph), [liveGraph, savedGraph]);

  const markNodeErrors = useCallback(
    (errorsByNode: Record<string, string[]>) => {
      setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, errors: errorsByNode[n.id] } })));
    },
    [setNodes],
  );
  const clearNodeErrors = useCallback(() => {
    setNodes((nds) => nds.map((n) => (n.data.errors ? { ...n, data: { ...n.data, errors: undefined } } : n)));
  }, [setNodes]);

  // Node and edge selection are mutually exclusive — opening one panel closes the other's.
  const onNodeClick = useCallback<NodeMouseHandler<RFNode>>((_, node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);
  const onEdgeClick = useCallback<EdgeMouseHandler<RFEdge>>((_, edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  // O nó de gatilho é o único ponto de entrada do fluxo — apagá-lo deixaria o
  // grafo sem disparo, e não há como o publish detectar isso depois (o schema
  // não exige exatamente um trigger, só que ele exista quando presente).
  // `onBeforeDelete` veta tanto a tecla quanto qualquer outra via de deleção do
  // React Flow; o botão explícito nos painéis abaixo já nem se oferece pra ele.
  const onBeforeDelete = useCallback<OnBeforeDelete<RFNode, RFEdge>>(async ({ nodes: toDelete }) => {
    if (toDelete.some((n) => n.type === "trigger")) {
      toast.error("O nó de Início não pode ser apagado — é o disparo do fluxo.");
      return false;
    }
    return true;
  }, []);

  // A tecla Delete/Backspace apaga por dentro do React Flow (via
  // deleteKeyCode), sem passar pelos handlers de apagar abaixo — então o
  // painel lateral do nó/aresta removido precisa fechar sozinho aqui.
  const onNodesDelete = useCallback<OnNodesDelete<RFNode>>(
    (deleted) => {
      if (deleted.some((n) => n.id === selectedNodeId)) setSelectedNodeId(null);
    },
    [selectedNodeId],
  );
  const onEdgesDelete = useCallback<OnEdgesDelete<RFEdge>>(
    (deleted) => {
      if (deleted.some((e) => e.id === selectedEdgeId)) setSelectedEdgeId(null);
    },
    [selectedEdgeId],
  );

  // Caminho do botão "Apagar" nos painéis — mesma proteção do trigger que o
  // atalho de teclado tem, pra quem nunca ia adivinhar a tecla.
  const deleteNode = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (node?.type === "trigger") {
        toast.error("O nó de Início não pode ser apagado — é o disparo do fluxo.");
        return;
      }
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedNodeId(null);
    },
    [nodes, setNodes, setEdges],
  );
  const deleteEdge = useCallback(
    (id: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== id));
      setSelectedEdgeId(null);
    },
    [setEdges],
  );

  const updateNodeData = useCallback(
    (id: string, patch: Partial<RFNodeData>) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes],
  );
  const updateEdgeCondition = useCallback(
    (id: string, condition: FlowEdge["condition"]) => {
      setEdges((eds) =>
        eds.map((e) => (e.id === id ? { ...e, data: { priority: e.data?.priority ?? 0, condition } } : e)),
      );
    },
    [setEdges],
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;
  const selectedEdgeSource = selectedEdge ? (nodes.find((n) => n.id === selectedEdge.source) ?? null) : null;
  const selectedEdgeTarget = selectedEdge ? (nodes.find((n) => n.id === selectedEdge.target) ?? null) : null;

  // Wire label: derived at render time from `data.condition`, never persisted on the edge
  // itself — `condition` alone stays the source of truth the mapper round-trips.
  // Num nó que ramifica o texto vem do RAMO (o rótulo que o usuário leu na
  // bolinha de onde arrastou), não da condição crua: `conditionLabel` sozinho
  // mostraria o id do ramo, que não é palavra nenhuma para quem não programa.
  const edgesForRender = useMemo(
    () =>
      edges.map((e) => {
        const condition = e.data?.condition ?? { type: "always" as const };
        const source = nodes.find((n) => n.id === e.source);
        const branch = source
          ? nodeBranches(toFlowNode(source)).find(
              (b) => b.id === branchIdForCondition(toFlowNode(source), condition),
            )
          : undefined;
        return {
          ...e,
          label: branch ? rotuloDoRamo(branch) : conditionLabel(condition),
          selected: e.id === selectedEdgeId,
        };
      }),
    [edges, nodes, selectedEdgeId],
  );

  // Quais saídas do nó selecionado já têm aresta. Quem sabe isso é o canvas —
  // o formulário não vê o grafo, e sem esse dado ele trocaria o modo do nó
  // deixando ligações órfãs sem conseguir dizer quantas.
  const ramosLigadosDoSelecionado = useMemo(() => {
    if (!selectedNode) return [];
    const source = toFlowNode(selectedNode);
    return edges
      .filter((e) => e.source === selectedNode.id)
      .map((e) => branchIdForCondition(source, e.data?.condition ?? { type: "always" }))
      .filter((id): id is string => id !== null);
  }, [selectedNode, edges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      // A bolinha de onde o usuário arrastou É a saída escolhida: o React Flow
      // devolve o id do ramo em `sourceHandle`. Antes a aresta nascia sempre
      // `always` e o usuário tinha que ir ao painel dizer de novo, de qual regra
      // ela saía — o que, com uma bolinha só, era impossível de expressar.
      const source = nodes.find((n) => n.id === connection.source);
      const fromBranch =
        source && connection.sourceHandle
          ? conditionForBranch(toFlowNode(source), connection.sourceHandle)
          : null;
      const newEdge: RFEdge = {
        id: `edge-${nextEdgeId.current++}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        data: { priority: 0, condition: fromBranch ?? { type: "always" } },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges, nodes],
  );

  const addNodeAt = useCallback(
    (type: NodeType, position: { x: number; y: number }) => {
      const visual = NODE_VISUALS[type];
      const id = `${type}-${nextId.current++}`;
      const newNode: RFNode = {
        id,
        type,
        position,
        data: { label: visual.defaultLabel, config: visual.defaultConfig() },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes],
  );

  const onPaletteAdd = useCallback(
    (type: NodeType) => {
      const index = nodes.length;
      addNodeAt(type, { x: 80 + (index % 4) * 220, y: 80 + Math.floor(index / 4) * 150 });
    },
    [nodes.length, addNodeAt],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DND_MIME) as NodeType | "";
      if (!type) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeAt(type, position);
    },
    [screenToFlowPosition, addNodeAt],
  );

  return (
    <div className="flex h-full min-h-[600px] w-full flex-col">
      {flow && (
        <PublishBar
          flowId={flowId}
          flow={flow}
          graph={liveGraph}
          dirty={dirty}
          onSaved={setSavedGraph}
          onPublishErrors={markNodeErrors}
          onPublishSuccess={clearNodeErrors}
        />
      )}
      <div className="flex flex-1 overflow-hidden">
        <NodePalette onAdd={onPaletteAdd} />
        <div className="relative h-full flex-1" data-testid="flow-canvas" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edgesForRender}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onBeforeDelete={onBeforeDelete}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {selectedNode && (
          // Docked panel, NOT a modal overlay — the canvas stays fully clickable
          // so switching node selection (or dragging edges) works while it's open.
          <aside
            className="h-full w-96 shrink-0 overflow-y-auto border-l border-border bg-surface p-4"
            data-testid="node-config-sheet"
          >
            <NodeConfigPanel
              key={selectedNode.id}
              node={selectedNode}
              onChange={(patch) => updateNodeData(selectedNode.id, patch)}
              ramosLigados={ramosLigadosDoSelecionado}
              onDelete={() => deleteNode(selectedNode.id)}
            />
          </aside>
        )}

        {selectedEdge && (
          <aside
            className="h-full w-96 shrink-0 overflow-y-auto border-l border-border bg-surface p-4"
            data-testid="edge-config-sheet"
          >
            <EdgeConfigPanel
              key={selectedEdge.id}
              sourceNode={selectedEdgeSource ? toFlowNode(selectedEdgeSource) : undefined}
              targetNode={selectedEdgeTarget ? toFlowNode(selectedEdgeTarget) : undefined}
              condition={selectedEdge.data?.condition ?? { type: "always" }}
              onChange={(condition) => updateEdgeCondition(selectedEdge.id, condition)}
              onDelete={() => deleteEdge(selectedEdge.id)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

export function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
