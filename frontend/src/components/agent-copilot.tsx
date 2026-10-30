"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  Send,
  Sparkles,
  Terminal,
  User,
  Zap,
} from "lucide-react";
import { ApiClientError, sendAgentChatMessage } from "@/lib/api";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed: string[];
  timestamp: string;
  isError?: boolean;
}

export interface AgentCopilotProps {
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
}

interface QuickPromptOption {
  id: string;
  label: string;
  prompt: string;
}

const QUICK_PROMPTS: readonly QuickPromptOption[] = [
  {
    id: "prompt-clima",
    label: "🌧️ Diagnóstico Estiagem (Filial Norte)",
    prompt:
      "Qual o impacto do atraso de chuva nos últimos 30 dias na Filial Norte sobre as vendas de Sementes e Proteinado de Seca?",
  },
  {
    id: "prompt-estoque",
    label: "🚚 Plano de Remanejamento (Norte → Sul)",
    prompt:
      "Quais lotes estão com cobertura crítica (> 60 dias) em risco de perder janela de plantio e para qual filial e consultor devemos transferir?",
  },
  {
    id: "prompt-afinidade",
    label: "🏆 Afinidade Técnica vs. Commodity",
    prompt:
      "Compare a margem e conversão dos Especialistas Técnicos em Sementes/Defensivos contra os consultores de Volume/Commodity.",
  },
];

function getTimeLabel(): string {
  const now = new Date();
  return now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderFormattedLine(line: string, index: number): React.ReactElement {
  const trimmed = line.trim();
  if (trimmed.startsWith("### ")) {
    return (
      <h4
        key={index}
        className="mt-2 text-sm font-bold tracking-tight text-[#4be277]"
      >
        {trimmed.replace("### ", "")}
      </h4>
    );
  }
  if (trimmed.startsWith("#### ")) {
    return (
      <h5
        key={index}
        className="mt-2.5 border-b border-white/[0.06] pb-1 text-xs font-bold uppercase tracking-wider text-[#f0fdf4]"
      >
        {trimmed.replace("#### ", "")}
      </h5>
    );
  }

  const segments = line.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p key={index} className="text-xs leading-relaxed text-[#d8e6dd]">
      {segments.map((seg, segIdx) => {
        if (seg.startsWith("**") && seg.endsWith("**")) {
          return (
            <strong key={segIdx} className="font-semibold text-[#f0fdf4]">
              {seg.slice(2, -2)}
            </strong>
          );
        }
        return <React.Fragment key={segIdx}>{seg}</React.Fragment>;
      })}
    </p>
  );
}

export function AgentCopilot({
  externalPrompt,
  onExternalPromptConsumed,
}: AgentCopilotProps): React.ReactElement {
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      id: "welcome-turn",
      role: "assistant",
      content:
        "### Copiloto Executivo AgroPulse AI Pronto\nEstou conectado ao motor determinístico SQLite/FastAPI. Selecione um dos **3 prompts rápidos** abaixo ou envie uma pergunta para auditar anomalias climáticas (Z-score), remanejamento de estoque entre filiais ou afinidade de consultores sem alucinação matemática.",
      toolsUsed: [],
      timestamp: "Agora",
    },
  ]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const executePrompt = async (promptText: string): Promise<void> => {
    const cleaned = promptText.trim();
    if (!cleaned || isLoading) {
      return;
    }

    const userTurn: ChatTurn = {
      id: `user-${Date.now()}`,
      role: "user",
      content: cleaned,
      toolsUsed: [],
      timestamp: getTimeLabel(),
    };

    setMessages((prev) => [...prev, userTurn]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await sendAgentChatMessage(cleaned);
      const assistantTurn: ChatTurn = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.reply,
        toolsUsed: response.tools_used,
        timestamp: getTimeLabel(),
      };
      setMessages((prev) => [...prev, assistantTurn]);
    } catch (err: unknown) {
      let errorMsg =
        "Não foi possível conectar ao orquestrador FastAPI. Verifique se o backend está em execução.";
      if (err instanceof ApiClientError) {
        if (err.status === 429) {
          errorMsg = `Limite de proteção da Demo atingido (HTTP 429): ${err.message}`;
        } else {
          errorMsg = `Erro da API (${err.status}): ${err.message}`;
        }
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: errorMsg,
          toolsUsed: [],
          timestamp: getTimeLabel(),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (externalPrompt && externalPrompt.trim().length > 0 && !isLoading) {
      void executePrompt(externalPrompt);
      if (onExternalPromptConsumed) {
        onExternalPromptConsumed();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPrompt, isLoading]);

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void executePrompt(inputValue);
  };

  return (
    <aside
      aria-label="Copiloto Agêntico AgroPulse AI"
      className="flex h-full flex-col rounded-2xl border border-[#2a3f37] bg-[#121e19] shadow-drawer"
    >
      {/* Copilot Header */}
      <div className="flex items-center justify-between border-b border-[#2a3f37] bg-[#16221d] px-4 py-3.5 rounded-t-2xl">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-[#22c55e] border border-emerald-500/30">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold text-[#f0fdf4]">
                Copiloto Agêntico
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#22c55e]">
                <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                Tool Calling
              </span>
            </div>
            <p className="text-[11px] text-[#9cb8aa]">
              OpenAI SDK · Validação Pydantic · Zero Math Hallucination
            </p>
          </div>
        </div>
      </div>

      {/* 3 One-Click Quick Prompts for Evaluators */}
      <div className="border-b border-[#2a3f37] bg-[#121e19] px-4 py-3">
        <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#9cb8aa]">
          <Terminal className="h-3 w-3 text-[#22c55e]" aria-hidden="true" />
          <span>Prompts Rápidos de Auditoria (1-Clique)</span>
        </p>
        <div className="flex flex-col gap-1.5">
          {QUICK_PROMPTS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={isLoading}
              onClick={() => void executePrompt(item.prompt)}
              className="group flex w-full items-center justify-between rounded-xl border border-[#2a3f37] bg-[#1a2923] px-3 py-2 text-left text-xs font-medium text-[#d8e6dd] transition-all hover:border-[#22c55e]/60 hover:bg-[#22362f] hover:text-[#f0fdf4] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="truncate">{item.label}</span>
              <span className="ml-2 shrink-0 font-mono text-[10px] text-[#22c55e] opacity-80 group-hover:opacity-100">
                Testar →
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Messages Stream */}
      <div
        ref={scrollContainerRef}
        className="flex-1 space-y-3.5 overflow-y-auto p-4 max-h-[520px] min-h-[340px]"
        aria-live="polite"
      >
        {messages.map((turn) => (
          <div
            key={turn.id}
            className={`flex flex-col gap-1.5 ${
              turn.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div className="flex items-center gap-1.5 px-1 text-[10px] text-[#5d7d70]">
              {turn.role === "user" ? (
                <>
                  <span>Diretoria Executiva</span>
                  <User className="h-3 w-3 text-[#9cb8aa]" aria-hidden="true" />
                </>
              ) : (
                <>
                  <Bot className="h-3 w-3 text-[#22c55e]" aria-hidden="true" />
                  <span>AgroPulse AI</span>
                </>
              )}
              <span>· {turn.timestamp}</span>
            </div>

            {/* Tool Calling Badges */}
            {turn.toolsUsed.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {turn.toolsUsed.map((toolName, toolIdx) => (
                  <span
                    key={`${toolName}-${toolIdx}`}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#4be277]"
                  >
                    <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>⚡ Acionou: {toolName}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Message Bubble */}
            <div
              className={`w-full rounded-2xl p-3.5 ${
                turn.role === "user"
                  ? "max-w-[90%] border border-emerald-500/30 bg-[#22362f] text-xs text-[#f0fdf4]"
                  : turn.isError
                  ? "border border-red-500/40 bg-red-950/30 text-xs text-[#ffb4ab]"
                  : "border border-[#2a3f37] bg-[#1a2923] space-y-1.5"
              }`}
            >
              {turn.role === "user" ? (
                <p className="leading-relaxed">{turn.content}</p>
              ) : (
                turn.content
                  .split("\n")
                  .filter((line) => line.trim().length > 0)
                  .map((line, idx) => renderFormattedLine(line, idx))
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-[#2a3f37] bg-[#1a2923] px-3.5 py-2.5 text-xs text-[#9cb8aa]">
            <Loader2
              className="h-4 w-4 animate-spin text-[#22c55e]"
              aria-hidden="true"
            />
            <span>
              Executando Tool Calling nas funções determinísticas do motor...
            </span>
          </div>
        )}
      </div>

      {/* Input Footer */}
      <form
        onSubmit={handleFormSubmit}
        className="border-t border-[#2a3f37] bg-[#16221d] p-3 rounded-b-2xl"
      >
        <div className="flex items-center gap-2">
          <label htmlFor="copilot-chat-input" className="sr-only">
            Pergunte ao Copiloto Agêntico
          </label>
          <input
            id="copilot-chat-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            placeholder="Ex: Qual filial precisa receber lote de Sementes?"
            className="h-10 flex-1 rounded-xl border border-[#2a3f37] bg-[#121e19] px-3.5 text-xs text-[#f0fdf4] placeholder-[#5d7d70] focus:border-[#22c55e] focus:outline-none focus:ring-2 focus:ring-[#22c55e]/20 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || inputValue.trim().length === 0}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#22c55e] px-3.5 text-xs font-semibold text-[#071a10] transition-all hover:bg-[#16a34a] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Enviar</span>
          </button>
        </div>
      </form>
    </aside>
  );
}
