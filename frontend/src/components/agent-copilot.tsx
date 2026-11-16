"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
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
    label: "Impacto da estiagem na Filial Norte",
    prompt:
      "Qual o impacto do atraso de chuva nos últimos 30 dias na Filial Norte sobre as vendas de Sementes e Proteinado de Seca?",
  },
  {
    id: "prompt-estoque",
    label: "Plano de transferência de estoque (> 60d)",
    prompt:
      "Quais lotes estão com cobertura crítica (> 60 dias) em risco de perder janela de plantio e para qual filial e consultor devemos transferir?",
  },
  {
    id: "prompt-afinidade",
    label: "Margem de especialistas vs. commodity",
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

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-medium text-[#eef2ef]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-[#171b19] px-1 py-0.5 font-mono text-[11px] text-[#eef2ef]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <span key={idx} className="text-[#eef2ef]">
          {part.slice(1, -1)}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function renderFormattedLine(line: string, index: number): React.ReactElement {
  const trimmed = line.trim();
  if (trimmed.startsWith("#### ")) {
    return (
      <h5
        key={index}
        className="mt-2 border-b border-white/[0.06] pb-1 text-xs font-medium text-[#eef2ef]"
      >
        {renderInlineMarkdown(trimmed.slice(5))}
      </h5>
    );
  }
  if (
    trimmed.startsWith("### ") ||
    trimmed.startsWith("## ") ||
    trimmed.startsWith("# ")
  ) {
    const headingText = trimmed.replace(/^#{1,3}\s+/, "");
    return (
      <h4
        key={index}
        className="mt-1.5 text-[13px] font-medium text-[#eef2ef]"
      >
        {renderInlineMarkdown(headingText)}
      </h4>
    );
  }

  const nestedBulletMatch = /^\s{2,}[-*•]\s+(.*)$/.exec(line);
  if (nestedBulletMatch && nestedBulletMatch[1] !== undefined) {
    return (
      <div
        key={index}
        className="flex items-baseline gap-2 pl-4 text-xs leading-relaxed text-[#9aa59e]"
      >
        <span className="font-mono text-[11px] text-[#68736c]" aria-hidden="true">
          ·
        </span>
        <p className="min-w-0 flex-1">
          {renderInlineMarkdown(nestedBulletMatch[1])}
        </p>
      </div>
    );
  }

  const topBulletMatch = /^[-*•]\s+(.*)$/.exec(trimmed);
  if (topBulletMatch && topBulletMatch[1] !== undefined) {
    return (
      <div
        key={index}
        className="flex items-baseline gap-2 text-xs leading-relaxed text-[#9aa59e]"
      >
        <span className="font-mono text-[11px] text-[#68736c]" aria-hidden="true">
          –
        </span>
        <p className="min-w-0 flex-1">
          {renderInlineMarkdown(topBulletMatch[1])}
        </p>
      </div>
    );
  }

  return (
    <p key={index} className="text-xs leading-relaxed text-[#9aa59e]">
      {renderInlineMarkdown(trimmed)}
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
        "Selecione uma consulta acima ou digite uma pergunta para cruzar dados de precipitação, cobertura de estoque em dias e margem por consultor.",
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
        "Não foi possível conectar ao servidor FastAPI. Verifique se o backend está em execução.";
      if (err instanceof ApiClientError) {
        if (err.status === 429) {
          errorMsg = `Limite de requisições atingido (HTTP 429): ${err.message}`;
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
      aria-label="Copiloto analítico AgroPulse AI"
      className="flex h-full flex-col rounded-xl border border-white/[0.08] bg-[#171b19]"
    >
      {/* Copilot Header */}
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-[#eef2ef]">
            Copiloto analítico
          </h2>
          <span className="font-mono text-[11px] text-[#68736c]">
            Consultas SQLite
          </span>
        </div>
        <p className="mt-0.5 text-xs text-[#9aa59e]">
          Análise de clima, cobertura de estoque e carteira comercial
        </p>
      </div>

      {/* Quick Prompts */}
      <div className="border-b border-white/[0.06] bg-[#141816] px-4 py-3">
        <p className="mb-2 text-xs text-[#68736c]">Consultas sugeridas</p>
        <div className="flex flex-col gap-1.5">
          {QUICK_PROMPTS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={isLoading}
              onClick={() => void executePrompt(item.prompt)}
              className="group flex h-8 w-full items-center justify-between rounded-lg border border-white/[0.06] bg-[#171b19] px-3 text-left text-xs text-[#9aa59e] transition-colors duration-150 hover:border-white/[0.14] hover:bg-[#1f2421] hover:text-[#eef2ef] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="truncate">{item.label}</span>
              <span className="ml-2 shrink-0 font-mono text-[11px] text-[#68736c] group-hover:text-[#9aa59e]">
                →
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Messages Stream */}
      <div
        ref={scrollContainerRef}
        className="max-h-[520px] min-h-[340px] flex-1 space-y-3 overflow-y-auto p-4"
        aria-live="polite"
      >
        {messages.map((turn) => (
          <div
            key={turn.id}
            className={`flex flex-col gap-1 ${
              turn.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div className="flex items-center gap-1.5 px-1 font-mono text-[11px] text-[#68736c]">
              <span>
                {turn.role === "user" ? "Operador" : "AgroPulse"}
              </span>
              <span>· {turn.timestamp}</span>
            </div>

            {/* Quiet Mono Tool Indicators */}
            {turn.toolsUsed.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-1">
                {turn.toolsUsed.map((toolName, toolIdx) => (
                  <span
                    key={`${toolName}-${toolIdx}`}
                    className="font-mono text-[11px] text-[#4cc38a]"
                  >
                    fn: {toolName}
                  </span>
                ))}
              </div>
            )}

            {/* Message Bubble */}
            <div
              className={`w-full rounded-lg p-3 ${
                turn.role === "user"
                  ? "max-w-[90%] border border-white/[0.1] bg-[#1f2421] text-xs text-[#eef2ef]"
                  : turn.isError
                  ? "border border-[#e5484d]/30 bg-[#e5484d]/10 text-xs text-[#e5484d]"
                  : "border border-white/[0.06] bg-[#111413] space-y-1.5"
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
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[#111413] px-3 py-2 text-xs text-[#9aa59e]">
            <Loader2
              className="h-4 w-4 animate-spin text-[#68736c]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>Consultando base analítica...</span>
          </div>
        )}
      </div>

      {/* Input Footer */}
      <form
        onSubmit={handleFormSubmit}
        className="border-t border-white/[0.06] p-3"
      >
        <div className="flex items-center gap-2">
          <label htmlFor="copilot-chat-input" className="sr-only">
            Perguntar ao copiloto
          </label>
          <input
            id="copilot-chat-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            placeholder="Perguntar sobre estoque ou filiais"
            className="h-9 flex-1 rounded-lg border border-white/[0.08] bg-[#111413] px-3 text-xs text-[#eef2ef] placeholder-[#68736c] focus:border-[#22c55e] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || inputValue.trim().length === 0}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#eef2ef] px-3 text-xs font-medium text-[#0d0f0e] transition-[background-color,transform,opacity] duration-150 hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp
              className="h-4 w-4"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>Enviar</span>
          </button>
        </div>
      </form>
    </aside>
  );
}
