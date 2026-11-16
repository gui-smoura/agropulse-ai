"use client";

import React from "react";
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
      aria-label="Indicadores operacionais"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {/* Card 1: Valor em risco de encalhe */}
      <article className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#171b19] p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-normal text-[#9aa59e]">
            Capital em risco de janela
          </p>
          <span className="font-mono text-xs text-[#68736c] tabular-nums">
            &gt; {remanejamento.max_coverage_days}d cobertura
          </span>
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <p
            className="text-[28px] font-medium leading-none text-[#eef2ef] tabular-nums"
            title={formatCurrencyBRL(scopedValorRisco)}
          >
            {formatCompactBRL(scopedValorRisco)}
          </p>
          <span className="text-sm font-normal text-[#9aa59e]">
            em estoque crítico
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
          <span className="truncate text-[#9aa59e]">
            {scopedOriginTransfer
              ? scopedOriginTransfer.filial_origem_nome
              : "Sem excesso crítico no escopo"}
          </span>
          {scopedOriginTransfer && (
            <span className="font-mono text-[#e5484d] tabular-nums">
              {formatNumberBR(
                scopedOriginTransfer.cobertura_origem_atual_dias,
                1
              )}
              d vs {remanejamento.max_coverage_days}d limite
            </span>
          )}
        </div>
      </article>

      {/* Card 2: Anomalias climáticas ativas */}
      <article className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#171b19] p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-normal text-[#9aa59e]">
            Anomalias pluviométricas
          </p>
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#68736c] tabular-nums">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                anomalias.total_anomalias_criticas > 0
                  ? "bg-[#e5484d]"
                  : "bg-[#4cc38a]"
              }`}
              aria-hidden="true"
            />
            {anomalias.total_anomalias_criticas > 0
              ? `Z = ${formatNumberBR(
                  criticalBranch?.precipitacao_z_score ?? 0,
                  2
                )}`
              : `${anomalias.dias_analise}d normal`}
          </span>
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <p className="text-[28px] font-medium leading-none text-[#eef2ef] tabular-nums">
            {anomalias.total_anomalias_criticas}
          </p>
          <span className="text-sm font-normal text-[#9aa59e]">
            {anomalias.filiais.length === 1
              ? "de 1 filial em estiagem"
              : `de ${anomalias.filiais.length} filiais em estiagem`}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
          {criticalBranch ? (
            <>
              <span className="truncate text-[#9aa59e]">
                Sementes{" "}
                <span
                  className={`font-mono tabular-nums ${
                    criticalBranch.queda_sementes_pct < -20
                      ? "text-[#e5484d]"
                      : "text-[#eef2ef]"
                  }`}
                >
                  {criticalBranch.queda_sementes_pct > 0 ? "+" : ""}
                  {formatNumberBR(criticalBranch.queda_sementes_pct, 1)}%
                </span>{" "}
                vs média
              </span>
              <span className="font-mono text-[#d99b26] tabular-nums">
                Seca {criticalBranch.alta_nutricao_seca_pct > 0 ? "+" : ""}
                {formatNumberBR(criticalBranch.alta_nutricao_seca_pct, 1)}%
              </span>
            </>
          ) : (
            <span className="text-[#9aa59e]">
              Regime pluviométrico regular nos últimos {anomalias.dias_analise}d
            </span>
          )}
        </div>
      </article>

      {/* Card 3: Lotes para remanejamento */}
      <article className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#171b19] p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-normal text-[#9aa59e]">
            Transferências sugeridas
          </p>
          <span className="font-mono text-xs text-[#68736c] tabular-nums">
            &gt;{remanejamento.max_coverage_days}d → &lt;
            {remanejamento.min_coverage_days}d
          </span>
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <p className="text-[28px] font-medium leading-none text-[#eef2ef] tabular-nums">
            {scopedTransfers.length}
          </p>
          <span className="text-sm font-normal text-[#9aa59e]">
            {scopedTransfers.length === 1
              ? "lote prioritário"
              : "lotes prioritários"}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
          {primaryTransfer ? (
            <>
              <span className="truncate text-[#9aa59e]">
                {primaryTransfer.filial_origem_nome.replace("Filial ", "")} →{" "}
                <span className="text-[#eef2ef]">
                  {primaryTransfer.filial_destino_nome.replace("Filial ", "")}
                </span>
              </span>
              <span className="font-mono text-[#eef2ef] tabular-nums">
                {formatNumberBR(primaryTransfer.quantidade_sugerida, 0)} un
              </span>
            </>
          ) : (
            <span className="text-[#9aa59e]">
              Estoque equilibrado na filial selecionada
            </span>
          )}
        </div>
      </article>

      {/* Card 4: Prêmio de afinidade técnica */}
      <article className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#171b19] p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-normal text-[#9aa59e]">
            Diferencial especialista técnico
          </p>
          <span className="font-mono text-xs text-[#68736c]">
            Sementes e defensivos
          </span>
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <p className="text-[28px] font-medium leading-none text-[#22c55e] tabular-nums">
            +{formatNumberBR(afinidade.vantagem_media_especialista_pct, 1)}%
          </p>
          <span className="text-sm font-normal text-[#9aa59e]">
            vs perfil commodity
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
          <span className="text-[#9aa59e]">
            Margem{" "}
            <span className="font-mono text-[#eef2ef] tabular-nums">
              {formatNumberBR(
                afinidade.margem_media_especialista_tecnico_pct,
                1
              )}
              %
            </span>{" "}
            vs{" "}
            <span className="font-mono tabular-nums">
              {formatNumberBR(afinidade.margem_media_volume_commodity_pct, 1)}%
            </span>
          </span>
          <span className="font-mono text-[#4cc38a] tabular-nums">
            +{formatNumberBR(afinidade.vantagem_conversao_especialista_pct, 1)}%
            conversão
          </span>
        </div>
      </article>
    </section>
  );
}
