"use client";

import React from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Award,
  CloudRainWind,
  TrendingUp,
} from "lucide-react";
import {
  ClimateSalesAnomalyReport,
  ConsultantAffinityReport,
  StockRebalancingReport,
  formatCompactBRL,
  formatCurrencyBRL,
  formatNumberBR,
} from "@/lib/api";

export interface KpiCardsProps {
  anomalias: ClimateSalesAnomalyReport;
  remanejamento: StockRebalancingReport;
  afinidade: ConsultantAffinityReport;
  selectedFilialId?: number | null;
}

export function KpiCards({
  anomalias,
  remanejamento,
  afinidade,
  selectedFilialId = null,
}: KpiCardsProps): React.ReactElement {
  const criticalBranch =
    anomalias.filiais.find((f) => f.severidade === "CRITICA") ??
    anomalias.filiais[0];

  const scopedTransfers =
    selectedFilialId === null
      ? remanejamento.recomendacoes
      : remanejamento.recomendacoes.filter(
          (r) =>
            r.filial_origem_id === selectedFilialId ||
            r.filial_destino_id === selectedFilialId
        );

  const primaryTransfer = scopedTransfers[0];

  const scopedValorRisco =
    selectedFilialId === null
      ? remanejamento.total_valor_risco_encalhe_reais
      : remanejamento.cobertura_filiais
          .filter(
            (c) =>
              c.filial_id === selectedFilialId &&
              c.status_cobertura === "EXCESSO_CRITICO"
          )
          .reduce((acc, item) => {
            const unitPrice =
              remanejamento.recomendacoes.find(
                (r) => r.produto_id === item.produto_id
              )?.preco_unitario ?? 0;
            const thresholdDays = Math.min(
              remanejamento.max_coverage_days,
              item.janela_ideal_dias
            );
            const excessDays = Math.max(
              0,
              item.cobertura_atual_dias - thresholdDays
            );
            return (
              acc + excessDays * item.media_diaria_vendas_15d * unitPrice
            );
          }, 0);

  const scopedOriginTransfer =
    selectedFilialId === null
      ? primaryTransfer
      : remanejamento.recomendacoes.find(
          (r) => r.filial_origem_id === selectedFilialId
        );

  return (
    <section
      aria-label="Indicadores Executivos Principais"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {/* Card 1: Valor em Risco de Encalhe */}
      <article className="relative overflow-hidden rounded-2xl border border-[#2a3f37] bg-[#1a2923] p-5 shadow-agro transition-colors hover:border-[#355247]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#9cb8aa]">
              Valor em Risco de Encalhe
            </p>
            <span className="mt-0.5 inline-block font-mono text-[11px] text-[#5d7d70]">
              Cobertura &gt; {remanejamento.max_coverage_days}d · Janela Plantio
            </span>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              scopedValorRisco > 0
                ? "bg-red-500/15 text-[#ef4444]"
                : "bg-emerald-500/15 text-[#22c55e]"
            }`}
            title="Status de Risco de Perda de Janela Agronômica"
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {scopedValorRisco > 0 ? "Risco Janela" : "Controlado"}
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <p
            className="text-3xl font-bold tracking-tight text-[#f0fdf4] tabular-nums"
            title={formatCurrencyBRL(scopedValorRisco)}
          >
            {formatCompactBRL(scopedValorRisco)}
          </p>
          <span className="font-mono text-xs text-[#9cb8aa] tabular-nums">
            ({formatCurrencyBRL(scopedValorRisco)})
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
          <span className="text-[#9cb8aa]">
            {scopedOriginTransfer
              ? `Foco: ${scopedOriginTransfer.filial_origem_nome}`
              : "Sem excesso (>60d) no escopo"}
          </span>
          {scopedOriginTransfer && (
            <span className="font-mono font-semibold text-[#ef4444] tabular-nums">
              {formatNumberBR(
                scopedOriginTransfer.cobertura_origem_atual_dias,
                1
              )}
              d cobertura
            </span>
          )}
        </div>
      </article>

      {/* Card 2: Anomalias Climáticas Ativas */}
      <article className="relative overflow-hidden rounded-2xl border border-[#2a3f37] bg-[#1a2923] p-5 shadow-agro transition-colors hover:border-[#355247]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#9cb8aa]">
              Anomalias Climáticas Ativas
            </p>
            <span className="mt-0.5 inline-block font-mono text-[11px] text-[#5d7d70]">
              Janela móvel: últimos {anomalias.dias_analise} dias
            </span>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              anomalias.total_anomalias_criticas > 0
                ? "bg-red-500/15 text-[#ef4444]"
                : "bg-emerald-500/15 text-[#22c55e]"
            }`}
          >
            <CloudRainWind className="h-3.5 w-3.5" aria-hidden="true" />
            {anomalias.total_anomalias_criticas > 0
              ? `Z = ${formatNumberBR(
                  criticalBranch?.precipitacao_z_score ?? 0,
                  2
                )}`
              : "Normal"}
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-2.5">
          <p className="text-3xl font-bold tracking-tight text-[#f0fdf4] tabular-nums">
            {anomalias.total_anomalias_criticas}{" "}
            <span className="text-lg font-semibold text-[#9cb8aa]">
              {anomalias.total_anomalias_criticas === 1
                ? "Filial Crítica"
                : "Filiais Críticas"}
            </span>
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
          {criticalBranch ? (
            <>
              <span className="truncate text-[#9cb8aa]">
                {criticalBranch.filial_nome}: Sementes{" "}
                <strong
                  className={`tabular-nums ${
                    criticalBranch.queda_sementes_pct < -20
                      ? "text-[#ef4444]"
                      : "text-[#22c55e]"
                  }`}
                >
                  {criticalBranch.queda_sementes_pct > 0 ? "+" : ""}
                  {formatNumberBR(criticalBranch.queda_sementes_pct, 1)}%
                </strong>
              </span>
              <span className="font-mono font-semibold text-[#f59e0b] tabular-nums">
                Seca {criticalBranch.alta_nutricao_seca_pct > 0 ? "+" : ""}
                {formatNumberBR(criticalBranch.alta_nutricao_seca_pct, 1)}%
              </span>
            </>
          ) : (
            <span className="text-[#9cb8aa]">
              Regime pluviométrico estabilizado
            </span>
          )}
        </div>
      </article>

      {/* Card 3: Oportunidades de Remanejamento */}
      <article className="relative overflow-hidden rounded-2xl border border-[#2a3f37] bg-[#1a2923] p-5 shadow-agro transition-colors hover:border-[#355247]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#9cb8aa]">
              Oportunidades de Remanejamento
            </p>
            <span className="mt-0.5 inline-block font-mono text-[11px] text-[#5d7d70]">
              Gatilho &gt;{remanejamento.max_coverage_days}d → &lt;
              {remanejamento.min_coverage_days}d
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-[#f59e0b]">
            <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Transferência
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <p className="text-3xl font-bold tracking-tight text-[#f0fdf4] tabular-nums">
            {scopedTransfers.length}{" "}
            <span className="text-lg font-semibold text-[#9cb8aa]">
              {scopedTransfers.length === 1
                ? "Lote Prioritário"
                : "Lotes Prioritários"}
            </span>
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
          {primaryTransfer ? (
            <>
              <span className="truncate text-[#9cb8aa]">
                {primaryTransfer.filial_origem_nome.replace("Filial ", "")} →{" "}
                <strong className="text-[#f0fdf4]">
                  {primaryTransfer.filial_destino_nome.replace("Filial ", "")}
                </strong>
              </span>
              <span className="font-mono font-semibold text-[#22c55e] tabular-nums">
                {formatNumberBR(primaryTransfer.quantidade_sugerida, 0)} un.
              </span>
            </>
          ) : (
            <span className="text-[#9cb8aa]">
              Estoque balanceado no escopo selecionado
            </span>
          )}
        </div>
      </article>

      {/* Card 4: Prêmio de Afinidade Técnica */}
      <article className="relative overflow-hidden rounded-2xl border border-[#2a3f37] bg-[#1a2923] p-5 shadow-agro transition-colors hover:border-[#355247]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#9cb8aa]">
              Prêmio Especialista Técnico
            </p>
            <span className="mt-0.5 inline-block font-mono text-[11px] text-[#5d7d70]">
              Sementes Premium &amp; Defensivos
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-[#22c55e]">
            <Award className="h-3.5 w-3.5" aria-hidden="true" />
            Alta Conversão
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <p className="text-3xl font-bold tracking-tight text-[#22c55e] tabular-nums">
            +{formatNumberBR(afinidade.vantagem_media_especialista_pct, 1)}%
          </p>
          <span className="text-xs font-medium text-[#9cb8aa]">
            superioridade de margem
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
          <span className="text-[#9cb8aa]">
            Margem Técnica:{" "}
            <strong className="text-[#f0fdf4] tabular-nums">
              {formatNumberBR(
                afinidade.margem_media_especialista_tecnico_pct,
                1
              )}
              %
            </strong>{" "}
            vs.{" "}
            <span className="tabular-nums">
              {formatNumberBR(afinidade.margem_media_volume_commodity_pct, 1)}%
            </span>
          </span>
          <span className="inline-flex items-center gap-0.5 font-mono font-semibold text-[#22c55e] tabular-nums">
            <TrendingUp className="h-3 w-3" aria-hidden="true" />+
            {formatNumberBR(afinidade.vantagem_conversao_especialista_pct, 1)}%
            vol
          </span>
        </div>
      </article>
    </section>
  );
}
