"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Building2,
  Calendar,
  Cpu,
  Database,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sprout,
  Truck,
  Users,
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
  { id: null, label: "Todas as Filiais (Consolidado Rede)" },
  { id: 1, label: "Filial Norte — Sinop (MT)" },
  { id: 2, label: "Filial Sul — Dourados (MS)" },
  { id: 3, label: "Filial Cerrado — Rio Verde (GO)" },
  { id: 4, label: "Filial Pantanal — Corumbá (MS)" },
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
    <div className="flex min-h-screen bg-[#0a1611] text-[#f0fdf4]">
      {/* Persistent Left Rail Navigation (DESIGN.md Section 5) */}
      <aside
        aria-label="Navegação Executiva AgroPulse AI"
        className="hidden w-64 shrink-0 flex-col justify-between border-r border-[#1f3029] bg-[#131f1a] lg:flex"
      >
        <div>
          {/* Brand Logo */}
          <div className="flex h-16 items-center gap-3 border-b border-[#1f3029] px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#22c55e] text-[#071a10] shadow-sm">
              <Sprout className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold tracking-tight text-[#f0fdf4]">
                  AgroPulse AI
                </span>
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#22c55e]">
                  v0.1
                </span>
              </div>
              <p className="text-[11px] text-[#9cb8aa]">
                Inteligência Comercial &amp; Estoque
              </p>
            </div>
          </div>

          {/* Navigation Modules */}
          <nav className="mt-4 space-y-1 px-3" aria-label="Módulos do Sistema">
            <p className="px-3 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#5d7d70]">
              Cockpit de Decisão
            </p>
            <button
              type="button"
              onClick={() => scrollToSection("overview", "section-kpis")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                activeNav === "overview"
                  ? "border-l-[3px] border-[#22c55e] bg-[#1a2923] text-[#f0fdf4]"
                  : "text-[#9cb8aa] hover:bg-[#1a2923]/60 hover:text-[#f0fdf4]"
              }`}
            >
              <BarChart3 className="h-4 w-4 text-[#22c55e]" aria-hidden="true" />
              <span>Visão Geral &amp; Copiloto</span>
            </button>

            <button
              type="button"
              onClick={() => scrollToSection("clima", "section-clima")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                activeNav === "clima"
                  ? "border-l-[3px] border-[#22c55e] bg-[#1a2923] text-[#f0fdf4]"
                  : "text-[#9cb8aa] hover:bg-[#1a2923]/60 hover:text-[#f0fdf4]"
              }`}
            >
              <Activity className="h-4 w-4 text-[#38bdf8]" aria-hidden="true" />
              <span>Anomalias &amp; Pluviometria</span>
            </button>

            <button
              type="button"
              onClick={() =>
                scrollToSection("remanejamento", "section-remanejamento")
              }
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                activeNav === "remanejamento"
                  ? "border-l-[3px] border-[#22c55e] bg-[#1a2923] text-[#f0fdf4]"
                  : "text-[#9cb8aa] hover:bg-[#1a2923]/60 hover:text-[#f0fdf4]"
              }`}
            >
              <Truck className="h-4 w-4 text-[#f59e0b]" aria-hidden="true" />
              <span>Remanejamento &amp; Afinidade</span>
            </button>

            <button
              type="button"
              onClick={() =>
                scrollToSection("telemetria", "section-telemetria")
              }
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                activeNav === "telemetria"
                  ? "border-l-[3px] border-[#22c55e] bg-[#1a2923] text-[#f0fdf4]"
                  : "text-[#9cb8aa] hover:bg-[#1a2923]/60 hover:text-[#f0fdf4]"
              }`}
            >
              <ShieldCheck
                className="h-4 w-4 text-[#22c55e]"
                aria-hidden="true"
              />
              <span>Auditoria &amp; Telemetria</span>
            </button>
          </nav>

          {/* Architectural Guardrails Card in Sidebar */}
          <div className="mx-3 mt-6 rounded-xl border border-[#2a3f37] bg-[#16221d] p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#f0fdf4]">
              <Cpu className="h-4 w-4 text-[#22c55e]" aria-hidden="true" />
              <span>Arquitetura Determinística</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#9cb8aa]">
              O LLM jamais realiza cálculos matemáticos. Z-score, correlação e
              cobertura em dias são processados em{" "}
              <code className="font-mono text-[#4be277]">
                analytics/engine.py
              </code>{" "}
              com validação Pydantic v2.
            </p>
          </div>
        </div>

        {/* Sidebar Footer: Engine Telemetry & OpenAPI Link */}
        <div className="border-t border-[#1f3029] p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-[#9cb8aa]">
              <span
                className={`h-2 w-2 rounded-full ${
                  health?.database_seeded ? "bg-[#22c55e]" : "bg-[#f59e0b]"
                }`}
              />
              Engine FastAPI
            </span>
            <span className="font-mono text-[11px] font-semibold text-[#22c55e] tabular-nums">
              {latencyMs}ms
            </span>
          </div>

          {health && (
            <div className="rounded-lg bg-[#0d1612] px-2.5 py-2 font-mono text-[10px] text-[#9cb8aa] tabular-nums">
              <div className="flex justify-between">
                <span>SQLite Auto-Seed:</span>
                <span className="text-[#22c55e]">
                  {health.database_seeded ? "ATIVO (730d)" : "PENDENTE"}
                </span>
              </div>
              <div className="mt-0.5 flex justify-between">
                <span>Registros Vendas:</span>
                <span className="text-[#f0fdf4]">
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
            className="flex w-full items-center justify-between rounded-lg border border-[#2a3f37] bg-[#1a2923] px-3 py-2 text-xs font-medium text-[#d8e6dd] transition-colors hover:border-[#22c55e]/50 hover:text-[#f0fdf4]"
          >
            <span>Contrato OpenAPI / Swagger</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Executive Contextual Header (64px height, DESIGN.md Section 5.2) */}
        <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[#1f3029] bg-[#0d1612]/90 px-4 py-2.5 backdrop-blur-md lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#22c55e] text-[#071a10]">
                <Sprout className="h-4 w-4" aria-hidden="true" />
              </div>
              <span className="font-bold text-[#f0fdf4]">AgroPulse AI</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#f0fdf4] sm:text-base">
                Cockpit Executivo de Inteligência Comercial &amp; Logística de
                Estoque
              </h1>
              <p className="hidden text-xs text-[#9cb8aa] sm:block">
                Monitoramento Preditivo de Insumos: Sementes de Pastagem,
                Nutrição Animal &amp; Defensivos
              </p>
            </div>
          </div>

          {/* Operational Scope Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Branch Filter Dropdown */}
            <div className="flex items-center gap-1.5 rounded-xl border border-[#2a3f37] bg-[#131f1a] px-3 py-1.5">
              <Building2
                className="h-3.5 w-3.5 text-[#22c55e]"
                aria-hidden="true"
              />
              <label htmlFor="branch-scope-select" className="sr-only">
                Filtrar por Filial
              </label>
              <select
                id="branch-scope-select"
                value={selectedFilialId === null ? "all" : String(selectedFilialId)}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedFilialId(val === "all" ? null : Number(val));
                }}
                className="bg-transparent text-xs font-semibold text-[#f0fdf4] focus:outline-none"
              >
                {BRANCH_OPTIONS.map((opt) => (
                  <option
                    key={opt.id === null ? "all" : opt.id}
                    value={opt.id === null ? "all" : String(opt.id)}
                    className="bg-[#131f1a] text-[#f0fdf4]"
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Analysis Window Selector */}
            <div className="flex items-center gap-1.5 rounded-xl border border-[#2a3f37] bg-[#131f1a] px-3 py-1.5">
              <Calendar
                className="h-3.5 w-3.5 text-[#38bdf8]"
                aria-hidden="true"
              />
              <label htmlFor="window-days-select" className="sr-only">
                Janela de Análise Climática
              </label>
              <select
                id="window-days-select"
                value={String(diasAnalise)}
                onChange={(e) => setDiasAnalise(Number(e.target.value))}
                className="bg-transparent text-xs font-semibold text-[#f0fdf4] focus:outline-none"
              >
                <option value="15" className="bg-[#131f1a] text-[#f0fdf4]">
                  Janela: 15 dias
                </option>
                <option value="30" className="bg-[#131f1a] text-[#f0fdf4]">
                  Janela: 30 dias (Safra)
                </option>
                <option value="60" className="bg-[#131f1a] text-[#f0fdf4]">
                  Janela: 60 dias
                </option>
              </select>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => void loadDashboardData()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#2a3f37] bg-[#1a2923] px-3 py-1.5 text-xs font-semibold text-[#f0fdf4] transition-colors hover:bg-[#22362f] disabled:opacity-50"
              title="Recarregar telemetria determinística"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-[#22c55e] ${
                  isLoading ? "animate-spin" : ""
                }`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Body */}
        <main className="flex-1 p-4 lg:p-6">
          {errorMsg && (
            <div
              role="alert"
              className="mb-6 flex items-center justify-between rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-xs text-[#ffb4ab]"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle
                  className="h-5 w-5 shrink-0 text-[#ef4444]"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-bold text-[#f0fdf4]">
                    Erro de Comunicação com a Engine FastAPI
                  </p>
                  <p className="mt-0.5">{errorMsg}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadDashboardData()}
                className="rounded-lg bg-[#ef4444] px-3 py-1.5 font-semibold text-[#071a10] hover:bg-red-400"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {isLoading && !overview ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-36 animate-pulse rounded-2xl border border-[#2a3f37] bg-[#1a2923]"
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="h-[520px] animate-pulse rounded-2xl border border-[#2a3f37] bg-[#1a2923] xl:col-span-8" />
                <div className="h-[520px] animate-pulse rounded-2xl border border-[#2a3f37] bg-[#1a2923] xl:col-span-4" />
              </div>
            </div>
          ) : overview ? (
            <div className="space-y-6">
              {/* Top Section: Executive KPI Cards */}
              <div id="section-kpis">
                <KpiCards
                  anomalias={overview.anomalias_climaticas}
                  remanejamento={overview.remanejamento_estoque}
                  afinidade={overview.afinidade_consultores}
                  selectedFilialId={selectedFilialId}
                />
              </div>

              {/* Center & Right Split: Analytics Workspace (8 cols) + Agent Copilot Drawer (4 cols) */}
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

                  {/* Bottom Telemetry & Architecture Audit Strip (SCREEN_5 in DESIGN.md) */}
                  <section
                    id="section-telemetria"
                    aria-label="Telemetria e Governança Agêntica"
                    className="rounded-2xl border border-[#2a3f37] bg-[#121e19] p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
                      <div className="flex items-center gap-2">
                        <Database
                          className="h-4 w-4 text-[#22c55e]"
                          aria-hidden="true"
                        />
                        <h2 className="text-sm font-bold text-[#f0fdf4]">
                          Auditoria &amp; Telemetria da Arquitetura (Clean Code
                          Guardrails)
                        </h2>
                      </div>
                      <span className="font-mono text-[11px] text-[#22c55e]">
                        Rate Limit IP: 15 req/hora · SQLite Auto-Seed Lifespan
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                      <div className="rounded-xl border border-[#2a3f37] bg-[#1a2923] p-3">
                        <p className="font-mono text-[10px] uppercase text-[#9cb8aa]">
                          1. Motor Determinístico
                        </p>
                        <p className="mt-1 font-semibold text-[#f0fdf4]">
                          Z-Score &amp; Cobertura Puras
                        </p>
                        <p className="mt-1 text-[11px] text-[#9cb8aa]">
                          Cálculos executados em Pandas/NumPy/SQLAlchemy sem
                          interferência probabilística.
                        </p>
                      </div>

                      <div className="rounded-xl border border-[#2a3f37] bg-[#1a2923] p-3">
                        <p className="font-mono text-[10px] uppercase text-[#9cb8aa]">
                          2. Orquestrador Agêntico
                        </p>
                        <p className="mt-1 font-semibold text-[#f0fdf4]">
                          OpenAI SDK Native Tools
                        </p>
                        <p className="mt-1 text-[11px] text-[#9cb8aa]">
                          Compatível com Groq, Gemini e LM Studio sem LangChain
                          ou CrewAI.
                        </p>
                      </div>

                      <div className="rounded-xl border border-[#2a3f37] bg-[#1a2923] p-3">
                        <div className="flex items-center justify-between">
                          <p className="font-mono text-[10px] uppercase text-[#9cb8aa]">
                            3. Banco Sintético (730 dias)
                          </p>
                          <Users
                            className="h-3.5 w-3.5 text-[#22c55e]"
                            aria-hidden="true"
                          />
                        </div>
                        <p className="mt-1 font-semibold text-[#f0fdf4] tabular-nums">
                          {health
                            ? `${(
                                health.records.posicao_estoque_clima ?? 0
                              ).toLocaleString("pt-BR")} snapshots climáticos`
                            : "SQLite Ativo"}
                        </p>
                        <p className="mt-1 text-[11px] text-[#9cb8aa] tabular-nums">
                          {health?.records.filiais ?? 4} filiais ·{" "}
                          {health?.records.consultores ?? 8} consultores ·{" "}
                          {health?.records.produtos ?? 5} insumos estratégicos.
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
