"use client";

import React, { useState } from "react";
import { Check } from "lucide-react";
import {
  ConsultantAffinityReport,
  StockRebalancingReport,
  formatCurrencyBRL,
  formatNumberBR,
} from "@/lib/api";

export interface RebalanceTableProps {
  remanejamento: StockRebalancingReport;
  afinidade: ConsultantAffinityReport;
  selectedFilialId?: number | null;
  onResetFilialFilter?: () => void;
  onSimulatePrompt?: (prompt: string) => void;
}

export function RebalanceTable({
  remanejamento,
  afinidade,
  selectedFilialId = null,
  onResetFilialFilter,
  onSimulatePrompt,
}: RebalanceTableProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<"remanejamento" | "afinidade">(
    "remanejamento"
  );
  const [approvedKeys, setApprovedKeys] = useState<Record<string, boolean>>({});

  const visibleRecomendacoes =
    selectedFilialId === null
      ? remanejamento.recomendacoes
      : remanejamento.recomendacoes.filter(
          (rec) =>
            rec.filial_origem_id === selectedFilialId ||
            rec.filial_destino_id === selectedFilialId
        );

  const visibleCobertura =
    selectedFilialId === null
      ? remanejamento.cobertura_filiais
          .filter((c) => c.status_cobertura !== "EQUILIBRADO")
          .slice(0, 4)
      : remanejamento.cobertura_filiais
          .filter((c) => c.filial_id === selectedFilialId)
          .slice(0, 4);

  const toggleApprove = (key: string): void => {
    setApprovedKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <section
      aria-label="Matriz de remanejamento de estoque e afinidade comercial"
      className="rounded-xl border border-white/[0.08] bg-[#171b19] p-6"
    >
      {/* Header & View Switcher */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.06] pb-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-base font-medium text-[#eef2ef]">
            Remanejamento de estoque e afinidade de consultores
          </h2>
          <p className="mt-1 text-[13px] text-[#9aa59e]">
            Transferência de lotes acima de {remanejamento.max_coverage_days}d
            para unidades com menos de {remanejamento.min_coverage_days}d de
            cobertura
          </p>
        </div>

        <div
          className="inline-flex rounded-lg border border-white/[0.08] bg-[#111413] p-1"
          role="tablist"
          aria-label="Alternar entre remanejamento de estoque e afinidade de consultores"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "remanejamento"}
            onClick={() => setActiveTab("remanejamento")}
            className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/40 ${
              activeTab === "remanejamento"
                ? "bg-[#1f2421] text-[#eef2ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "text-[#9aa59e] hover:text-[#eef2ef]"
            }`}
          >
            <span>Remanejamento</span>
            <span className="font-mono text-[11px] text-[#68736c] tabular-nums">
              {visibleRecomendacoes.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "afinidade"}
            onClick={() => setActiveTab("afinidade")}
            className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/40 ${
              activeTab === "afinidade"
                ? "bg-[#1f2421] text-[#eef2ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "text-[#9aa59e] hover:text-[#eef2ef]"
            }`}
          >
            <span>Consultores</span>
            <span className="font-mono text-[11px] text-[#68736c] tabular-nums">
              {afinidade.consultores.length}
            </span>
          </button>
        </div>
      </div>

      {/* Tab 1: Stock Rebalancing Table */}
      {activeTab === "remanejamento" && (
        <div className="mt-4">
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="rebalance-table-caption"
            className="responsive-table-wrapper overflow-x-auto rounded-lg border border-white/[0.06]"
          >
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <caption id="rebalance-table-caption" className="sr-only">
                Recomendações de transferência de estoque entre filiais com
                cobertura em dias, valor financeiro e consultor recomendado
              </caption>
              <thead className="sticky top-0 z-10 bg-[#111413] text-xs font-medium text-[#9aa59e]">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-20 border-b border-white/[0.08] bg-[#111413] px-4 py-3 font-medium"
                  >
                    Insumo e janela
                  </th>
                  <th
                    scope="col"
                    className="border-b border-white/[0.08] px-4 py-3 font-medium"
                  >
                    Origem → destino
                  </th>
                  <th
                    scope="col"
                    className="border-b border-white/[0.08] px-4 py-3 font-medium"
                  >
                    Cobertura (antes → após)
                  </th>
                  <th
                    scope="col"
                    className="border-b border-white/[0.08] px-4 py-3 text-right font-medium"
                  >
                    Lote e valor
                  </th>
                  <th
                    scope="col"
                    className="border-b border-white/[0.08] px-4 py-3 font-medium"
                  >
                    Consultor no destino
                  </th>
                  <th
                    scope="col"
                    className="border-b border-white/[0.08] px-4 py-3 text-right font-medium"
                  >
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] bg-[#171b19]">
                {visibleRecomendacoes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-xs text-[#9aa59e]"
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <p>
                          A filial selecionada opera com cobertura equilibrada
                          (entre {remanejamento.min_coverage_days}d e{" "}
                          {remanejamento.max_coverage_days}d)
                        </p>
                        {onResetFilialFilter && (
                          <button
                            type="button"
                            onClick={onResetFilialFilter}
                            className="inline-flex h-8 items-center rounded-md border border-white/[0.08] bg-[#1f2421] px-3 text-xs font-medium text-[#eef2ef] transition-colors duration-150 hover:border-white/[0.16]"
                          >
                            Mostrar todas as filiais
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  visibleRecomendacoes.map((rec) => {
                    const rowKey = `${rec.produto_id}-${rec.filial_origem_id}-${rec.filial_destino_id}`;
                    const isApproved = Boolean(approvedKeys[rowKey]);

                    return (
                      <tr
                        key={rowKey}
                        className="group transition-colors duration-150 hover:bg-[#1f2421]"
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-[#171b19] px-4 py-3 font-normal text-[#eef2ef] transition-colors duration-150 group-hover:bg-[#1f2421]"
                        >
                          <div className="flex flex-col">
                            <span className="text-[13px] font-medium text-[#eef2ef]">
                              {rec.produto_nome}
                            </span>
                            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#68736c]">
                              <span>{rec.categoria}</span>
                              {rec.risco_perda_janela_plantio && (
                                <span className="inline-flex items-center gap-1 text-[#e5484d]">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full bg-[#e5484d]"
                                    aria-hidden="true"
                                  />
                                  Janela {rec.janela_ideal_dias}d
                                </span>
                              )}
                            </div>
                          </div>
                        </th>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-[13px]">
                            <span className="text-[#9aa59e]">
                              {rec.filial_origem_nome.replace("Filial ", "")}
                            </span>
                            <span className="font-mono text-[#68736c]">→</span>
                            <span className="font-medium text-[#eef2ef]">
                              {rec.filial_destino_nome.replace("Filial ", "")}
                            </span>
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-[#68736c] tabular-nums">
                            Disp.{" "}
                            {formatNumberBR(
                              rec.estoque_origem_disponivel_qtd,
                              0
                            )}{" "}
                            un · Chuva destino{" "}
                            {formatNumberBR(
                              rec.precipitacao_destino_30d_mm,
                              1
                            )}{" "}
                            mm/d
                          </div>
                        </td>

                        <td className="px-4 py-3 font-mono tabular-nums">
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="w-14 text-[#68736c]">
                                Origem
                              </span>
                              <span className="text-[#e5484d]">
                                {formatNumberBR(
                                  rec.cobertura_origem_atual_dias,
                                  1
                                )}
                                d
                              </span>
                              <span className="text-[#68736c]">→</span>
                              <span className="text-[#eef2ef]">
                                {formatNumberBR(
                                  rec.cobertura_origem_pos_transferencia_dias,
                                  1
                                )}
                                d
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-14 text-[#68736c]">
                                Destino
                              </span>
                              <span className="text-[#d99b26]">
                                {formatNumberBR(
                                  rec.cobertura_destino_atual_dias,
                                  1
                                )}
                                d
                              </span>
                              <span className="text-[#68736c]">→</span>
                              <span className="text-[#4cc38a]">
                                {formatNumberBR(
                                  rec.cobertura_destino_pos_transferencia_dias,
                                  1
                                )}
                                d
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          <p className="text-[13px] font-medium text-[#eef2ef]">
                            {formatCurrencyBRL(rec.valor_financeiro_lote_reais)}
                          </p>
                          <span className="text-[11px] text-[#9aa59e]">
                            {formatNumberBR(rec.quantidade_sugerida, 0)} un ·{" "}
                            {formatCurrencyBRL(rec.preco_unitario)}/un
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <p className="text-[13px] font-medium text-[#eef2ef]">
                            {rec.consultor_recomendado_nome}
                          </p>
                          <div className="mt-1 font-mono text-[11px] text-[#9aa59e] tabular-nums">
                            {rec.consultor_recomendado_perfil} · Margem{" "}
                            <span className="text-[#eef2ef]">
                              {formatNumberBR(
                                rec.consultor_margem_media_produto_pct,
                                1
                              )}
                              %
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleApprove(rowKey)}
                              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] ${
                                isApproved
                                  ? "border border-white/[0.12] bg-[#1f2421] text-[#4cc38a]"
                                  : "bg-[#22c55e] text-[#0d0f0e] hover:bg-[#16a34a]"
                              }`}
                            >
                              {isApproved ? (
                                <>
                                  <Check
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.5}
                                    aria-hidden="true"
                                  />
                                  <span>Ordem emitida</span>
                                </>
                              ) : (
                                <span>Autorizar lote</span>
                              )}
                            </button>
                            {onSimulatePrompt && (
                              <button
                                type="button"
                                onClick={() =>
                                  onSimulatePrompt(
                                    `Detalhe o remanejamento de ${rec.produto_nome} da ${rec.filial_origem_nome} para a ${rec.filial_destino_nome} e por que ${rec.consultor_recomendado_nome} foi selecionado.`
                                  )
                                }
                                className="text-[11px] text-[#68736c] transition-colors duration-150 hover:text-[#eef2ef]"
                              >
                                Auditar no copiloto
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Snapshot of Stock Coverages */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {visibleCobertura.map((item) => (
              <div
                key={`${item.filial_id}-${item.produto_id}`}
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#111413] px-4 py-3 text-xs"
              >
                <div className="min-w-0 pr-2">
                  <p className="truncate font-medium text-[#eef2ef]">
                    {item.filial_nome.replace("Filial ", "")}
                  </p>
                  <p className="truncate text-[11px] text-[#9aa59e]">
                    {item.produto_nome}
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      item.status_cobertura === "EXCESSO_CRITICO"
                        ? "text-[#e5484d]"
                        : item.status_cobertura === "RUPTURA_IMINENTE"
                        ? "text-[#d99b26]"
                        : "text-[#4cc38a]"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        item.status_cobertura === "EXCESSO_CRITICO"
                          ? "bg-[#e5484d]"
                          : item.status_cobertura === "RUPTURA_IMINENTE"
                          ? "bg-[#d99b26]"
                          : "bg-[#4cc38a]"
                      }`}
                      aria-hidden="true"
                    />
                    {formatNumberBR(item.cobertura_atual_dias, 1)}d
                  </span>
                  <p className="mt-0.5 text-[11px] text-[#68736c]">
                    {item.status_cobertura === "EXCESSO_CRITICO"
                      ? "Excesso crítico"
                      : item.status_cobertura === "RUPTURA_IMINENTE"
                      ? "Ruptura iminente"
                      : "Cobertura regular"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Consultant Product Affinity Table */}
      {activeTab === "afinidade" && (
        <div className="mt-4">
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="affinity-table-caption"
            className="responsive-table-wrapper overflow-x-auto rounded-lg border border-white/[0.06]"
          >
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <caption id="affinity-table-caption" className="sr-only">
                Performance e afinidade de consultores por perfil técnico vs
                volume commodity
              </caption>
              <thead className="sticky top-0 z-10 bg-[#111413] text-xs font-medium text-[#9aa59e]">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-20 border-b border-white/[0.08] bg-[#111413] px-4 py-3 font-medium"
                  >
                    Consultor e filial
                  </th>
                  <th
                    scope="col"
                    className="border-b border-white/[0.08] px-4 py-3 font-medium"
                  >
                    Perfil comercial
                  </th>
                  <th
                    scope="col"
                    className="border-b border-white/[0.08] px-4 py-3 text-right font-medium"
                  >
                    Margem linhas técnicas
                  </th>
                  <th
                    scope="col"
                    className="border-b border-white/[0.08] px-4 py-3 text-right font-medium"
                  >
                    Diferencial vs commodity
                  </th>
                  <th
                    scope="col"
                    className="border-b border-white/[0.08] px-4 py-3 text-right font-medium"
                  >
                    Receita técnica
                  </th>
                  <th
                    scope="col"
                    className="border-b border-white/[0.08] px-4 py-3 font-medium"
                  >
                    Especialidade
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] bg-[#171b19]">
                {afinidade.consultores.map((cons) => {
                  const isSpecialist =
                    cons.perfil_foco === "Especialista Técnico";
                  return (
                    <tr
                      key={cons.consultor_id}
                      className="group transition-colors duration-150 hover:bg-[#1f2421]"
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-[#171b19] px-4 py-3 font-normal text-[#eef2ef] transition-colors duration-150 group-hover:bg-[#1f2421]"
                      >
                        <p className="text-[13px] font-medium text-[#eef2ef]">
                          {cons.consultor_nome}
                        </p>
                        <span className="text-xs text-[#9aa59e]">
                          {cons.filial_nome}
                        </span>
                      </th>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs ${
                            isSpecialist ? "text-[#eef2ef]" : "text-[#9aa59e]"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isSpecialist ? "bg-[#22c55e]" : "bg-[#68736c]"
                            }`}
                            aria-hidden="true"
                          />
                          {cons.perfil_foco}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-[#eef2ef] tabular-nums">
                        {formatNumberBR(cons.margem_linhas_tecnicas_pct, 1)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        <span
                          className={
                            cons.vantagem_margem_tecnica_vs_commodity_pct > 0
                              ? "text-[#4cc38a]"
                              : "text-[#9aa59e]"
                          }
                        >
                          {cons.vantagem_margem_tecnica_vs_commodity_pct > 0
                            ? "+"
                            : ""}
                          {formatNumberBR(
                            cons.vantagem_margem_tecnica_vs_commodity_pct,
                            1
                          )}
                          % margem
                        </span>
                        <p className="text-[11px] text-[#68736c]">
                          {cons.vantagem_conversao_tecnica_vs_commodity_pct > 0
                            ? "+"
                            : ""}
                          {formatNumberBR(
                            cons.vantagem_conversao_tecnica_vs_commodity_pct,
                            1
                          )}
                          % conversão
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#eef2ef] tabular-nums">
                        {formatCurrencyBRL(cons.receita_linhas_tecnicas)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#9aa59e]">
                        {cons.categoria_destaque}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
