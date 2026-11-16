"use client";

import React, { useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BranchClimateAnomaly,
  ClimateSalesAnomalyReport,
  formatNumberBR,
} from "@/lib/api";

export interface AnomalyChartProps {
  report: ClimateSalesAnomalyReport;
  selectedFilialId: number | null;
  onSelectFilialId?: (filialId: number | null) => void;
}

interface ChartPoint {
  dateLabel: string;
  rawDate: string;
  precipitacao_mm: number;
  vendas_sementes_qtd: number;
  vendas_nutricao_seca_qtd: number;
}

interface BranchTabItem {
  filial_id: number;
  shortName: string;
}

const ALL_BRANCH_TABS: readonly BranchTabItem[] = [
  { filial_id: 1, shortName: "Norte · Sinop" },
  { filial_id: 2, shortName: "Sul · Dourados" },
  { filial_id: 3, shortName: "Cerrado · Rio Verde" },
  { filial_id: 4, shortName: "Pantanal · Corumbá" },
];

function formatShortDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return isoDate;
}

export function AnomalyChart({
  report,
  selectedFilialId,
  onSelectFilialId,
}: AnomalyChartProps): React.ReactElement {
  const defaultBranchId =
    selectedFilialId ??
    report.filiais.find((f) => f.severidade === "CRITICA")?.filial_id ??
    report.filiais[0]?.filial_id ??
    1;

  const [activeChartBranchId, setActiveChartBranchId] =
    useState<number>(defaultBranchId);

  const effectiveBranchId = selectedFilialId ?? activeChartBranchId;

  const activeBranch: BranchClimateAnomaly | undefined = useMemo(() => {
    return (
      report.filiais.find((f) => f.filial_id === effectiveBranchId) ??
      report.filiais[0]
    );
  }, [report.filiais, effectiveBranchId]);

  const chartData: ChartPoint[] = useMemo(() => {
    const targetId = activeBranch?.filial_id ?? effectiveBranchId;
    const filtered = report.serie_temporal.filter(
      (pt) => pt.filial_id === targetId
    );
    return filtered.map((pt) => ({
      dateLabel: formatShortDate(pt.data),
      rawDate: pt.data,
      precipitacao_mm: Number(pt.precipitacao_mm.toFixed(1)),
      vendas_sementes_qtd: Number(pt.vendas_sementes_qtd.toFixed(1)),
      vendas_nutricao_seca_qtd: Number(pt.vendas_nutricao_seca_qtd.toFixed(1)),
    }));
  }, [report.serie_temporal, activeBranch?.filial_id, effectiveBranchId]);

  const droughtBreakpointLabel = useMemo(() => {
    if (chartData.length > 30) {
      return chartData[chartData.length - 30]?.dateLabel;
    }
    return undefined;
  }, [chartData]);

  const handleBranchTabClick = (filialId: number): void => {
    setActiveChartBranchId(filialId);
    if (onSelectFilialId && selectedFilialId !== null) {
      onSelectFilialId(filialId);
    }
  };

  return (
    <section
      aria-label="Correlação precipitação versus giro de insumos"
      className="rounded-xl border border-white/[0.08] bg-[#171b19] p-6"
    >
      {/* Header & Branch Selector */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.06] pb-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-medium text-[#eef2ef]">
              Precipitação vs. giro de sementes e nutrição seca
            </h2>
            {activeBranch && (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#9aa59e]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    activeBranch.severidade === "CRITICA"
                      ? "bg-[#e5484d]"
                      : activeBranch.severidade === "MODERADA"
                      ? "bg-[#d99b26]"
                      : "bg-[#4cc38a]"
                  }`}
                  aria-hidden="true"
                />
                {activeBranch.severidade === "CRITICA"
                  ? "Estiagem severa"
                  : activeBranch.severidade === "MODERADA"
                  ? "Atenção climática"
                  : "Regime regular"}
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-[#9aa59e]">
            Série diária de chuva (mm) e saída de insumos nos últimos{" "}
            {report.dias_analise} dias
          </p>
        </div>

        {/* Branch Selector Tabs */}
        <div
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.08] bg-[#111413] p-1"
          role="tablist"
          aria-label="Selecionar filial no gráfico climático"
        >
          {ALL_BRANCH_TABS.map((tab) => {
            const branchInReport = report.filiais.find(
              (b) => b.filial_id === tab.filial_id
            );
            const isSelected =
              (activeBranch?.filial_id ?? effectiveBranchId) === tab.filial_id;
            const isCritical = branchInReport?.severidade === "CRITICA";
            return (
              <button
                key={tab.filial_id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleBranchTabClick(tab.filial_id)}
                className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/40 ${
                  isSelected
                    ? "bg-[#1f2421] text-[#eef2ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-[#9aa59e] hover:text-[#eef2ef]"
                }`}
              >
                <span>{tab.shortName}</span>
                {isCritical && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[#e5484d]"
                    title="Anomalia pluviométrica crítica"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Grid: Chart + Diagnostic Panel */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left 8 cols: Recharts ComposedChart */}
        <div className="xl:col-span-8">
          <div className="h-[340px] w-full rounded-lg border border-white/[0.06] bg-[#111413] p-3">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 12, right: 8, left: 0, bottom: 4 }}
                >
                  <defs>
                    <linearGradient
                      id="gradSementes"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="gradSeca" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d99b26" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#d99b26" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="rgba(238, 242, 239, 0.06)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dateLabel"
                    stroke="#68736c"
                    tick={{
                      fill: "#68736c",
                      fontSize: 11,
                      fontFamily: "var(--font-mono), monospace",
                    }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={20}
                  />
                  <YAxis
                    yAxisId="left"
                    width={40}
                    stroke="#68736c"
                    tick={{
                      fill: "#68736c",
                      fontSize: 11,
                      fontFamily: "var(--font-mono), monospace",
                    }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    width={40}
                    stroke="#68736c"
                    tick={{
                      fill: "#68736c",
                      fontSize: 11,
                      fontFamily: "var(--font-mono), monospace",
                    }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#171b19",
                      borderColor: "rgba(238, 242, 239, 0.1)",
                      borderRadius: "8px",
                      color: "#eef2ef",
                      fontSize: "12px",
                    }}
                    labelStyle={{
                      color: "#eef2ef",
                      fontWeight: 500,
                      marginBottom: "4px",
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: "12px",
                      paddingTop: "8px",
                      color: "#9aa59e",
                    }}
                  />
                  {droughtBreakpointLabel &&
                    activeBranch?.anomalia_detectada && (
                      <ReferenceLine
                        yAxisId="left"
                        x={droughtBreakpointLabel}
                        stroke="#e5484d"
                        strokeDasharray="4 4"
                        label={{
                          value: "Corte de chuva (-30d)",
                          position: "insideTopRight",
                          fill: "#e5484d",
                          fontSize: 11,
                        }}
                      />
                    )}
                  <Bar
                    yAxisId="right"
                    dataKey="precipitacao_mm"
                    name="Precipitação (mm)"
                    fill="#529cca"
                    fillOpacity={0.35}
                    radius={[2, 2, 0, 0]}
                    barSize={6}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="vendas_sementes_qtd"
                    name="Sementes de pastagem (un)"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#gradSementes)"
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="vendas_nutricao_seca_qtd"
                    name="Proteinado de seca (un)"
                    stroke="#d99b26"
                    strokeWidth={1.75}
                    fill="url(#gradSeca)"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#9aa59e]">
                Sem dados temporais para a filial selecionada
              </div>
            )}
          </div>
        </div>

        {/* Right 4 cols: Statistical Diagnostic Panel */}
        <div className="flex flex-col justify-between rounded-lg border border-white/[0.06] bg-[#111413] p-4 xl:col-span-4">
          {activeBranch ? (
            <>
              <div>
                <div className="flex items-baseline justify-between border-b border-white/[0.06] pb-3">
                  <div>
                    <p className="text-xs text-[#68736c]">
                      Diagnóstico da unidade
                    </p>
                    <h3 className="mt-0.5 text-sm font-medium text-[#eef2ef]">
                      {activeBranch.filial_nome}
                    </h3>
                  </div>
                  <span className="font-mono text-xs text-[#9aa59e]">
                    {activeBranch.microrregiao}
                  </span>
                </div>

                {/* Key Telemetry Metrics */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-md border border-white/[0.06] bg-[#171b19] p-3">
                    <p className="text-xs text-[#9aa59e]">
                      Chuva ({activeBranch.dias_analise}d)
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium text-[#eef2ef] tabular-nums">
                      {formatNumberBR(
                        activeBranch.precipitacao_media_periodo_mm,
                        1
                      )}{" "}
                      mm
                    </p>
                    <span className="font-mono text-[11px] text-[#68736c] tabular-nums">
                      Z = {formatNumberBR(activeBranch.precipitacao_z_score, 2)}
                    </span>
                  </div>

                  <div className="rounded-md border border-white/[0.06] bg-[#171b19] p-3">
                    <p className="text-xs text-[#9aa59e]">Sementes</p>
                    <p
                      className={`mt-1 font-mono text-sm font-medium tabular-nums ${
                        activeBranch.queda_sementes_pct < -25
                          ? "text-[#e5484d]"
                          : "text-[#eef2ef]"
                      }`}
                    >
                      {activeBranch.queda_sementes_pct > 0 ? "+" : ""}
                      {formatNumberBR(activeBranch.queda_sementes_pct, 1)}%
                    </p>
                    <span className="font-mono text-[11px] text-[#68736c]">
                      vs média
                    </span>
                  </div>

                  <div className="rounded-md border border-white/[0.06] bg-[#171b19] p-3">
                    <p className="text-xs text-[#9aa59e]">Prot. seca</p>
                    <p
                      className={`mt-1 font-mono text-sm font-medium tabular-nums ${
                        activeBranch.alta_nutricao_seca_pct > 25
                          ? "text-[#d99b26]"
                          : "text-[#eef2ef]"
                      }`}
                    >
                      {activeBranch.alta_nutricao_seca_pct > 0 ? "+" : ""}
                      {formatNumberBR(activeBranch.alta_nutricao_seca_pct, 1)}%
                    </p>
                    <span className="font-mono text-[11px] text-[#68736c]">
                      vs média
                    </span>
                  </div>
                </div>

                {/* Narrative Diagnostic */}
                <p className="mt-3 text-xs leading-relaxed text-[#9aa59e]">
                  {activeBranch.diagnostico}
                </p>
              </div>

              {/* Affected Products Breakdown */}
              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <div className="mb-2 flex items-center justify-between text-xs text-[#68736c]">
                  <span>Variação por insumo</span>
                  <span className="font-mono">Δ vendas / Z</span>
                </div>
                <div className="space-y-1">
                  {activeBranch.produtos_afetados.slice(0, 3).map((prod) => (
                    <div
                      key={prod.produto_id}
                      className="flex items-center justify-between rounded-md bg-[#171b19] px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-normal text-[#eef2ef]">
                          {prod.produto_nome}
                        </p>
                        <span className="font-mono text-[11px] text-[#68736c] tabular-nums">
                          {prod.categoria} · r ={" "}
                          {formatNumberBR(prod.correlacao_chuva_vendas, 2)}
                        </span>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <span
                          className={`font-medium ${
                            prod.status_anomalia === "QUEDA_SEVERA"
                              ? "text-[#e5484d]"
                              : prod.status_anomalia === "ALTA_ATIPICA"
                              ? "text-[#d99b26]"
                              : "text-[#4cc38a]"
                          }`}
                        >
                          {prod.variacao_vendas_pct > 0 ? "+" : ""}
                          {formatNumberBR(prod.variacao_vendas_pct, 1)}%
                        </span>
                        <p className="text-[11px] text-[#68736c]">
                          Z = {formatNumberBR(prod.vendas_z_score, 2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[#9aa59e]">
              Selecione uma filial para inspecionar o diagnóstico
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
