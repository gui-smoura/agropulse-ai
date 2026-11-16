"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Database,
  ExternalLink,
  RefreshCw,
  Sprout,
  Truck,
} from "lucide-react";
import {
  DashboardOverviewResponse,
  HealthCheckResponse,
  fetchDashboardOverview,
  fetchHealthCheck,
  getApiBaseUrl,
} from "@/lib/api";
import { KpiCards } from "@/components/kpi-cards";
import { AnomalyChart } from "@/components/anomaly-chart";
import { RebalanceTable } from "@/components/rebalance-table";
import { AgentCopilot } from "@/components/agent-copilot";

interface BranchOption {
  id: number | null;
  label: string;
}

const BRANCH_OPTIONS: readonly BranchOption[] = [
  { id: null, label: "Todas as filiais (rede)" },
  { id: 1, label: "Filial Norte · Sinop (MT)" },
  { id: 2, label: "Filial Sul · Dourados (MS)" },
  { id: 3, label: "Filial Cerrado · Rio Verde (GO)" },
  { id: 4, label: "Filial Pantanal · Corumbá (MS)" },
];

type NavSectionId = "overview" | "clima" | "remanejamento" | "telemetria";

export default function AgroPulseDashboardPage(): React.ReactElement {
  const [selectedFilialId, setSelectedFilialId] = useState<number | null>(null);
  const [diasAnalise, setDiasAnalise] = useState<number>(30);
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(
    null
  );
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number>(18);
  const [externalCopilotPrompt, setExternalCopilotPrompt] = useState<
    string | null
  >(null);
  const [activeNav, setActiveNav] = useState<NavSectionId>("overview");

  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    const t0 = performance.now();

    try {
      const [overviewRes, healthRes] = await Promise.all([
        fetchDashboardOverview({
          filial_id: selectedFilialId,
          dias_analise: diasAnalise,
        }),
        fetchHealthCheck(),
      ]);
      const elapsed = Math.max(1, Math.round(performance.now() - t0));
      setLatencyMs(elapsed);
      setOverview(overviewRes);
      setHealth(healthRes);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Falha ao carregar dados analíticos do servidor FastAPI.";
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  }, [selectedFilialId, diasAnalise]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const scrollToSection = (sectionId: NavSectionId, domId: string): void => {
    setActiveNav(sectionId);
    const el = document.getElementById(domId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="flex min-h-screen bg-[#111413] text-[#eef2ef]">
      {/* Persistent Left Rail Navigation */}
      <aside
        aria-label="Navegação principal AgroPulse AI"
        className="hidden w-64 shrink-0 flex-col justify-between border-r border-white/[0.08] bg-[#0d0f0e] lg:flex"
      >
        <div>
          {/* Brand Wordmark */}
          <div className="flex h-16 items-center gap-2.5 border-b border-white/[0.08] px-4">
            <span className="flex w-4 shrink-0 items-center justify-center">
              <Sprout
                className="h-4 w-4 shrink-0 text-[#22c55e]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </span>
            <span className="text-base font-medium text-[#eef2ef]">
              AgroPulse AI
            </span>
          </div>

          {/* Navigation Modules */}
          <nav className="px-2" aria-label="Módulos do sistema">
            <p className="mt-6 mb-2 px-2 text-xs text-[#68736c]">Operações</p>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => scrollToSection("overview", "section-kpis")}
                className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors duration-150 ${
                  activeNav === "overview"
                    ? "bg-[#1f2421] font-medium text-[#eef2ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "font-normal text-[#9aa59e] hover:bg-[#171b19] hover:text-[#eef2ef]"
                }`}
              >
                <span className="flex w-4 shrink-0 items-center justify-center">
                  <BarChart3
                    className="h-4 w-4 text-current"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
                <span className="truncate">Visão geral</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToSection("clima", "section-clima")}
                className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors duration-150 ${
                  activeNav === "clima"
                    ? "bg-[#1f2421] font-medium text-[#eef2ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "font-normal text-[#9aa59e] hover:bg-[#171b19] hover:text-[#eef2ef]"
                }`}
              >
                <span className="flex w-4 shrink-0 items-center justify-center">
                  <Activity
                    className="h-4 w-4 text-current"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
                <span className="truncate">Clima e giro</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  scrollToSection("remanejamento", "section-remanejamento")
                }
                className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors duration-150 ${
                  activeNav === "remanejamento"
                    ? "bg-[#1f2421] font-medium text-[#eef2ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "font-normal text-[#9aa59e] hover:bg-[#171b19] hover:text-[#eef2ef]"
                }`}
              >
                <span className="flex w-4 shrink-0 items-center justify-center">
                  <Truck
                    className="h-4 w-4 text-current"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
                <span className="truncate">Remanejamento</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  scrollToSection("telemetria", "section-telemetria")
                }
                className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors duration-150 ${
                  activeNav === "telemetria"
                    ? "bg-[#1f2421] font-medium text-[#eef2ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "font-normal text-[#9aa59e] hover:bg-[#171b19] hover:text-[#eef2ef]"
                }`}
              >
                <span className="flex w-4 shrink-0 items-center justify-center">
                  <Database
                    className="h-4 w-4 text-current"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
                <span className="truncate">Base e parâmetros</span>
              </button>
            </div>
          </nav>
        </div>

        {/* Sidebar Footer: Telemetry & OpenAPI Link */}
        <div className="space-y-3 border-t border-white/[0.08] p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-2 text-[#9aa59e]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  health?.database_seeded ? "bg-[#4cc38a]" : "bg-[#d99b26]"
                }`}
                aria-hidden="true"
              />
              Motor FastAPI
            </span>
            <span className="font-mono text-xs text-[#68736c] tabular-nums">
              {latencyMs} ms
            </span>
          </div>

          {health && (
            <div className="space-y-1 font-mono text-[11px] text-[#68736c] tabular-nums">
              <div className="flex justify-between">
                <span>Histórico SQLite</span>
                <span className="text-[#9aa59e]">
                  {health.database_seeded ? "730 dias" : "Pendente"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Registros de venda</span>
                <span className="text-[#9aa59e]">
                  {(health.records.registro_vendas ?? 0).toLocaleString(
                    "pt-BR"
                  )}
                </span>
              </div>
            </div>
          )}

          <a
            href={`${getApiBaseUrl()}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-full items-center justify-between rounded-lg border border-white/[0.08] bg-[#141816] px-3 text-xs text-[#9aa59e] transition-colors duration-150 hover:border-white/[0.16] hover:text-[#eef2ef]"
          >
            <span>Contrato OpenAPI</span>
            <ExternalLink
              className="h-3.5 w-3.5 text-[#68736c]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </a>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Contextual Header (64px height) */}
        <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#111413]/95 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 lg:hidden">
              <Sprout
                className="h-4 w-4 text-[#22c55e]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="font-medium text-[#eef2ef]">AgroPulse AI</span>
            </div>
            <div>
              <h1 className="text-base font-medium text-[#eef2ef]">
                Distribuição de insumos · Safra Centro-Oeste
              </h1>
              <p className="hidden text-xs text-[#9aa59e] sm:block">
                Sementes de pastagem, nutrição animal e defensivos
              </p>
            </div>
          </div>

          {/* Operational Scope Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Branch Filter Dropdown */}
            <div className="flex h-9 items-center rounded-lg border border-white/[0.08] bg-[#171b19] px-3">
              <label htmlFor="branch-scope-select" className="sr-only">
                Filtrar por filial
              </label>
              <select
                id="branch-scope-select"
                value={
                  selectedFilialId === null ? "all" : String(selectedFilialId)
                }
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedFilialId(val === "all" ? null : Number(val));
                }}
                className="bg-transparent text-xs font-medium text-[#eef2ef] focus:outline-none"
              >
                {BRANCH_OPTIONS.map((opt) => (
                  <option
                    key={opt.id === null ? "all" : opt.id}
                    value={opt.id === null ? "all" : String(opt.id)}
                    className="bg-[#171b19] text-[#eef2ef]"
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Analysis Window Selector */}
            <div className="flex h-9 items-center rounded-lg border border-white/[0.08] bg-[#171b19] px-3">
              <label htmlFor="window-days-select" className="sr-only">
                Janela de análise climática
              </label>
              <select
                id="window-days-select"
                value={String(diasAnalise)}
                onChange={(e) => setDiasAnalise(Number(e.target.value))}
                className="bg-transparent text-xs font-medium text-[#eef2ef] focus:outline-none"
              >
                <option value="15" className="bg-[#171b19] text-[#eef2ef]">
                  Últimos 15 dias
                </option>
                <option value="30" className="bg-[#171b19] text-[#eef2ef]">
                  Últimos 30 dias
                </option>
                <option value="60" className="bg-[#171b19] text-[#eef2ef]">
                  Últimos 60 dias
                </option>
              </select>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => void loadDashboardData()}
              disabled={isLoading}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-[#171b19] px-3 text-xs font-medium text-[#eef2ef] transition-colors duration-150 hover:bg-[#1f2421] disabled:opacity-50"
              title="Atualizar dados"
            >
              <RefreshCw
                className={`h-4 w-4 text-[#9aa59e] ${
                  isLoading ? "animate-spin" : ""
                }`}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Body */}
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-6">
          {errorMsg && (
            <div
              role="alert"
              className="mb-6 flex items-center justify-between rounded-xl border border-[#e5484d]/30 bg-[#e5484d]/10 p-4 text-xs text-[#e5484d]"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle
                  className="h-4 w-4 shrink-0 text-[#e5484d]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium text-[#eef2ef]">
                    Falha na comunicação com o servidor FastAPI
                  </p>
                  <p className="mt-0.5 text-[#9aa59e]">{errorMsg}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadDashboardData()}
                className="inline-flex h-8 items-center rounded-lg bg-[#eef2ef] px-3 font-medium text-[#0d0f0e] transition-colors duration-150 hover:bg-white"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {isLoading && !overview ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-36 rounded-xl border border-white/[0.08] bg-[#171b19]"
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="h-[520px] rounded-xl border border-white/[0.08] bg-[#171b19] xl:col-span-8" />
                <div className="h-[520px] rounded-xl border border-white/[0.08] bg-[#171b19] xl:col-span-4" />
              </div>
            </div>
          ) : overview ? (
            <div className="space-y-6">
              {/* Top Section: KPI Cards */}
              <div id="section-kpis">
                <KpiCards
                  anomalias={overview.anomalias_climaticas}
                  remanejamento={overview.remanejamento_estoque}
                  afinidade={overview.afinidade_consultores}
                  selectedFilialId={selectedFilialId}
                />
              </div>

              {/* Center & Right Split: Analytics Workspace (8 cols) + Copilot (4 cols) */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                {/* Center Left 8 Columns: Charts + Rebalance/Affinity Tables */}
                <div className="space-y-6 xl:col-span-8">
                  <div id="section-clima">
                    <AnomalyChart
                      report={overview.anomalias_climaticas}
                      selectedFilialId={selectedFilialId}
                      onSelectFilialId={(id) => setSelectedFilialId(id)}
                    />
                  </div>

                  <div id="section-remanejamento">
                    <RebalanceTable
                      remanejamento={overview.remanejamento_estoque}
                      afinidade={overview.afinidade_consultores}
                      selectedFilialId={selectedFilialId}
                      onResetFilialFilter={() => setSelectedFilialId(null)}
                      onSimulatePrompt={(promptText) => {
                        setExternalCopilotPrompt(promptText);
                        const copilotEl =
                          document.getElementById("section-copilot");
                        if (copilotEl && window.innerWidth < 1280) {
                          copilotEl.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }
                      }}
                    />
                  </div>

                  {/* Bottom Telemetry & Parameters Strip */}
                  <section
                    id="section-telemetria"
                    aria-label="Parâmetros do motor e base histórica"
                    className="rounded-xl border border-white/[0.08] bg-[#171b19] p-6"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
                      <h2 className="text-sm font-medium text-[#eef2ef]">
                        Parâmetros do motor e base histórica
                      </h2>
                      <span className="font-mono text-xs text-[#68736c] tabular-nums">
                        Limite: 15 req/h por IP · SQLite local
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
                      <div className="rounded-lg border border-white/[0.06] bg-[#111413] p-4">
                        <p className="text-[#68736c]">Cálculo estatístico</p>
                        <p className="mt-1 font-medium text-[#eef2ef]">
                          Z-score e cobertura em dias
                        </p>
                        <p className="mt-1 leading-relaxed text-[#9aa59e]">
                          Desvio pluviométrico, correlação e giro diário
                          processados em Python/Pandas com validação Pydantic
                        </p>
                      </div>

                      <div className="rounded-lg border border-white/[0.06] bg-[#111413] p-4">
                        <p className="text-[#68736c]">
                          Orquestração de ferramentas
                        </p>
                        <p className="mt-1 font-medium text-[#eef2ef]">
                          OpenAI SDK Function Calling
                        </p>
                        <p className="mt-1 leading-relaxed text-[#9aa59e]">
                          Respostas baseadas exclusivamente no retorno das
                          funções analíticas registradas no backend
                        </p>
                      </div>

                      <div className="rounded-lg border border-white/[0.06] bg-[#111413] p-4">
                        <p className="text-[#68736c]">
                          Base operacional (730 dias)
                        </p>
                        <p className="mt-1 font-mono font-medium text-[#eef2ef] tabular-nums">
                          {health
                            ? `${(
                                health.records.posicao_estoque_clima ?? 0
                              ).toLocaleString("pt-BR")} registros climáticos`
                            : "SQLite ativo"}
                        </p>
                        <p className="mt-1 text-[#9aa59e] tabular-nums">
                          {health?.records.filiais ?? 4} filiais ·{" "}
                          {health?.records.consultores ?? 8} consultores ·{" "}
                          {health?.records.produtos ?? 5} insumos monitorados
                        </p>
                      </div>
                    </div>
                  </section>
                </div>

                {/* Right 4 Columns: Sticky Interactive Agent Copilot */}
                <div id="section-copilot" className="xl:col-span-4">
                  <div className="sticky top-20">
                    <AgentCopilot
                      externalPrompt={externalCopilotPrompt}
                      onExternalPromptConsumed={() =>
                        setExternalCopilotPrompt(null)
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
