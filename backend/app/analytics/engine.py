"""Pure deterministic mathematical and statistical engine for AgroPulse AI.

All aggregations, Z-scores, correlations, consultant affinities, and stock coverage
calculations happen here using SQLAlchemy 2.0 + Pandas/NumPy and return validated
Pydantic models. The LLM never performs math.
"""

from datetime import timedelta

import numpy as np
import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.schemas import (
    BranchClimateAnomaly,
    BranchStockCoverageItem,
    CategoryAffinityMetric,
    ClimateSalesAnomalyReport,
    ConsultantAffinityItem,
    ConsultantAffinityReport,
    DailyClimateSalesPoint,
    ProductSalesAnomaly,
    StockRebalancingReport,
    StockTransferRecommendation,
)
from app.database.models import (
    Consultor,
    Filial,
    PosicaoEstoqueClima,
    Produto,
    RegistroVenda,
    SessionLocal,
)

TECHNICAL_CATEGORIES = ("Sementes", "Defensivos")


def _safe_z_score(recent_mean: float, hist_mean: float, hist_std: float) -> float:
    """Compute Z-score safely, guarding against near-zero standard deviation."""
    if hist_std <= 1e-6 or np.isnan(hist_std):
        return 0.0
    return float((recent_mean - hist_mean) / hist_std)


def _safe_correlation(series_a: pd.Series, series_b: pd.Series) -> float:
    """Compute Pearson correlation safely, returning 0.0 on constant series."""
    if len(series_a) < 3 or series_a.std() <= 1e-6 or series_b.std() <= 1e-6:
        return 0.0
    corr = float(np.corrcoef(series_a.to_numpy(dtype=float), series_b.to_numpy(dtype=float))[0, 1])
    if np.isnan(corr):
        return 0.0
    return round(corr, 4)


def detect_climate_sales_anomalies(
    filial_id: int | None = None,
    dias_analise: int = 30,
    session: Session | None = None,
) -> ClimateSalesAnomalyReport:
    """Calculate precipitation and sales Z-scores vs. historical baseline."""
    if dias_analise <= 0:
        raise ValueError("dias_analise must be greater than 0.")

    owns_session = session is None
    db = session or SessionLocal()
    try:
        max_date = db.scalar(select(func.max(PosicaoEstoqueClima.data)))
        if max_date is None:
            return ClimateSalesAnomalyReport(
                dias_analise=dias_analise,
                total_anomalias_criticas=0,
                filiais=[],
                serie_temporal=[],
            )

        filiais_stmt = select(Filial).order_by(Filial.id)
        if filial_id is not None:
            filiais_stmt = filiais_stmt.where(Filial.id == filial_id)
        filiais_rows = list(db.scalars(filiais_stmt).all())
        if not filiais_rows:
            return ClimateSalesAnomalyReport(
                dias_analise=dias_analise,
                total_anomalias_criticas=0,
                filiais=[],
                serie_temporal=[],
            )

        produtos_map = {p.id: p for p in db.scalars(select(Produto).order_by(Produto.id)).all()}
        target_filial_ids = [f.id for f in filiais_rows]

        clima_rows = db.execute(
            select(
                PosicaoEstoqueClima.data,
                PosicaoEstoqueClima.filial_id,
                func.avg(PosicaoEstoqueClima.precipitacao_mm).label("precipitacao_mm"),
            )
            .where(PosicaoEstoqueClima.filial_id.in_(target_filial_ids))
            .group_by(PosicaoEstoqueClima.data, PosicaoEstoqueClima.filial_id)
        ).all()

        vendas_rows = db.execute(
            select(
                RegistroVenda.data,
                RegistroVenda.filial_id,
                RegistroVenda.produto_id,
                func.sum(RegistroVenda.quantidade_vendida).label("quantidade_vendida"),
            )
            .where(RegistroVenda.filial_id.in_(target_filial_ids))
            .group_by(RegistroVenda.data, RegistroVenda.filial_id, RegistroVenda.produto_id)
        ).all()

        df_clima = pd.DataFrame(
            clima_rows, columns=["data", "filial_id", "precipitacao_mm"]
        )
        df_vendas = pd.DataFrame(
            vendas_rows, columns=["data", "filial_id", "produto_id", "quantidade_vendida"]
        )

        cutoff_date = max_date - timedelta(days=dias_analise - 1)
        corr_cutoff_date = max_date - timedelta(days=max(dias_analise * 3, 90) - 1)

        branch_anomalies: list[BranchClimateAnomaly] = []
        serie_temporal: list[DailyClimateSalesPoint] = []
        total_criticas = 0

        for filial in filiais_rows:
            f_clima = df_clima[df_clima["filial_id"] == filial.id].sort_values("data")
            f_vendas = df_vendas[df_vendas["filial_id"] == filial.id].sort_values("data")

            hist_clima = f_clima[f_clima["data"] < cutoff_date]
            rec_clima = f_clima[f_clima["data"] >= cutoff_date]
            if hist_clima.empty:
                hist_clima = f_clima

            rain_hist_mean = float(hist_clima["precipitacao_mm"].mean())
            rain_hist_std = float(hist_clima["precipitacao_mm"].std(ddof=1))
            rain_rec_mean = (
                float(rec_clima["precipitacao_mm"].mean()) if not rec_clima.empty else 0.0
            )
            rain_var_pct = (
                ((rain_rec_mean - rain_hist_mean) / rain_hist_mean) * 100.0
                if rain_hist_mean > 0
                else 0.0
            )
            rain_z = _safe_z_score(rain_rec_mean, rain_hist_mean, rain_hist_std)

            produtos_afetados: list[ProductSalesAnomaly] = []
            sementes_vars: list[float] = []
            nutricao_seca_vars: list[float] = []

            for prod_id, produto in produtos_map.items():
                p_vendas = f_vendas[f_vendas["produto_id"] == prod_id]
                if p_vendas.empty:
                    continue

                daily_merged = pd.merge(
                    f_clima[["data", "filial_id", "precipitacao_mm"]],
                    p_vendas[["data", "filial_id", "quantidade_vendida"]],
                    on=["data", "filial_id"],
                    how="left",
                )
                daily_merged["quantidade_vendida"] = daily_merged["quantidade_vendida"].fillna(0.0)

                p_hist = daily_merged[daily_merged["data"] < cutoff_date]
                p_rec = daily_merged[daily_merged["data"] >= cutoff_date]
                if p_hist.empty:
                    p_hist = daily_merged

                v_hist_mean = float(p_hist["quantidade_vendida"].mean())
                v_hist_std = float(p_hist["quantidade_vendida"].std(ddof=1))
                v_rec_mean = float(p_rec["quantidade_vendida"].mean()) if not p_rec.empty else 0.0
                v_var_pct = (
                    ((v_rec_mean - v_hist_mean) / v_hist_mean) * 100.0
                    if v_hist_mean > 0
                    else 0.0
                )
                v_z = _safe_z_score(v_rec_mean, v_hist_mean, v_hist_std)

                merged_corr = daily_merged[daily_merged["data"] >= corr_cutoff_date]
                corr_val = _safe_correlation(
                    merged_corr["precipitacao_mm"], merged_corr["quantidade_vendida"]
                )

                if v_z <= -1.8 or v_var_pct <= -40.0:
                    status_anomalia = "QUEDA_SEVERA"
                elif v_z >= 1.8 or v_var_pct >= 40.0:
                    status_anomalia = "ALTA_ATIPICA"
                else:
                    status_anomalia = "NORMAL"

                if produto.categoria == "Sementes":
                    sementes_vars.append(v_var_pct)
                elif produto.categoria == "Nutrição Seca":
                    nutricao_seca_vars.append(v_var_pct)

                produtos_afetados.append(
                    ProductSalesAnomaly(
                        produto_id=prod_id,
                        produto_nome=produto.nome,
                        categoria=produto.categoria,
                        media_diaria_historica=round(v_hist_mean, 2),
                        media_diaria_periodo=round(v_rec_mean, 2),
                        variacao_vendas_pct=round(v_var_pct, 2),
                        vendas_z_score=round(v_z, 2),
                        correlacao_chuva_vendas=corr_val,
                        status_anomalia=status_anomalia,
                    )
                )

            queda_sementes_pct = float(np.mean(sementes_vars)) if sementes_vars else 0.0
            alta_nutricao_seca_pct = (
                float(np.mean(nutricao_seca_vars)) if nutricao_seca_vars else 0.0
            )

            is_critical = (
                rain_z <= -2.0
                and queda_sementes_pct <= -50.0
                and alta_nutricao_seca_pct >= 40.0
            )
            is_moderate = (
                not is_critical
                and (abs(rain_z) >= 1.5 or abs(queda_sementes_pct) >= 30.0)
            )

            if is_critical:
                severidade = "CRITICA"
                anomalia_detectada = True
                total_criticas += 1
                diagnostico = (
                    f"Estiagem severa detectada em {filial.nome} (Z={rain_z:.2f}, "
                    f"chuva {rain_var_pct:.1f}% vs histórico). Retração de "
                    f"{abs(queda_sementes_pct):.1f}% em Sementes e disparo de "
                    f"+{alta_nutricao_seca_pct:.1f}% em Nutrição Seca (Proteinado)."
                )
            elif is_moderate:
                severidade = "MODERADA"
                anomalia_detectada = True
                diagnostico = (
                    f"Oscilação climática moderada em {filial.nome} (Z={rain_z:.2f}). "
                    f"Monitorar giro de sementes e suplementação."
                )
            else:
                severidade = "NORMAL"
                anomalia_detectada = False
                diagnostico = (
                    f"Regime pluviométrico regular em {filial.nome} "
                    f"({rain_rec_mean:.1f} mm/dia) e demanda alinhada à sazonalidade."
                )

            branch_anomalies.append(
                BranchClimateAnomaly(
                    filial_id=filial.id,
                    filial_nome=filial.nome,
                    microrregiao=filial.microrregiao,
                    dias_analise=dias_analise,
                    precipitacao_media_historica_mm=round(rain_hist_mean, 2),
                    precipitacao_media_periodo_mm=round(rain_rec_mean, 2),
                    variacao_precipitacao_pct=round(rain_var_pct, 2),
                    precipitacao_z_score=round(rain_z, 2),
                    queda_sementes_pct=round(queda_sementes_pct, 2),
                    alta_nutricao_seca_pct=round(alta_nutricao_seca_pct, 2),
                    anomalia_detectada=anomalia_detectada,
                    severidade=severidade,
                    diagnostico=diagnostico,
                    produtos_afetados=produtos_afetados,
                )
            )

            # Build daily time series for the analysis window
            sementes_ids = [
                pid for pid, p in produtos_map.items() if p.categoria == "Sementes"
            ]
            seca_ids = [
                pid for pid, p in produtos_map.items() if p.categoria == "Nutrição Seca"
            ]

            rec_vendas = f_vendas[f_vendas["data"] >= cutoff_date]
            sem_daily = (
                rec_vendas[rec_vendas["produto_id"].isin(sementes_ids)]
                .groupby("data")["quantidade_vendida"]
                .sum()
            )
            seca_daily = (
                rec_vendas[rec_vendas["produto_id"].isin(seca_ids)]
                .groupby("data")["quantidade_vendida"]
                .sum()
            )

            for _, row in rec_clima.iterrows():
                d_val = row["data"]
                serie_temporal.append(
                    DailyClimateSalesPoint(
                        data=d_val,
                        filial_id=filial.id,
                        filial_nome=filial.nome,
                        precipitacao_mm=round(float(row["precipitacao_mm"]), 2),
                        vendas_sementes_qtd=round(float(sem_daily.get(d_val, 0.0)), 2),
                        vendas_nutricao_seca_qtd=round(float(seca_daily.get(d_val, 0.0)), 2),
                    )
                )

        return ClimateSalesAnomalyReport(
            dias_analise=dias_analise,
            total_anomalias_criticas=total_criticas,
            filiais=branch_anomalies,
            serie_temporal=serie_temporal,
        )
    finally:
        if owns_session:
            db.close()


def analyze_consultant_product_affinity(
    filial_id: int | None = None,
    session: Session | None = None,
) -> ConsultantAffinityReport:
    """Cross volume, revenue, and average margin by consultant and product category."""
    owns_session = session is None
    db = session or SessionLocal()
    try:
        stmt = (
            select(
                Consultor.id.label("consultor_id"),
                Consultor.nome.label("consultor_nome"),
                Consultor.filial_id,
                Consultor.perfil_foco,
                Filial.nome.label("filial_nome"),
                Produto.categoria,
                func.sum(RegistroVenda.quantidade_vendida).label("quantidade_total"),
                func.sum(RegistroVenda.quantidade_vendida * Produto.preco_unitario).label(
                    "receita_total"
                ),
                func.sum(
                    RegistroVenda.quantidade_vendida * RegistroVenda.margem_aplicada_pct
                ).label("margem_ponderada_num"),
            )
            .join(Filial, Consultor.filial_id == Filial.id)
            .join(RegistroVenda, RegistroVenda.consultor_id == Consultor.id)
            .join(Produto, RegistroVenda.produto_id == Produto.id)
            .group_by(
                Consultor.id,
                Consultor.nome,
                Consultor.filial_id,
                Consultor.perfil_foco,
                Filial.nome,
                Produto.categoria,
            )
        )
        if filial_id is not None:
            stmt = stmt.where(Consultor.filial_id == filial_id)

        rows = db.execute(stmt).all()
        if not rows:
            return ConsultantAffinityReport(
                margem_media_especialista_tecnico_pct=0.0,
                margem_media_volume_commodity_pct=0.0,
                vantagem_media_especialista_pct=0.0,
                vantagem_conversao_especialista_pct=0.0,
                consultores=[],
            )

        cat_df = pd.DataFrame(
            rows,
            columns=[
                "consultor_id",
                "consultor_nome",
                "filial_id",
                "perfil_foco",
                "filial_nome",
                "categoria",
                "quantidade_total",
                "receita_total",
                "margem_ponderada_num",
            ],
        )
        cat_df["margem_media_pct"] = np.where(
            cat_df["quantidade_total"] > 0,
            cat_df["margem_ponderada_num"] / cat_df["quantidade_total"],
            0.0,
        )

        # Compute branch category totals for share calculation
        branch_cat_totals = (
            cat_df.groupby(["filial_id", "categoria"])["receita_total"]
            .sum()
            .to_dict()
        )

        # Benchmark technical lines across profiles
        tech_df = cat_df[cat_df["categoria"].isin(TECHNICAL_CATEGORIES)]
        comm_tech_df = tech_df[tech_df["perfil_foco"] == "Volume/Commodity"]
        spec_tech_df = tech_df[tech_df["perfil_foco"] == "Especialista Técnico"]

        comm_tech_margin = (
            float(
                comm_tech_df["margem_ponderada_num"].sum()
                / comm_tech_df["quantidade_total"].sum()
            )
            if not comm_tech_df.empty and comm_tech_df["quantidade_total"].sum() > 0
            else 1.0
        )
        spec_tech_margin = (
            float(
                spec_tech_df["margem_ponderada_num"].sum()
                / spec_tech_df["quantidade_total"].sum()
            )
            if not spec_tech_df.empty and spec_tech_df["quantidade_total"].sum() > 0
            else 0.0
        )

        comm_tech_vol_per_consultant = (
            float(
                comm_tech_df.groupby("consultor_id")["quantidade_total"].sum().mean()
            )
            if not comm_tech_df.empty
            else 1.0
        )
        spec_tech_vol_per_consultant = (
            float(
                spec_tech_df.groupby("consultor_id")["quantidade_total"].sum().mean()
            )
            if not spec_tech_df.empty
            else 0.0
        )

        vantagem_media_especialista_pct = (
            ((spec_tech_margin / comm_tech_margin) - 1.0) * 100.0
            if comm_tech_margin > 0
            else 0.0
        )
        vantagem_conversao_especialista_pct = (
            ((spec_tech_vol_per_consultant / comm_tech_vol_per_consultant) - 1.0) * 100.0
            if comm_tech_vol_per_consultant > 0
            else 0.0
        )

        # Per-branch commodity technical volume for branch-level comparison
        branch_comm_tech_vol: dict[int, float] = (
            comm_tech_df.groupby("filial_id")["quantidade_total"].sum().to_dict()
            if not comm_tech_df.empty
            else {}
        )
        branch_comm_tech_margin: dict[int, float] = {}
        if not comm_tech_df.empty:
            for fid, grp in comm_tech_df.groupby("filial_id"):
                q_sum = float(grp["quantidade_total"].sum())
                branch_comm_tech_margin[int(fid)] = (
                    float(grp["margem_ponderada_num"].sum()) / q_sum
                    if q_sum > 0
                    else comm_tech_margin
                )

        consultores_items: list[ConsultantAffinityItem] = []
        for cid, c_grp in cat_df.groupby("consultor_id"):
            first = c_grp.iloc[0]
            f_id = int(first["filial_id"])
            vol_total = float(c_grp["quantidade_total"].sum())
            rec_total = float(c_grp["receita_total"].sum())
            margem_geral = (
                float(c_grp["margem_ponderada_num"].sum()) / vol_total
                if vol_total > 0
                else 0.0
            )

            c_tech = c_grp[c_grp["categoria"].isin(TECHNICAL_CATEGORIES)]
            vol_tech = float(c_tech["quantidade_total"].sum())
            rec_tech = float(c_tech["receita_total"].sum())
            margem_tech = (
                float(c_tech["margem_ponderada_num"].sum()) / vol_tech
                if vol_tech > 0
                else 0.0
            )

            ref_comm_margin = branch_comm_tech_margin.get(f_id, comm_tech_margin)
            ref_comm_vol = branch_comm_tech_vol.get(f_id, comm_tech_vol_per_consultant)

            vantagem_margem = (
                ((margem_tech / ref_comm_margin) - 1.0) * 100.0
                if ref_comm_margin > 0
                else 0.0
            )
            vantagem_conversao = (
                ((vol_tech / ref_comm_vol) - 1.0) * 100.0
                if ref_comm_vol > 0
                else 0.0
            )

            categorias_list: list[CategoryAffinityMetric] = []
            for _, cat_row in c_grp.sort_values("receita_total", ascending=False).iterrows():
                cat_name = str(cat_row["categoria"])
                cat_rec = float(cat_row["receita_total"])
                branch_tot = float(branch_cat_totals.get((f_id, cat_name), cat_rec))
                share_pct = (cat_rec / branch_tot) * 100.0 if branch_tot > 0 else 0.0
                categorias_list.append(
                    CategoryAffinityMetric(
                        categoria=cat_name,
                        quantidade_total=round(float(cat_row["quantidade_total"]), 2),
                        receita_total=round(cat_rec, 2),
                        margem_media_pct=round(float(cat_row["margem_media_pct"]), 2),
                        participacao_receita_filial_pct=round(share_pct, 2),
                    )
                )

            categoria_destaque = (
                categorias_list[0].categoria if categorias_list else "N/A"
            )

            consultores_items.append(
                ConsultantAffinityItem(
                    consultor_id=int(cid),
                    consultor_nome=str(first["consultor_nome"]),
                    filial_id=f_id,
                    filial_nome=str(first["filial_nome"]),
                    perfil_foco=str(first["perfil_foco"]),
                    volume_total=round(vol_total, 2),
                    receita_total=round(rec_total, 2),
                    margem_media_geral_pct=round(margem_geral, 2),
                    margem_linhas_tecnicas_pct=round(margem_tech, 2),
                    volume_linhas_tecnicas=round(vol_tech, 2),
                    receita_linhas_tecnicas=round(rec_tech, 2),
                    vantagem_margem_tecnica_vs_commodity_pct=round(vantagem_margem, 2),
                    vantagem_conversao_tecnica_vs_commodity_pct=round(vantagem_conversao, 2),
                    categoria_destaque=categoria_destaque,
                    categorias=categorias_list,
                )
            )

        consultores_items.sort(
            key=lambda item: (item.margem_linhas_tecnicas_pct, item.receita_linhas_tecnicas),
            reverse=True,
        )

        return ConsultantAffinityReport(
            margem_media_especialista_tecnico_pct=round(spec_tech_margin, 2),
            margem_media_volume_commodity_pct=round(comm_tech_margin, 2),
            vantagem_media_especialista_pct=round(vantagem_media_especialista_pct, 2),
            vantagem_conversao_especialista_pct=round(vantagem_conversao_especialista_pct, 2),
            consultores=consultores_items,
        )
    finally:
        if owns_session:
            db.close()


def recommend_stock_rebalancing(
    max_coverage_days: int = 60,
    min_coverage_days: int = 10,
    session: Session | None = None,
) -> StockRebalancingReport:
    """Recommend stock transfers between overstocked and understocked branches.

    Formula:
        Cobertura em Dias = Estoque Disponível / Média Diária de Vendas (últimos 15 dias)
    """
    if min_coverage_days <= 0 or max_coverage_days <= min_coverage_days:
        raise ValueError(
            "Invalid coverage thresholds: require 0 < min_coverage_days < max_coverage_days."
        )

    owns_session = session is None
    db = session or SessionLocal()
    try:
        max_date = db.scalar(select(func.max(PosicaoEstoqueClima.data)))
        if max_date is None:
            return StockRebalancingReport(
                max_coverage_days=max_coverage_days,
                min_coverage_days=min_coverage_days,
                total_valor_risco_encalhe_reais=0.0,
                total_transferencias_sugeridas=0,
                recomendacoes=[],
                cobertura_filiais=[],
            )

        cutoff_15d = max_date - timedelta(days=14)
        cutoff_30d = max_date - timedelta(days=29)

        filiais_map = {f.id: f for f in db.scalars(select(Filial)).all()}
        produtos_map = {p.id: p for p in db.scalars(select(Produto)).all()}

        # Latest stock balance on max_date
        latest_stock_rows = db.execute(
            select(
                PosicaoEstoqueClima.filial_id,
                PosicaoEstoqueClima.produto_id,
                PosicaoEstoqueClima.saldo_disponivel_qtd,
            ).where(PosicaoEstoqueClima.data == max_date)
        ).all()

        # Average rainfall in last 30 days per branch
        rain_30d_rows = db.execute(
            select(
                PosicaoEstoqueClima.filial_id,
                func.avg(PosicaoEstoqueClima.precipitacao_mm).label("rain_30d"),
            )
            .where(PosicaoEstoqueClima.data >= cutoff_30d)
            .group_by(PosicaoEstoqueClima.filial_id)
        ).all()
        rain_30d_map = {int(r.filial_id): float(r.rain_30d) for r in rain_30d_rows}

        # Total sales in last 15 days per (filial_id, produto_id) -> divide by 15 for daily average
        sales_15d_rows = db.execute(
            select(
                RegistroVenda.filial_id,
                RegistroVenda.produto_id,
                func.sum(RegistroVenda.quantidade_vendida).label("total_15d"),
            )
            .where(RegistroVenda.data >= cutoff_15d)
            .group_by(RegistroVenda.filial_id, RegistroVenda.produto_id)
        ).all()
        sales_15d_map = {
            (int(r.filial_id), int(r.produto_id)): float(r.total_15d) / 15.0
            for r in sales_15d_rows
        }

        # Consultant historical performance per (filial_id, produto_id) to pick destination champion
        consultant_perf_rows = db.execute(
            select(
                Consultor.id.label("consultor_id"),
                Consultor.nome.label("consultor_nome"),
                Consultor.filial_id,
                Consultor.perfil_foco,
                RegistroVenda.produto_id,
                func.sum(RegistroVenda.quantidade_vendida).label("vol_total"),
                func.sum(
                    RegistroVenda.quantidade_vendida * RegistroVenda.margem_aplicada_pct
                ).label("margem_ponderada_num"),
            )
            .join(RegistroVenda, RegistroVenda.consultor_id == Consultor.id)
            .group_by(
                Consultor.id,
                Consultor.nome,
                Consultor.filial_id,
                Consultor.perfil_foco,
                RegistroVenda.produto_id,
            )
        ).all()

        best_consultant_map: dict[tuple[int, int], tuple[int, str, str, float]] = {}
        df_c_perf = pd.DataFrame(
            consultant_perf_rows,
            columns=[
                "consultor_id",
                "consultor_nome",
                "filial_id",
                "perfil_foco",
                "produto_id",
                "vol_total",
                "margem_ponderada_num",
            ],
        )
        if not df_c_perf.empty:
            df_c_perf["margem_media"] = np.where(
                df_c_perf["vol_total"] > 0,
                df_c_perf["margem_ponderada_num"] / df_c_perf["vol_total"],
                0.0,
            )
            df_c_perf["score"] = df_c_perf["margem_ponderada_num"]
            for (fid, pid), grp in df_c_perf.groupby(["filial_id", "produto_id"]):
                champ = grp.sort_values("score", ascending=False).iloc[0]
                best_consultant_map[(int(fid), int(pid))] = (
                    int(champ["consultor_id"]),
                    str(champ["consultor_nome"]),
                    str(champ["perfil_foco"]),
                    round(float(champ["margem_media"]), 2),
                )

        cobertura_items: list[BranchStockCoverageItem] = []
        overstocked_by_prod: dict[int, list[BranchStockCoverageItem]] = {}
        understocked_by_prod: dict[int, list[BranchStockCoverageItem]] = {}
        total_valor_risco = 0.0

        for row in latest_stock_rows:
            fid = int(row.filial_id)
            pid = int(row.produto_id)
            estoque_qtd = float(row.saldo_disponivel_qtd)
            filial = filiais_map[fid]
            produto = produtos_map[pid]

            avg_daily_15d = sales_15d_map.get((fid, pid), 0.0)
            if estoque_qtd <= 0.0:
                cobertura_dias = 0.0
            elif avg_daily_15d > 1e-6:
                cobertura_dias = estoque_qtd / avg_daily_15d
            else:
                cobertura_dias = 999.0
            rain_mm = rain_30d_map.get(fid, 0.0)

            if cobertura_dias > max_coverage_days:
                status = "EXCESSO_CRITICO"
                if avg_daily_15d > 1e-6:
                    risk_threshold_days = min(
                        float(max_coverage_days), float(produto.janela_ideal_dias)
                    )
                    excess_days = max(0.0, cobertura_dias - risk_threshold_days)
                    excess_units = excess_days * avg_daily_15d
                else:
                    excess_units = estoque_qtd
                total_valor_risco += excess_units * produto.preco_unitario
            elif cobertura_dias < min_coverage_days:
                status = "RUPTURA_IMINENTE"
            else:
                status = "EQUILIBRADO"

            item = BranchStockCoverageItem(
                filial_id=fid,
                filial_nome=filial.nome,
                produto_id=pid,
                produto_nome=produto.nome,
                categoria=produto.categoria,
                janela_ideal_dias=produto.janela_ideal_dias,
                estoque_disponivel_qtd=round(estoque_qtd, 2),
                media_diaria_vendas_15d=round(avg_daily_15d, 2),
                cobertura_atual_dias=round(cobertura_dias, 2),
                precipitacao_media_30d_mm=round(rain_mm, 2),
                status_cobertura=status,
            )
            cobertura_items.append(item)

            if status == "EXCESSO_CRITICO":
                overstocked_by_prod.setdefault(pid, []).append(item)
            elif status == "RUPTURA_IMINENTE":
                understocked_by_prod.setdefault(pid, []).append(item)

        equilibrium_days = (float(min_coverage_days) + float(max_coverage_days)) / 2.0
        safe_origin_days = max(float(min_coverage_days), min(30.0, equilibrium_days))
        target_dest_days = min(
            equilibrium_days, max(18.0, float(min_coverage_days) * 1.25)
        )

        recomendacoes: list[StockTransferRecommendation] = []
        for pid, origins in overstocked_by_prod.items():
            destinations = understocked_by_prod.get(pid, [])
            if not destinations:
                continue

            produto = produtos_map[pid]
            origins_sorted = sorted(
                origins, key=lambda x: x.cobertura_atual_dias, reverse=True
            )
            destinations_sorted = sorted(
                destinations, key=lambda x: x.cobertura_atual_dias
            )

            rem_orig_stock: dict[int, float] = {
                o.filial_id: o.estoque_disponivel_qtd for o in origins_sorted
            }
            curr_dest_stock: dict[int, float] = {
                d.filial_id: d.estoque_disponivel_qtd for d in destinations_sorted
            }

            for orig in origins_sorted:
                for dest in destinations_sorted:
                    if orig.filial_id == dest.filial_id:
                        continue

                    orig_avail = rem_orig_stock[orig.filial_id]
                    dest_avail = curr_dest_stock[dest.filial_id]

                    surplus_origin_qtd = max(
                        0.0,
                        orig_avail - (orig.media_diaria_vendas_15d * safe_origin_days),
                    )
                    needed_dest_qtd = max(
                        0.0,
                        (dest.media_diaria_vendas_15d * target_dest_days) - dest_avail,
                    )
                    transfer_qty = round(min(surplus_origin_qtd, needed_dest_qtd), 0)
                    if transfer_qty <= 0:
                        continue

                    orig_cov_before = (
                        orig_avail / orig.media_diaria_vendas_15d
                        if orig.media_diaria_vendas_15d > 1e-6
                        else 999.0
                    )
                    dest_cov_before = (
                        dest_avail / dest.media_diaria_vendas_15d
                        if dest.media_diaria_vendas_15d > 1e-6
                        else 0.0
                    )

                    new_orig_stock = orig_avail - transfer_qty
                    new_dest_stock = dest_avail + transfer_qty
                    rem_orig_stock[orig.filial_id] = new_orig_stock
                    curr_dest_stock[dest.filial_id] = new_dest_stock

                    new_orig_cov = (
                        new_orig_stock / orig.media_diaria_vendas_15d
                        if orig.media_diaria_vendas_15d > 1e-6
                        else 0.0
                    )
                    new_dest_cov = (
                        new_dest_stock / dest.media_diaria_vendas_15d
                        if dest.media_diaria_vendas_15d > 1e-6
                        else 0.0
                    )

                    champ_id, champ_nome, champ_perfil, champ_margem = best_consultant_map.get(
                        (dest.filial_id, pid),
                        (0, "N/A", "Especialista Técnico", produto.margem_alvo_pct),
                    )
                    risco_janela = orig_cov_before > produto.janela_ideal_dias
                    valor_lote = round(transfer_qty * produto.preco_unitario, 2)

                    justificativa = (
                        f"Lote de {produto.nome} travado em {orig.filial_nome} com cobertura de "
                        f"{orig_cov_before:.1f} dias (janela ideal: "
                        f"{produto.janela_ideal_dias}d). {dest.filial_nome} registra chuva "
                        f"regular ({dest.precipitacao_media_30d_mm:.1f} mm/dia), cobertura crítica "
                        f"de {dest_cov_before:.1f} dias e conta com {champ_nome} "
                        f"({champ_perfil}, margem média {champ_margem:.1f}%) para giro rápido."
                    )

                    recomendacoes.append(
                        StockTransferRecommendation(
                            produto_id=pid,
                            produto_nome=produto.nome,
                            categoria=produto.categoria,
                            preco_unitario=produto.preco_unitario,
                            janela_ideal_dias=produto.janela_ideal_dias,
                            filial_origem_id=orig.filial_id,
                            filial_origem_nome=orig.filial_nome,
                            cobertura_origem_atual_dias=round(orig_cov_before, 2),
                            estoque_origem_disponivel_qtd=round(orig_avail, 2),
                            media_diaria_origem_15d=orig.media_diaria_vendas_15d,
                            filial_destino_id=dest.filial_id,
                            filial_destino_nome=dest.filial_nome,
                            cobertura_destino_atual_dias=round(dest_cov_before, 2),
                            estoque_destino_disponivel_qtd=round(dest_avail, 2),
                            media_diaria_destino_15d=dest.media_diaria_vendas_15d,
                            precipitacao_destino_30d_mm=dest.precipitacao_media_30d_mm,
                            quantidade_sugerida=transfer_qty,
                            valor_financeiro_lote_reais=valor_lote,
                            cobertura_origem_pos_transferencia_dias=round(new_orig_cov, 2),
                            cobertura_destino_pos_transferencia_dias=round(new_dest_cov, 2),
                            risco_perda_janela_plantio=risco_janela,
                            consultor_recomendado_id=champ_id,
                            consultor_recomendado_nome=champ_nome,
                            consultor_recomendado_perfil=champ_perfil,
                            consultor_margem_media_produto_pct=champ_margem,
                            justificativa=justificativa,
                        )
                    )

        cobertura_items.sort(key=lambda x: (x.filial_id, x.produto_id))

        return StockRebalancingReport(
            max_coverage_days=max_coverage_days,
            min_coverage_days=min_coverage_days,
            total_valor_risco_encalhe_reais=round(total_valor_risco, 2),
            total_transferencias_sugeridas=len(recomendacoes),
            recomendacoes=recomendacoes,
            cobertura_filiais=cobertura_items,
        )
    finally:
        if owns_session:
            db.close()
