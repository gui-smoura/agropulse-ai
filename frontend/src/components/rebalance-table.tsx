"use client";

import React, { useState } from "react";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  PackageCheck,
  ShieldAlert,
  Truck,
  UserCheck,
} from "lucide-react";
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
      aria-label="Matriz de Remanejamento de Estoque e Afinidade Comercial"
      className="rounded-2xl border border-[#2a3f37] bg-[#1a2923] p-5 shadow-agro"
    >
      {/* Header & View Switcher */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.06] pb-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-[#f0fdf4]">
              Matriz Logística de Remanejamento &amp; Afinidade de Consultores
            </h2>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#22c55e]">
              Engine Determinística
            </span>
          </div>
          <p className="mt-1 text-xs text-[#9cb8aa]">
            Transferência de lotes travados (Cobertura &gt;{" "}
            {remanejamento.max_coverage_days}d) para filiais em janela ativa
            (Cobertura &lt; {remanejamento.min_coverage_days}d) vinculada ao
            consultor campeão de conversão.
          </p>
        </div>

        <div
          className="inline-flex rounded-xl border border-[#2a3f37] bg-[#121e19] p-1"
          role="tablist"
          aria-label="Alternar entre Remanejamento de Estoque e Afinidade de Consultores"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "remanejamento"}
            onClick={() => setActiveTab("remanejamento")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "remanejamento"
                ? "bg-[#22c55e] text-[#071a10]"
                : "text-[#9cb8aa] hover:text-[#f0fdf4]"
            }`}
          >
            <Truck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Remanejamento ({visibleRecomendacoes.length})
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "afinidade"}
            onClick={() => setActiveTab("afinidade")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "afinidade"
                ? "bg-[#22c55e] text-[#071a10]"
                : "text-[#9cb8aa] hover:text-[#f0fdf4]"
            }`}
          >
            <Award className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Afinidade Consultores ({afinidade.consultores.length})
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
            className="responsive-table-wrapper overflow-x-auto rounded-xl border border-[#2a3f37]"
          >
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <caption id="rebalance-table-caption" className="sr-only">
                Recomendações de transferência de estoque entre filiais com
                cobertura em dias, valor financeiro e consultor recomendado
              </caption>
              <thead className="sticky top-0 z-10 bg-[#121e19] text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9cb8aa]">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-20 border-b border-[#2a3f37] bg-[#121e19] px-4 py-3"
                  >
                    Produto &amp; Janela
                  </th>
                  <th
                    scope="col"
                    className="border-b border-[#2a3f37] px-4 py-3"
                  >
                    Fluxo (Origem → Destino)
                  </th>
                  <th
                    scope="col"
                    className="border-b border-[#2a3f37] px-4 py-3"
                  >
                    Cobertura (Antes → Pós)
                  </th>
                  <th
                    scope="col"
                    className="border-b border-[#2a3f37] px-4 py-3 text-right"
                  >
                    Lote &amp; Valor Financeiro
                  </th>
                  <th
                    scope="col"
                    className="border-b border-[#2a3f37] px-4 py-3"
                  >
                    Consultor Recomendado (Destino)
                  </th>
                  <th
                    scope="col"
                    className="border-b border-[#2a3f37] px-4 py-3 text-right"
                  >
                    Decisão Executiva
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] bg-[#1a2923]">
                {visibleRecomendacoes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-xs text-[#9cb8aa]"
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <p>
                          A filial selecionada opera com cobertura de estoque
                          equilibrada (entre {remanejamento.min_coverage_days}d e{" "}
                          {remanejamento.max_coverage_days}d) sem necessidade de
                          transferência imediata.
                        </p>
                        {onResetFilialFilter && (
                          <button
                            type="button"
                            onClick={onResetFilialFilter}
                            className="rounded-lg border border-[#2a3f37] bg-[#121e19] px-3 py-1.5 text-xs font-semibold text-[#22c55e] transition-colors hover:bg-[#22362f]"
                          >
                            Ver Todas as Filiais da Rede →
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
                        className="group transition-colors hover:bg-[#22362f]"
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-[#1a2923] px-4 py-3.5 font-semibold text-[#f0fdf4] transition-colors group-hover:bg-[#22362f]"
                        >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-[#f0fdf4]">
                            {rec.produto_nome}
                          </span>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-[#121e19] px-1.5 py-0.5 font-mono text-[10px] text-[#9cb8aa]">
                              {rec.categoria}
                            </span>
                            {rec.risco_perda_janela_plantio && (
                              <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#ef4444]">
                                <ShieldAlert
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                                Janela {rec.janela_ideal_dias}d
                              </span>
                            )}
                          </div>
                        </div>
                      </th>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1">
                            <p className="font-semibold text-[#f0fdf4]">
                              {rec.filial_origem_nome}
                            </p>
                            <span className="font-mono text-[10px] text-[#ef4444] tabular-nums">
                              Estoque:{" "}
                              {formatNumberBR(
                                rec.estoque_origem_disponivel_qtd,
                                0
                              )}{" "}
                              un
                            </span>
                          </div>
                          <ArrowRight
                            className="h-4 w-4 shrink-0 text-[#22c55e]"
                            aria-hidden="true"
                          />
                          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1">
                            <p className="font-semibold text-[#f0fdf4]">
                              {rec.filial_destino_nome}
                            </p>
                            <span className="font-mono text-[10px] text-[#38bdf8] tabular-nums">
                              Chuva:{" "}
                              {formatNumberBR(
                                rec.precipitacao_destino_30d_mm,
                                1
                              )}{" "}
                              mm/d
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 font-mono tabular-nums">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-[#9cb8aa]">
                              Origem:
                            </span>
                            <span className="font-bold text-[#ef4444]">
                              {formatNumberBR(
                                rec.cobertura_origem_atual_dias,
                                1
                              )}
                              d
                            </span>
                            <span className="text-[#5d7d70]">→</span>
                            <span className="font-semibold text-[#22c55e]">
                              {formatNumberBR(
                                rec.cobertura_origem_pos_transferencia_dias,
                                1
                              )}
                              d
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-[#9cb8aa]">
                              Destino:
                            </span>
                            <span className="font-bold text-[#f59e0b]">
                              {formatNumberBR(
                                rec.cobertura_destino_atual_dias,
                                1
                              )}
                              d
                            </span>
                            <span className="text-[#5d7d70]">→</span>
                            <span className="font-semibold text-[#22c55e]">
                              {formatNumberBR(
                                rec.cobertura_destino_pos_transferencia_dias,
                                1
                              )}
                              d
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                        <p className="text-sm font-bold text-[#f0fdf4]">
                          {formatCurrencyBRL(rec.valor_financeiro_lote_reais)}
                        </p>
                        <span className="text-[11px] font-semibold text-[#22c55e]">
                          {formatNumberBR(rec.quantidade_sugerida, 0)} un. (
                          {formatCurrencyBRL(rec.preco_unitario)}/un)
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-start gap-2">
                          <UserCheck
                            className="mt-0.5 h-4 w-4 shrink-0 text-[#22c55e]"
                            aria-hidden="true"
                          />
                          <div>
                            <p className="font-semibold text-[#f0fdf4]">
                              {rec.consultor_recomendado_nome}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#22c55e]">
                                {rec.consultor_recomendado_perfil}
                              </span>
                              <span className="font-mono text-[11px] text-[#9cb8aa] tabular-nums">
                                Margem:{" "}
                                <strong className="text-[#f0fdf4]">
                                  {formatNumberBR(
                                    rec.consultor_margem_media_produto_pct,
                                    1
                                  )}
                                  %
                                </strong>
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleApprove(rowKey)}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                              isApproved
                                ? "border border-emerald-500/40 bg-emerald-500/20 text-[#4be277]"
                                : "bg-[#22c55e] text-[#071a10] hover:bg-[#16a34a]"
                            }`}
                          >
                            {isApproved ? (
                              <>
                                <CheckCircle2
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>Ordem Emitida</span>
                              </>
                            ) : (
                              <>
                                <PackageCheck
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>Autorizar Lote</span>
                              </>
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
                              className="text-[11px] font-medium text-[#9cb8aa] underline-offset-2 hover:text-[#f0fdf4] hover:underline"
                            >
                              Auditar no Copiloto →
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
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {visibleCobertura.map((item) => (
              <div
                key={`${item.filial_id}-${item.produto_id}`}
                className="flex items-center justify-between rounded-xl border border-[#2a3f37] bg-[#121e19] px-3.5 py-2.5 text-xs"
              >
                <div className="min-w-0 pr-2">
                  <p className="truncate font-semibold text-[#f0fdf4]">
                    {item.filial_nome.replace("Filial ", "")}
                  </p>
                  <p className="truncate text-[11px] text-[#9cb8aa]">
                    {item.produto_nome}
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      item.status_cobertura === "EXCESSO_CRITICO"
                        ? "bg-red-500/15 text-[#ef4444]"
                        : item.status_cobertura === "RUPTURA_IMINENTE"
                        ? "bg-amber-500/15 text-[#f59e0b]"
                        : "bg-emerald-500/15 text-[#22c55e]"
                    }`}
                  >
                    {formatNumberBR(item.cobertura_atual_dias, 1)} dias
                  </span>
                  <p className="mt-0.5 text-[10px] text-[#5d7d70]">
                    {item.status_cobertura === "EXCESSO_CRITICO"
                      ? "Excesso Crítico"
                      : item.status_cobertura === "RUPTURA_IMINENTE"
                      ? "Ruptura Iminente"
                      : "Cobertura Regular"}
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
            className="responsive-table-wrapper overflow-x-auto rounded-xl border border-[#2a3f37]"
          >
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <caption id="affinity-table-caption" className="sr-only">
                Performance e afinidade de consultores por perfil técnico vs
                volume commodity
              </caption>
              <thead className="sticky top-0 z-10 bg-[#121e19] text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9cb8aa]">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-20 border-b border-[#2a3f37] bg-[#121e19] px-4 py-3"
                  >
                    Consultor &amp; Filial
                  </th>
                  <th
                    scope="col"
                    className="border-b border-[#2a3f37] px-4 py-3"
                  >
                    Perfil de Foco
                  </th>
                  <th
                    scope="col"
                    className="border-b border-[#2a3f37] px-4 py-3 text-right"
                  >
                    Margem Linhas Técnicas
                  </th>
                  <th
                    scope="col"
                    className="border-b border-[#2a3f37] px-4 py-3 text-right"
                  >
                    Vantagem vs. Commodity
                  </th>
                  <th
                    scope="col"
                    className="border-b border-[#2a3f37] px-4 py-3 text-right"
                  >
                    Receita Linhas Técnicas
                  </th>
                  <th
                    scope="col"
                    className="border-b border-[#2a3f37] px-4 py-3"
                  >
                    Especialidade Principal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] bg-[#1a2923]">
                {afinidade.consultores.map((cons) => {
                  const isSpecialist =
                    cons.perfil_foco === "Especialista Técnico";
                  return (
                    <tr
                      key={cons.consultor_id}
                      className="group transition-colors hover:bg-[#22362f]"
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-[#1a2923] px-4 py-3 font-semibold text-[#f0fdf4] transition-colors group-hover:bg-[#22362f]"
                      >
                        <p className="text-sm font-semibold text-[#f0fdf4]">
                          {cons.consultor_nome}
                        </p>
                        <span className="text-[11px] font-normal text-[#9cb8aa]">
                          {cons.filial_nome}
                        </span>
                      </th>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            isSpecialist
                              ? "bg-emerald-500/15 text-[#22c55e]"
                              : "bg-amber-500/15 text-[#f59e0b]"
                          }`}
                        >
                          {cons.perfil_foco}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#f0fdf4] tabular-nums">
                        {formatNumberBR(cons.margem_linhas_tecnicas_pct, 2)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        <span
                          className={`font-semibold ${
                            cons.vantagem_margem_tecnica_vs_commodity_pct > 0
                              ? "text-[#22c55e]"
                              : "text-[#9cb8aa]"
                          }`}
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
                        <p className="text-[10px] text-[#9cb8aa]">
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
                      <td className="px-4 py-3 text-right font-mono text-[#f0fdf4] tabular-nums">
                        {formatCurrencyBRL(cons.receita_linhas_tecnicas)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-lg border border-[#2a3f37] bg-[#121e19] px-2.5 py-1 font-mono text-[11px] text-[#d8e6dd]">
                          {cons.categoria_destaque}
                        </span>
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
