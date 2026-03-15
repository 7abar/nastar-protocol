"use client";

import { useCallback, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  Handle,
  Position,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ─── Node Data Types ──────────────────────────────────────────────────────────

interface InputNodeData {
  label: string;
  source: string; // "marketplace" | "api" | "webhook"
}

interface LLMNodeData {
  label: string;
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
}

interface GuardNodeData {
  label: string;
  maxPerCall: number;
  dailyLimit: number;
  confirmAbove: number;
}

interface ToolNodeData {
  label: string;
  tool: string; // "celo-mcp" | "web-search" | "calculator"
  enabled: boolean;
}

interface OutputNodeData {
  label: string;
  format: string; // "text" | "json" | "markdown"
}

// ─── Node Styles ──────────────────────────────────────────────────────────────

const nodeBase = "rounded-xl border text-xs font-medium shadow-lg min-w-[180px]";

// ─── Input Node ───────────────────────────────────────────────────────────────

function InputNode({ data, selected }: { data: InputNodeData; selected: boolean }) {
  return (
    <div className={`${nodeBase} border-[#F4C430]/50 bg-[#F4C430]/10 ${selected ? "ring-1 ring-[#F4C430]" : ""}`}>
      <div className="px-4 py-2 border-b border-[#F4C430]/30 flex items-center gap-2">
        <span className="text-base">📥</span>
        <span className="text-[#F4C430] font-semibold text-sm">Task Input</span>
      </div>
      <div className="px-4 py-3">
        <div className="text-[#A1A1A1] text-[10px] uppercase tracking-wider mb-1">Source</div>
        <div className="text-white text-xs font-medium capitalize">{data.source || "Nastar Marketplace"}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-[#F4C430] !border-[#0A0A0A] !w-3 !h-3" />
    </div>
  );
}

// ─── LLM Node ─────────────────────────────────────────────────────────────────

function LLMNode({ data, selected }: { data: LLMNodeData; selected: boolean }) {
  const providerColor = data.provider === "openai" ? "text-green-400" : data.provider === "anthropic" ? "text-orange-400" : "text-blue-400";
  return (
    <div className={`${nodeBase} border-purple-400/50 bg-purple-400/10 ${selected ? "ring-1 ring-purple-400" : ""}`}>
      <Handle type="target" position={Position.Left} className="!bg-purple-400 !border-[#0A0A0A] !w-3 !h-3" />
      <div className="px-4 py-2 border-b border-purple-400/30 flex items-center gap-2">
        <span className="text-base">🧠</span>
        <span className="text-purple-400 font-semibold text-sm">LLM</span>
        <span className={`ml-auto text-[10px] font-bold uppercase ${providerColor}`}>{data.provider || "openai"}</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div>
          <div className="text-[#A1A1A1] text-[10px] uppercase tracking-wider mb-0.5">Model</div>
          <div className="text-white text-xs font-mono">{data.model || "gpt-4o-mini"}</div>
        </div>
        <div>
          <div className="text-[#A1A1A1] text-[10px] uppercase tracking-wider mb-0.5">System Prompt</div>
          <div className="text-[#A1A1A1] text-[10px] line-clamp-2 italic">
            {data.systemPrompt ? `"${data.systemPrompt.slice(0, 60)}..."` : "Not configured"}
          </div>
        </div>
        <div>
          <div className="text-[#A1A1A1] text-[10px] uppercase tracking-wider mb-0.5">API Key</div>
          <div className="text-white text-[10px] font-mono">
            {data.apiKey ? `${data.apiKey.slice(0, 8)}...` : "⚠ Not set"}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-purple-400 !border-[#0A0A0A] !w-3 !h-3" />
    </div>
  );
}

// ─── Guard Node ───────────────────────────────────────────────────────────────

function GuardNode({ data, selected }: { data: GuardNodeData; selected: boolean }) {
  return (
    <div className={`${nodeBase} border-red-400/50 bg-red-400/10 ${selected ? "ring-1 ring-red-400" : ""}`}>
      <Handle type="target" position={Position.Left} className="!bg-red-400 !border-[#0A0A0A] !w-3 !h-3" />
      <div className="px-4 py-2 border-b border-red-400/30 flex items-center gap-2">
        <span className="text-base">🛡️</span>
        <span className="text-red-400 font-semibold text-sm">Spend Guard</span>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        {[
          { label: "Max / call", value: `$${data.maxPerCall}` },
          { label: "Daily limit", value: `$${data.dailyLimit}` },
          { label: "Confirm above", value: `$${data.confirmAbove}` },
        ].map((row) => (
          <div key={row.label} className="flex justify-between items-center">
            <span className="text-[#A1A1A1] text-[10px]">{row.label}</span>
            <span className="text-white text-[10px] font-mono font-bold">{row.value}</span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-red-400 !border-[#0A0A0A] !w-3 !h-3" />
    </div>
  );
}

// ─── Tool Node ────────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { icon: string; color: string }> = {
  "celo-mcp": { icon: "⛓️", color: "text-yellow-400 border-yellow-400/50 bg-yellow-400/10 ring-yellow-400" },
  "web-search": { icon: "🔍", color: "text-blue-400 border-blue-400/50 bg-blue-400/10 ring-blue-400" },
  "calculator": { icon: "🔢", color: "text-green-400 border-green-400/50 bg-green-400/10 ring-green-400" },
};

function ToolNode({ data, selected }: { data: ToolNodeData; selected: boolean }) {
  const meta = TOOL_META[data.tool] || { icon: "🔧", color: "text-[#A1A1A1] border-white/20 bg-white/5 ring-white/30" };
  const [textColor, borderColor, bgColor, ringColor] = meta.color.split(" ");
  return (
    <div className={`${nodeBase} ${borderColor} ${bgColor} ${selected ? `ring-1 ${ringColor}` : ""} opacity-${data.enabled ? "100" : "50"}`}>
      <Handle type="target" position={Position.Left} className={`!border-[#0A0A0A] !w-3 !h-3`} style={{ background: data.enabled ? "#888" : "#444" }} />
      <div className={`px-4 py-2 border-b ${borderColor} flex items-center gap-2`}>
        <span className="text-base">{meta.icon}</span>
        <span className={`${textColor} font-semibold text-sm`}>{data.label}</span>
        {!data.enabled && <span className="ml-auto text-[10px] text-[#A1A1A1] px-1.5 py-0.5 rounded bg-white/10">off</span>}
      </div>
      <div className="px-4 py-2">
        <div className="text-[#A1A1A1] text-[10px]">{data.tool}</div>
      </div>
      <Handle type="source" position={Position.Right} className={`!border-[#0A0A0A] !w-3 !h-3`} style={{ background: data.enabled ? "#888" : "#444" }} />
    </div>
  );
}

// ─── Output Node ──────────────────────────────────────────────────────────────

function OutputNode({ data, selected }: { data: OutputNodeData; selected: boolean }) {
  return (
    <div className={`${nodeBase} border-green-400/50 bg-green-400/10 ${selected ? "ring-1 ring-green-400" : ""}`}>
      <Handle type="target" position={Position.Left} className="!bg-green-400 !border-[#0A0A0A] !w-3 !h-3" />
      <div className="px-4 py-2 border-b border-green-400/30 flex items-center gap-2">
        <span className="text-base">📤</span>
        <span className="text-green-400 font-semibold text-sm">Output</span>
      </div>
      <div className="px-4 py-3">
        <div className="text-[#A1A1A1] text-[10px] uppercase tracking-wider mb-0.5">Format</div>
        <div className="text-white text-xs font-mono">{data.format || "text"}</div>
      </div>
    </div>
  );
}

// ─── Node Types Registry ──────────────────────────────────────────────────────

const nodeTypes = {
  input_task: InputNode,
  llm: LLMNode,
  guard: GuardNode,
  tool: ToolNode,
  output: OutputNode,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface AgentFlowBuilderProps {
  config: {
    name: string;
    systemPrompt: string;
    llmProvider: string;
    llmModel: string;
    llmApiKey: string;
    maxPerCallUsd: string;
    dailyLimitUsd: string;
    requireConfirmAboveUsd: string;
    templateId: string;
  };
  onChange: (updates: Partial<AgentFlowBuilderProps["config"]>) => void;
}

// ─── Build initial nodes from config ──────────────────────────────────────────

function buildInitialNodes(config: AgentFlowBuilderProps["config"]): Node[] {
  const hasTools = ["research", "remittance", "fx-hedge", "trading"].includes(config.templateId);
  const toolLabel = config.templateId === "research" ? "Celo MCP"
    : config.templateId === "remittance" ? "Mento Swap"
    : config.templateId === "trading" ? "DEX Router"
    : "Web Search";
  const toolId = config.templateId === "research" ? "celo-mcp" : "web-search";

  const nodes: Node[] = [
    {
      id: "input",
      type: "input_task",
      position: { x: 40, y: hasTools ? 180 : 130 },
      data: { label: "Task Input", source: "Nastar Marketplace" },
    },
    {
      id: "guard",
      type: "guard",
      position: { x: 260, y: hasTools ? 60 : 50 },
      data: {
        label: "Spend Guard",
        maxPerCall: parseFloat(config.maxPerCallUsd) || 10,
        dailyLimit: parseFloat(config.dailyLimitUsd) || 50,
        confirmAbove: parseFloat(config.requireConfirmAboveUsd) || 25,
      },
    },
    {
      id: "llm",
      type: "llm",
      position: { x: 260, y: hasTools ? 280 : 160 },
      data: {
        label: "LLM",
        provider: config.llmProvider,
        model: config.llmModel,
        apiKey: config.llmApiKey,
        systemPrompt: config.systemPrompt,
      },
    },
    {
      id: "output",
      type: "output",
      position: { x: 500, y: hasTools ? 180 : 130 },
      data: { label: "Output", format: "text" },
    },
  ];

  if (hasTools) {
    nodes.push({
      id: "tool",
      type: "tool",
      position: { x: 260, y: 480 },
      data: { label: toolLabel, tool: toolId, enabled: true },
    });
  }

  return nodes;
}

function buildInitialEdges(templateId: string): Edge[] {
  const hasTools = ["research", "remittance", "fx-hedge", "trading"].includes(templateId);
  const edges: Edge[] = [
    { id: "e-input-guard", source: "input", target: "guard", animated: true, style: { stroke: "#F4C430", strokeWidth: 1.5 } },
    { id: "e-input-llm", source: "input", target: "llm", animated: true, style: { stroke: "#a855f7", strokeWidth: 1.5 } },
    { id: "e-llm-output", source: "llm", target: "output", animated: true, style: { stroke: "#4ade80", strokeWidth: 1.5 } },
  ];
  if (hasTools) {
    edges.push({ id: "e-input-tool", source: "input", target: "tool", animated: true, style: { stroke: "#facc15", strokeWidth: 1.5 } });
    edges.push({ id: "e-tool-llm", source: "tool", target: "llm", animated: false, style: { stroke: "#888", strokeWidth: 1, strokeDasharray: "4 2" } });
  }
  return edges;
}

// ─── Side Panel ───────────────────────────────────────────────────────────────

function SidePanel({ node, config, onChange, onClose }: {
  node: Node | null;
  config: AgentFlowBuilderProps["config"];
  onChange: AgentFlowBuilderProps["onChange"];
  onClose: () => void;
}) {
  if (!node) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-72 bg-[#111] border-l border-white/10 z-10 overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="font-semibold text-white text-sm">Configure Node</h3>
        <button onClick={onClose} className="text-[#A1A1A1] hover:text-white text-lg leading-none">×</button>
      </div>

      <div className="p-4 space-y-4">
        {node.type === "llm" && (
          <>
            <div>
              <label className="text-[#A1A1A1] text-xs uppercase tracking-wider block mb-1">Provider</label>
              <div className="grid grid-cols-3 gap-1.5">
                {["openai", "anthropic", "google"].map((p) => (
                  <button key={p} onClick={() => onChange({ llmProvider: p })}
                    className={`py-2 rounded-lg text-xs font-medium transition ${config.llmProvider === p ? "bg-purple-500/30 text-purple-300 border border-purple-400/50" : "bg-white/5 text-[#A1A1A1] border border-white/10 hover:border-white/20"}`}>
                    {p === "openai" ? "OpenAI" : p === "anthropic" ? "Anthropic" : "Google"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[#A1A1A1] text-xs uppercase tracking-wider block mb-1">Model</label>
              <select value={config.llmModel} onChange={(e) => onChange({ llmModel: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-purple-400/50">
                {config.llmProvider === "openai" && <>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                </>}
                {config.llmProvider === "anthropic" && <>
                  <option value="claude-sonnet-4-5">claude-sonnet-4-5</option>
                  <option value="claude-haiku-3-5">claude-haiku-3-5</option>
                </>}
                {config.llmProvider === "google" && <>
                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                </>}
              </select>
            </div>
            <div>
              <label className="text-[#A1A1A1] text-xs uppercase tracking-wider block mb-1">API Key</label>
              <input type="password" value={config.llmApiKey} onChange={(e) => onChange({ llmApiKey: e.target.value })}
                placeholder={config.llmProvider === "openai" ? "sk-..." : config.llmProvider === "anthropic" ? "sk-ant-..." : "AIza..."}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-purple-400/50 placeholder-white/20" />
            </div>
            <div>
              <label className="text-[#A1A1A1] text-xs uppercase tracking-wider block mb-1">System Prompt</label>
              <textarea value={config.systemPrompt} onChange={(e) => onChange({ systemPrompt: e.target.value })}
                rows={8} placeholder="Define how your agent thinks..."
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-purple-400/50 resize-none" />
            </div>
          </>
        )}

        {node.type === "guard" && (
          <>
            {[
              { label: "Max per call (USD)", key: "maxPerCallUsd" as const },
              { label: "Daily limit (USD)", key: "dailyLimitUsd" as const },
              { label: "Require confirm above (USD)", key: "requireConfirmAboveUsd" as const },
            ].map((field) => (
              <div key={field.key}>
                <label className="text-[#A1A1A1] text-xs uppercase tracking-wider block mb-1">{field.label}</label>
                <input type="number" value={config[field.key]} onChange={(e) => onChange({ [field.key]: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-red-400/50" />
              </div>
            ))}
            <div className="p-3 rounded-lg bg-red-400/5 border border-red-400/20 text-xs text-[#A1A1A1]">
              These limits are enforced on-chain. The agent cannot spend beyond what you configure here.
            </div>
          </>
        )}

        {node.type === "tool" && (
          <div className="p-3 rounded-lg bg-white/5 text-xs text-[#A1A1A1]">
            This tool is pre-configured for your template. Additional tool configuration coming soon.
          </div>
        )}

        {node.type === "input_task" && (
          <div className="p-3 rounded-lg bg-[#F4C430]/5 border border-[#F4C430]/20 text-xs text-[#A1A1A1]">
            Tasks come from the Nastar marketplace when buyers hire your agent. The task description is passed directly to the LLM.
          </div>
        )}

        {node.type === "output" && (
          <div className="p-3 rounded-lg bg-green-400/5 border border-green-400/20 text-xs text-[#A1A1A1]">
            The agent's response is returned to the buyer as the delivery proof, stored on-chain.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function FlowCanvas({ config, onChange }: AgentFlowBuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(buildInitialNodes(config));
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildInitialEdges(config.templateId));
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: "#888", strokeWidth: 1.5 } }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  // Sync config changes to LLM node
  const handleChange = (updates: Partial<AgentFlowBuilderProps["config"]>) => {
    onChange(updates);
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type === "llm") {
          return {
            ...n, data: {
              ...n.data,
              provider: updates.llmProvider ?? config.llmProvider,
              model: updates.llmModel ?? config.llmModel,
              apiKey: updates.llmApiKey ?? config.llmApiKey,
              systemPrompt: updates.systemPrompt ?? config.systemPrompt,
            },
          };
        }
        if (n.type === "guard") {
          return {
            ...n, data: {
              ...n.data,
              maxPerCall: parseFloat(updates.maxPerCallUsd ?? config.maxPerCallUsd) || 10,
              dailyLimit: parseFloat(updates.dailyLimitUsd ?? config.dailyLimitUsd) || 50,
              confirmAbove: parseFloat(updates.requireConfirmAboveUsd ?? config.requireConfirmAboveUsd) || 25,
            },
          };
        }
        return n;
      })
    );
  };

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        className="bg-[#0A0A0A]"
        deleteKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#222" />
        <Controls className="!bg-[#111] !border-white/10 [&>button]:!bg-[#111] [&>button]:!border-white/10 [&>button]:!text-[#A1A1A1] [&>button:hover]:!bg-white/10" />
        <MiniMap
          className="!bg-[#111] !border-white/10"
          nodeColor={(n) =>
            n.type === "llm" ? "#a855f7" :
            n.type === "guard" ? "#f87171" :
            n.type === "tool" ? "#facc15" :
            n.type === "output" ? "#4ade80" :
            "#F4C430"
          }
        />
      </ReactFlow>

      {/* Click hint */}
      {!selectedNode && (
        <div className="absolute bottom-4 left-4 text-[10px] text-[#A1A1A1]/40 pointer-events-none">
          Click a node to configure &middot; Drag to rearrange &middot; Connect handles to link nodes
        </div>
      )}

      {/* Side panel */}
      <SidePanel
        node={selectedNode}
        config={config}
        onChange={handleChange}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
}

export default function AgentFlowBuilder(props: AgentFlowBuilderProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  );
}
