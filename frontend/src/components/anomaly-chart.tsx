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
  AlertOctagon,
  CloudRain,
  Flame,
  Sprout,
  TrendingDown,
} from "lucide-react";
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
  { filial_id: 1, shortName: "Norte - Sinop" },
  { filial_id: 2, shortName: "Sul - Dourados" },
  { filial_id: 3, shortName: "Cerrado - Rio Verde" },
  { filial_id: 4, shortName: "Pantanal - Corumbá" },
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
      aria-label="Correlação Precipitação versus Giro de Insumos e Diagnóstico Z-Score"
      className="rounded-2xl border border-[#2a3f37] bg-[#1a2923] p-5 shadow-agro"
    >
      {/* Header & Branch Selector Pills */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.06] pb-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-[#f0fdf4]">
              Telemetria Pluviométrica (mm) vs. Giro de Sementes &amp; Nutrição
              Seca
            </h2>
            {activeBranch && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
                  activeBranch.severidade === "CRITICA"
                    ? "bg-red-500/15 text-[#ef4444]"
                    : activeBranch.severidade === "MODERADA"
                    ? "bg-amber-500/15 text-[#f59e0b]"
                    : "bg-emerald-500/15 text-[#22c55e]"
                }`}
              >
                {activeBranch.severidade === "CRITICA"
                  ? "ESTIAGEM SEVERA DETECTADA"
                  : activeBranch.severidade === "MODERADA"
                  ? "ATENÇÃO CLIMÁTICA"
                  : "REGIME PLUVIOMÉTRICO REGULAR"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#9cb8aa]">
            Série diária comparando precipitação (mm) com a velocidade de saída
            de Sementes de Pastagem e Proteinado de Seca (últimos{" "}
            {report.dias_analise} dias).
          </p>
        </div>

        {/* Branch Selector Tabs */}
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="tablist"
          aria-label="Selecionar filial no gráfico climático"
        >
          {ALL_BRANCH_TABS.map((tab) => {
            const branchInReport = report.filiais.find(
              (b) => b.filial_id === tab.filial_id
            );
            const isSelected =
              (activeBranch?.filial_id ?? effectiveBranchId) === tab.filial_id;
            const isCritical =
              branchInReport?.severidade === "CRITICA" ||
              (branchInReport === undefined && tab.filial_id === 1);
            return (
              <button
                key={tab.filial_id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleBranchTabClick(tab.filial_id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isSelected
                    ? "bg-[#22c55e] text-[#071a10] shadow-sm"
                    : "border border-[#2a3f37] bg-[#121e19] text-[#9cb8aa] hover:bg-[#22362f] hover:text-[#f0fdf4]"
                }`}
              >
                <span>{tab.shortName}</span>
                {isCritical && (
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isSelected ? "bg-[#071a10]" : "bg-[#ef4444]"
                    }`}
                    title="Anomalia Climática Monitorada"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Grid: Chart + Z-Score Diagnostic Panel */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left 8 cols: Recharts ComposedChart */}
        <div className="xl:col-span-8">
          <div className="h-[340px] w-full rounded-xl border border-[#2a3f37]/70 bg-[#121e19] p-3">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
                >
                  <defs>
                    <linearGradient
                      id="gradSementes"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="gradSeca" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="#2a3f37"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dateLabel"
                    stroke="#5d7d70"
                    tick={{ fill: "#9cb8aa", fontSize: 11 }}
                    tickLine={false}
                    minTickGap={18}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#5d7d70"
                    tick={{ fill: "#9cb8aa", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    label={{
                      value: "Vendas (un/dia)",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#9cb8aa",
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#38bdf8"
                    tick={{ fill: "#38bdf8", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    label={{
                      value: "Chuva (mm)",
                      angle: 90,
                      position: "insideRight",
                      fill: "#38bdf8",
                      fontSize: 11,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#121e19",
                      borderColor: "#2a3f37",
                      borderRadius: "12px",
                      color: "#f0fdf4",
                      fontSize: "12px",
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.7)",
                    }}
                    labelStyle={{
                      color: "#f0fdf4",
                      fontWeight: 600,
                      marginBottom: "4px",
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: "12px",
                      paddingTop: "8px",
                      color: "#9cb8aa",
                    }}
                  />
                  {droughtBreakpointLabel &&
                    activeBranch?.anomalia_detectada && (
                      <ReferenceLine
                        yAxisId="left"
                        x={droughtBreakpointLabel}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{
                          value: "Início Estiagem (-30d)",
                          position: "insideTopRight",
                          fill: "#ef4444",
                          fontSize: 11,
                        }}
                      />
                    )}
                  <Bar
                    yAxisId="right"
                    dataKey="precipitacao_mm"
                    name="Precipitação (mm)"
                    fill="#38bdf8"
                    fillOpacity={0.45}
                    radius={[3, 3, 0, 0]}
                    barSize={8}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="vendas_sementes_qtd"
                    name="Sementes de Pastagem (un)"
                    stroke="#22c55e"
                    strokeWidth={2.2}
                    fill="url(#gradSementes)"
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="vendas_nutricao_seca_qtd"
                    name="Nutrição Seca / Proteinado (un)"
                    stroke="#f59e0b"
                    strokeWidth={2.2}
                    fill="url(#gradSeca)"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#9cb8aa]">
                Sem dados temporais para a filial selecionada.
              </div>
            )}
          </div>
        </div>

        {/* Right 4 cols: Deterministic Z-Score Diagnostic Card */}
        <div className="flex flex-col justify-between rounded-xl border border-[#2a3f37] bg-[#121e19] p-4 xl:col-span-4">
          {activeBranch ? (
            <>
              <div>
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <div>
                    <span className="font-mono text-[11px] uppercase tracking-wider text-[#5d7d70]">
                      Diagnóstico Estatístico
                    </span>
                    <h3 className="text-base font-bold text-[#f0fdf4]">
                      {activeBranch.filial_nome}
                    </h3>
                  </div>
                  <span className="rounded-lg border border-[#2a3f37] bg-[#1a2923] px-2.5 py-1 font-mono text-xs font-semibold text-[#9cb8aa]">
                    {activeBranch.microrregiao}
                  </span>
                </div>

                {/* Key Telemetry Metrics */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-[#2a3f37]/60 bg-[#1a2923] p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-[#38bdf8]">
                      <CloudRain className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Chuva ({activeBranch.dias_analise}d)</span>
                    </div>
                    <p className="mt-1 font-mono text-sm font-bold text-[#f0fdf4] tabular-nums">
                      {formatNumberBR(
                        activeBranch.precipitacao_media_periodo_mm,
                        2
                      )}{" "}
                      mm
                    </p>
                    <span className="font-mono text-[10px] text-[#9cb8aa] tabular-nums">
                      Z = {formatNumberBR(activeBranch.precipitacao_z_score, 2)}
                    </span>
                  </div>

                  <div className="rounded-lg border border-[#2a3f37]/60 bg-[#1a2923] p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-[#22c55e]">
                      <Sprout className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Sementes</span>
                    </div>
                    <p
                      className={`mt-1 font-mono text-sm font-bold tabular-nums ${
                        activeBranch.queda_sementes_pct < -25
                          ? "text-[#ef4444]"
                          : "text-[#f0fdf4]"
                      }`}
                    >
                      {activeBranch.queda_sementes_pct > 0 ? "+" : ""}
                      {formatNumberBR(activeBranch.queda_sementes_pct, 1)}%
                    </p>
                    <span className="font-mono text-[10px] text-[#9cb8aa]">
                      vs. histórico
                    </span>
                  </div>

                  <div className="rounded-lg border border-[#2a3f37]/60 bg-[#1a2923] p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-[#f59e0b]">
                      <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Prot. Seca</span>
                    </div>
                    <p
                      className={`mt-1 font-mono text-sm font-bold tabular-nums ${
                        activeBranch.alta_nutricao_seca_pct > 25
                          ? "text-[#f59e0b]"
                          : "text-[#f0fdf4]"
                      }`}
                    >
                      {activeBranch.alta_nutricao_seca_pct > 0 ? "+" : ""}
                      {formatNumberBR(activeBranch.alta_nutricao_seca_pct, 1)}%
                    </p>
                    <span className="font-mono text-[10px] text-[#9cb8aa]">
                      vs. histórico
                    </span>
                  </div>
                </div>

                {/* Narrative Diagnostic */}
                <div className="mt-3 rounded-lg border border-[#2a3f37]/80 bg-[#16221d] p-3 text-xs leading-relaxed text-[#d8e6dd]">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-[#f0fdf4]">
                    <AlertOctagon
                      className={`h-3.5 w-3.5 ${
                        activeBranch.severidade === "CRITICA"
                          ? "text-[#ef4444]"
                          : "text-[#22c55e]"
                      }`}
                      aria-hidden="true"
                    />
                    <span>Síntese Determinística</span>
                  </div>
                  {activeBranch.diagnostico}
                </div>
              </div>

              {/* Affected Products Breakdown */}
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#9cb8aa]">
                  Produtos Monitorados na Filial (Z-Score)
                </p>
                <div className="space-y-1.5">
                  {activeBranch.produtos_afetados.slice(0, 3).map((prod) => (
                    <div
                      key={prod.produto_id}
                      className="flex items-center justify-between rounded-lg bg-[#1a2923] px-2.5 py-1.5 text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-medium text-[#f0fdf4]">
                          {prod.produto_nome}
                        </p>
                        <span className="text-[10px] text-[#9cb8aa]">
                          {prod.categoria} · Corr:{" "}
                          {formatNumberBR(prod.correlacao_chuva_vendas, 2)}
                        </span>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <span
                          className={`inline-flex items-center gap-0.5 font-semibold ${
                            prod.status_anomalia === "QUEDA_SEVERA"
                              ? "text-[#ef4444]"
                              : prod.status_anomalia === "ALTA_ATIPICA"
                              ? "text-[#f59e0b]"
                              : "text-[#22c55e]"
                          }`}
                        >
                          {prod.variacao_vendas_pct < 0 && (
                            <TrendingDown
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                          )}
                          {prod.variacao_vendas_pct > 0 ? "+" : ""}
                          {formatNumberBR(prod.variacao_vendas_pct, 1)}%
                        </span>
                        <p className="text-[10px] text-[#9cb8aa]">
                          Z = {formatNumberBR(prod.vendas_z_score, 2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[#9cb8aa]">
              Selecione uma filial para inspecionar o diagnóstico.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
