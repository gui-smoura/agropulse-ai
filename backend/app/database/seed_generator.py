"""Deterministic 730-day synthetic data generator for AgroPulse AI.

Embeds the 3 mandatory hidden patterns specified in SPEC.md:
1. Climate Anomaly vs. Seasonality: Severe rainfall drought in the last 30 days at
   Filial Norte, dropping Pasture Seed sales by >50% and surging Dry-Season Protein sales.
2. Consultant-Product Affinity: Technical Specialists achieving 35%-45% higher margin and
   conversion on technical lines (Defensivos/Sementes) vs. Volume/Commodity sellers focused
   on discounted basic mineral salt.
3. Stock Imbalance (Transfer Trigger): Large seed lots stuck at Filial Norte (coverage > 65
   days, risking planting window loss) while Filial Sul has regular rain, coverage < 8 days,
   and the champion consultant for the Seed line.
"""

from datetime import date, timedelta
from typing import Any

import numpy as np
from sqlalchemy import func, insert, select
from sqlalchemy.orm import Session

from app.database.models import (
    Base,
    Consultor,
    Filial,
    PosicaoEstoqueClima,
    Produto,
    RegistroVenda,
    SessionLocal,
)

DEFAULT_REFERENCE_DATE = date(2026, 3, 31)
DEFAULT_HISTORY_DAYS = 730
RANDOM_SEED = 42


def _build_static_entities() -> tuple[
    list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]
]:
    """Return deterministic master records for filiais, consultores, and produtos."""
    filiais = [
        {
            "id": 1,
            "nome": "Filial Norte - Sinop",
            "cidade": "Sinop - MT",
            "microrregiao": "Norte",
        },
        {
            "id": 2,
            "nome": "Filial Sul - Dourados",
            "cidade": "Dourados - MS",
            "microrregiao": "Sul",
        },
        {
            "id": 3,
            "nome": "Filial Cerrado - Rio Verde",
            "cidade": "Rio Verde - GO",
            "microrregiao": "Cerrado",
        },
        {
            "id": 4,
            "nome": "Filial Pantanal - Corumbá",
            "cidade": "Corumbá - MS",
            "microrregiao": "Pantanal",
        },
    ]

    consultores = [
        {
            "id": 1,
            "nome": "Carlos Eduardo Mendes",
            "filial_id": 1,
            "perfil_foco": "Especialista Técnico",
        },
        {
            "id": 2,
            "nome": "Marcos Vinícius Rocha",
            "filial_id": 1,
            "perfil_foco": "Volume/Commodity",
        },
        {
            "id": 3,
            "nome": "Helena Albuquerque",
            "filial_id": 2,
            "perfil_foco": "Especialista Técnico",
        },
        {
            "id": 4,
            "nome": "Roberto Almeida",
            "filial_id": 2,
            "perfil_foco": "Volume/Commodity",
        },
        {
            "id": 5,
            "nome": "Fernanda Costa",
            "filial_id": 3,
            "perfil_foco": "Especialista Técnico",
        },
        {
            "id": 6,
            "nome": "Lucas Martins",
            "filial_id": 3,
            "perfil_foco": "Volume/Commodity",
        },
        {
            "id": 7,
            "nome": "Gabriel Nogueira",
            "filial_id": 4,
            "perfil_foco": "Especialista Técnico",
        },
        {
            "id": 8,
            "nome": "Diego Ferreira",
            "filial_id": 4,
            "perfil_foco": "Volume/Commodity",
        },
    ]

    produtos = [
        {
            "id": 1,
            "nome": "Sementes de Pastagem Brachiaria Brizantha",
            "categoria": "Sementes",
            "janela_ideal_dias": 45,
            "preco_unitario": 420.0,
            "margem_alvo_pct": 28.0,
        },
        {
            "id": 2,
            "nome": "Sementes Premium Mombaça Tratada",
            "categoria": "Sementes",
            "janela_ideal_dias": 40,
            "preco_unitario": 580.0,
            "margem_alvo_pct": 32.0,
        },
        {
            "id": 3,
            "nome": "Proteinado de Seca 35% Alto Desempenho",
            "categoria": "Nutrição Seca",
            "janela_ideal_dias": 120,
            "preco_unitario": 145.0,
            "margem_alvo_pct": 22.0,
        },
        {
            "id": 4,
            "nome": "Sal Mineral Básico de Águas 80",
            "categoria": "Nutrição Águas",
            "janela_ideal_dias": 180,
            "preco_unitario": 95.0,
            "margem_alvo_pct": 15.0,
        },
        {
            "id": 5,
            "nome": "Herbicida Seletivo PastoLimpo Ultra",
            "categoria": "Defensivos",
            "janela_ideal_dias": 90,
            "preco_unitario": 890.0,
            "margem_alvo_pct": 34.0,
        },
    ]

    return filiais, consultores, produtos


def seed_database(
    session: Session,
    reference_date: date = DEFAULT_REFERENCE_DATE,
    days: int = DEFAULT_HISTORY_DAYS,
) -> dict[str, int]:
    """Populate the 5 SQLite tables with 730 days of deterministic synthetic data."""
    rng = np.random.default_rng(RANDOM_SEED)
    filiais_data, consultores_data, produtos_data = _build_static_entities()

    session.execute(insert(Filial), filiais_data)
    session.execute(insert(Consultor), consultores_data)
    session.execute(insert(Produto), produtos_data)

    start_date = reference_date - timedelta(days=days - 1)
    anomaly_start_idx = days - 30
    last_15_start_idx = days - 15

    branch_consultants: dict[int, tuple[int, int]] = {
        1: (1, 2),  # (Especialista Técnico, Volume/Commodity)
        2: (3, 4),
        3: (5, 6),
        4: (7, 8),
    }

    base_daily_demand: dict[tuple[int, int], float] = {
        # Filial 1 (Norte)
        (1, 1): 30.0,
        (1, 2): 20.0,
        (1, 3): 18.0,
        (1, 4): 40.0,
        (1, 5): 12.0,
        # Filial 2 (Sul) — Strong demand for Sementes & Defensivos led by Helena (id=3)
        (2, 1): 36.0,
        (2, 2): 24.0,
        (2, 3): 16.0,
        (2, 4): 38.0,
        (2, 5): 15.0,
        # Filial 3 (Cerrado)
        (3, 1): 24.0,
        (3, 2): 16.0,
        (3, 3): 20.0,
        (3, 4): 42.0,
        (3, 5): 13.0,
        # Filial 4 (Pantanal)
        (4, 1): 20.0,
        (4, 2): 14.0,
        (4, 3): 22.0,
        (4, 4): 46.0,
        (4, 5): 10.0,
    }

    # Target coverage (days) on the final day to guarantee Pattern 3 cleanly:
    # Filial Norte (1) Sementes > 65 days (80d and 72d)
    # Filial Sul (2) Sementes < 8 days (5.0d and 6.0d)
    # All other pairs in healthy range (26d to 34d)
    target_final_coverage_days: dict[tuple[int, int], float] = {
        (1, 1): 80.0,
        (1, 2): 72.0,
        (1, 3): 26.0,
        (1, 4): 30.0,
        (1, 5): 32.0,
        (2, 1): 5.0,
        (2, 2): 6.0,
        (2, 3): 28.0,
        (2, 4): 30.0,
        (2, 5): 27.0,
        (3, 1): 29.0,
        (3, 2): 31.0,
        (3, 3): 28.0,
        (3, 4): 32.0,
        (3, 5): 30.0,
        (4, 1): 30.0,
        (4, 2): 28.0,
        (4, 3): 27.0,
        (4, 4): 33.0,
        (4, 5): 29.0,
    }

    # Track running stock balances per (filial_id, produto_id)
    running_stock: dict[tuple[int, int], float] = {
        key: round(demand * 30.0, 2) for key, demand in base_daily_demand.items()
    }

    estoque_records: list[dict[str, Any]] = []
    vendas_records: list[dict[str, Any]] = []

    for day_idx in range(days):
        current_date = start_date + timedelta(days=day_idx)
        seasonal_wave = float(np.sin(2.0 * np.pi * (day_idx % 365) / 365.0))
        in_anomaly_window = day_idx >= anomaly_start_idx
        in_last_15_days = day_idx >= last_15_start_idx

        for filial_id in (1, 2, 3, 4):
            # 1. Precipitation generation (mm)
            base_rain = 11.5 + 1.8 * seasonal_wave
            rain_noise = float(rng.normal(0.0, 0.9))
            if filial_id == 1 and in_anomaly_window:
                # Severe rainfall delay/drought at Filial Norte in last 30 days
                precipitacao_mm = round(max(0.1, 0.55 + float(rng.normal(0.0, 0.15))), 2)
            elif filial_id == 2 and in_anomaly_window:
                # Filial Sul has regular/favorable rain in last 30 days
                precipitacao_mm = round(max(6.0, 12.2 + float(rng.normal(0.0, 0.7))), 2)
            else:
                precipitacao_mm = round(max(1.5, base_rain + rain_noise), 2)

            tech_consultor_id, comm_consultor_id = branch_consultants[filial_id]

            for produto in produtos_data:
                produto_id = int(produto["id"])
                categoria = str(produto["categoria"])
                base_qty = base_daily_demand[(filial_id, produto_id)]

                # 2. Daily branch demand with Pattern 1 (Climate Anomaly in Filial Norte)
                if filial_id == 1 and in_anomaly_window:
                    if categoria == "Sementes":
                        # >50% drop in Sementes at Filial Norte (drops ~73% to 8.0 and 5.0/day)
                        target_qty = 8.0 if produto_id == 1 else 5.0
                        noise = 0.0 if in_last_15_days else float(rng.normal(0.0, 0.25))
                        total_daily_qty = max(1.0, round(target_qty + noise, 2))
                    elif categoria == "Nutrição Seca":
                        # Surge in Proteinado de Seca at Filial Norte (+150% to ~45/day)
                        target_qty = 45.0
                        noise = 0.0 if in_last_15_days else float(rng.normal(0.0, 0.8))
                        total_daily_qty = round(target_qty + noise, 2)
                    else:
                        seasonal_adj = base_qty * (1.0 + 0.05 * seasonal_wave)
                        noise_val = float(rng.normal(0.0, 0.4))
                        total_daily_qty = round(max(2.0, seasonal_adj + noise_val), 2)
                elif filial_id == 2 and in_anomaly_window and categoria == "Sementes":
                    # Strong active demand at Filial Sul with regular rainfall
                    target_qty = 36.0 if produto_id == 1 else 24.0
                    noise = 0.0 if in_last_15_days else float(rng.normal(0.0, 0.35))
                    total_daily_qty = round(target_qty + noise, 2)
                else:
                    if in_last_15_days:
                        total_daily_qty = round(base_qty, 2)
                    else:
                        seasonal_factor = 1.0 + 0.06 * seasonal_wave
                        total_daily_qty = round(
                            max(2.0, base_qty * seasonal_factor + float(rng.normal(0.0, 0.6))),
                            2,
                        )

                # 3. Split sales and margins between Especialista Técnico and Volume/Commodity
                # Pattern 2: Especialista Técnico has ~40% higher conversion & margin (35%-45% band)
                # in technical lines (Sementes, Defensivos), while Volume/Commodity pushes
                # basic mineral salt (Nutrição Águas) on volume with heavy discounts.
                if categoria in ("Sementes", "Defensivos"):
                    # Especialista Técnico gets ~58.4% share vs ~41.6% (+40.4% conversion)
                    # At Filial Sul (id=2), Helena Albuquerque (id=3) is the champion (58.8% share)
                    tech_share = 0.588 if filial_id == 2 else 0.583
                    tech_qty = round(total_daily_qty * tech_share, 2)
                    comm_qty = round(max(0.5, total_daily_qty - tech_qty), 2)

                    # Margin ratio: 30.1% vs 21.5% -> 30.1 / 21.5 = 1.40 (+40.0% superior margin)
                    tech_base_margin = 30.8 if filial_id == 2 else 30.1
                    comm_base_margin = 21.5
                    tech_margin = round(tech_base_margin + float(rng.normal(0.0, 0.25)), 2)
                    comm_margin = round(comm_base_margin + float(rng.normal(0.0, 0.25)), 2)
                elif categoria == "Nutrição Águas":
                    # Volume/Commodity pushes basic mineral salt on volume with discount
                    tech_share = 0.30
                    tech_qty = round(total_daily_qty * tech_share, 2)
                    comm_qty = round(max(0.5, total_daily_qty - tech_qty), 2)
                    tech_margin = round(14.8 + float(rng.normal(0.0, 0.2)), 2)
                    comm_margin = round(9.6 + float(rng.normal(0.0, 0.2)), 2)
                else:
                    # Nutrição Seca
                    tech_share = 0.48
                    tech_qty = round(total_daily_qty * tech_share, 2)
                    comm_qty = round(max(0.5, total_daily_qty - tech_qty), 2)
                    tech_margin = round(22.4 + float(rng.normal(0.0, 0.25)), 2)
                    comm_margin = round(17.8 + float(rng.normal(0.0, 0.25)), 2)

                vendas_records.append(
                    {
                        "data": current_date,
                        "filial_id": filial_id,
                        "consultor_id": tech_consultor_id,
                        "produto_id": produto_id,
                        "quantidade_vendida": tech_qty,
                        "margem_aplicada_pct": tech_margin,
                    }
                )
                vendas_records.append(
                    {
                        "data": current_date,
                        "filial_id": filial_id,
                        "consultor_id": comm_consultor_id,
                        "produto_id": produto_id,
                        "quantidade_vendida": comm_qty,
                        "margem_aplicada_pct": comm_margin,
                    }
                )

                # 4. Update stock balance (posicao_estoque_clima)
                key = (filial_id, produto_id)
                prev_stock = running_stock[key]
                sold_today = round(tech_qty + comm_qty, 2)

                if day_idx == days - 1:
                    # Calibrate final day stock so coverage matches Pattern 3 deterministically
                    desired_final_stock = round(
                        sold_today * target_final_coverage_days[key], 2
                    )
                    entradas_qtd = round(max(0.0, desired_final_stock - prev_stock + sold_today), 2)
                    saldo_disponivel = desired_final_stock
                elif filial_id == 1 and categoria == "Sementes" and day_idx == anomaly_start_idx:
                    # Large pre-season seed lot received at Filial Norte right as drought hit
                    entradas_qtd = 650.0 if produto_id == 1 else 380.0
                    saldo_disponivel = round(max(10.0, prev_stock + entradas_qtd - sold_today), 2)
                elif day_idx % 14 == 0:
                    target_stock = base_qty * target_final_coverage_days[key]
                    entradas_qtd = round(max(0.0, target_stock - prev_stock + sold_today), 2)
                    saldo_disponivel = round(max(5.0, prev_stock + entradas_qtd - sold_today), 2)
                else:
                    entradas_qtd = 0.0
                    saldo_disponivel = round(max(5.0, prev_stock - sold_today), 2)

                running_stock[key] = saldo_disponivel

                estoque_records.append(
                    {
                        "data": current_date,
                        "filial_id": filial_id,
                        "produto_id": produto_id,
                        "entradas_qtd": entradas_qtd,
                        "saldo_disponivel_qtd": saldo_disponivel,
                        "precipitacao_mm": precipitacao_mm,
                    }
                )

    session.execute(insert(PosicaoEstoqueClima), estoque_records)
    session.execute(insert(RegistroVenda), vendas_records)
    session.commit()

    return {
        "filiais": len(filiais_data),
        "consultores": len(consultores_data),
        "produtos": len(produtos_data),
        "posicao_estoque_clima": len(estoque_records),
        "registro_vendas": len(vendas_records),
    }


def ensure_database_seeded(session: Session | None = None) -> dict[str, int]:
    """Ensure SQLite schema exists and is populated; seed automatically if empty."""
    owns_session = session is None
    active_session = session or SessionLocal()
    try:
        Base.metadata.create_all(bind=active_session.get_bind())
        existing_filiais = active_session.scalar(select(func.count(Filial.id))) or 0
        if existing_filiais > 0:
            return {
                "filiais": existing_filiais,
                "consultores": active_session.scalar(select(func.count(Consultor.id))) or 0,
                "produtos": active_session.scalar(select(func.count(Produto.id))) or 0,
                "posicao_estoque_clima": (
                    active_session.scalar(select(func.count(PosicaoEstoqueClima.id))) or 0
                ),
                "registro_vendas": (
                    active_session.scalar(select(func.count(RegistroVenda.id))) or 0
                ),
            }
        return seed_database(active_session)
    finally:
        if owns_session:
            active_session.close()


if __name__ == "__main__":
    counts = ensure_database_seeded()
    print(f"Database seeded successfully: {counts}")
