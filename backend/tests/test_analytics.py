"""Unit and edge-case tests for AgroPulse AI SQLite schema, seed, and analytics engine."""

from collections.abc import Generator
from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.analytics.engine import (
    analyze_consultant_product_affinity,
    detect_climate_sales_anomalies,
    recommend_stock_rebalancing,
)
from app.database.models import (
    Consultor,
    Filial,
    PosicaoEstoqueClima,
    Produto,
    RegistroVenda,
    create_db_engine,
    init_db,
)
from app.database.seed_generator import (
    DEFAULT_HISTORY_DAYS,
    ensure_database_seeded,
    seed_database,
)


@pytest.fixture(scope="module")
def seeded_session() -> Generator[Session, None, None]:
    """Create an in-memory SQLite database seeded with 730 days of synthetic data."""
    test_engine = create_db_engine("sqlite:///:memory:")
    init_db(test_engine)
    testing_session_local = sessionmaker(
        bind=test_engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    session = testing_session_local()
    seed_database(session, reference_date=date(2026, 3, 31), days=DEFAULT_HISTORY_DAYS)
    try:
        yield session
    finally:
        session.close()
        test_engine.dispose()


@pytest.fixture()
def empty_session() -> Generator[Session, None, None]:
    """Create an empty in-memory SQLite database session for edge-case testing."""
    test_engine = create_db_engine("sqlite:///:memory:")
    init_db(test_engine)
    testing_session_local = sessionmaker(
        bind=test_engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    session = testing_session_local()
    try:
        yield session
    finally:
        session.close()
        test_engine.dispose()


def test_seed_populates_five_tables_and_is_idempotent(seeded_session: Session) -> None:
    """Verify all 5 tables have exact expected row counts for 730 days and idempotency."""
    filiais_count = seeded_session.scalar(select(func.count(Filial.id)))
    consultores_count = seeded_session.scalar(select(func.count(Consultor.id)))
    produtos_count = seeded_session.scalar(select(func.count(Produto.id)))
    estoque_count = seeded_session.scalar(select(func.count(PosicaoEstoqueClima.id)))
    vendas_count = seeded_session.scalar(select(func.count(RegistroVenda.id)))

    assert filiais_count == 4
    assert consultores_count == 8
    assert produtos_count == 5
    assert estoque_count == 4 * 5 * 730
    assert vendas_count == 4 * 5 * 2 * 730

    # Calling ensure_database_seeded on an already populated session must not duplicate rows
    counts_again = ensure_database_seeded(session=seeded_session)
    assert counts_again["filiais"] == 4
    assert counts_again["posicao_estoque_clima"] == 14600
    assert counts_again["registro_vendas"] == 29200


def test_detect_climate_sales_anomalies_filial_norte_pattern(
    seeded_session: Session,
) -> None:
    """Verify Pattern 1: Severe rain delay at Filial Norte drops Sementes >50% and surges Seca."""
    report = detect_climate_sales_anomalies(
        filial_id=None, dias_analise=30, session=seeded_session
    )

    assert report.dias_analise == 30
    assert report.total_anomalias_criticas == 1
    assert len(report.filiais) == 4

    filial_norte = next(f for f in report.filiais if f.filial_id == 1)
    assert filial_norte.anomalia_detectada is True
    assert filial_norte.severidade == "CRITICA"
    assert filial_norte.precipitacao_z_score <= -2.5
    assert filial_norte.queda_sementes_pct < -50.0
    assert filial_norte.alta_nutricao_seca_pct > 40.0

    sementes_anomalies = [
        p for p in filial_norte.produtos_afetados if p.categoria == "Sementes"
    ]
    assert len(sementes_anomalies) == 2
    for prod_anom in sementes_anomalies:
        assert prod_anom.status_anomalia == "QUEDA_SEVERA"
        assert prod_anom.variacao_vendas_pct < -50.0
        assert prod_anom.vendas_z_score <= -2.0
        assert prod_anom.correlacao_chuva_vendas > 0.5

    seca_anomaly = next(
        p for p in filial_norte.produtos_afetados if p.categoria == "Nutrição Seca"
    )
    assert seca_anomaly.status_anomalia == "ALTA_ATIPICA"
    assert seca_anomaly.variacao_vendas_pct > 80.0
    assert seca_anomaly.vendas_z_score >= 2.0

    # Other branches must have regular climate and no critical anomaly
    for other_branch in (f for f in report.filiais if f.filial_id != 1):
        assert other_branch.anomalia_detectada is False
        assert other_branch.severidade == "NORMAL"


def test_detect_climate_sales_anomalies_filtering_and_edge_cases(
    seeded_session: Session, empty_session: Session
) -> None:
    """Test branch filtering, non-existent branch, empty DB, and invalid parameters."""
    filtered = detect_climate_sales_anomalies(
        filial_id=1, dias_analise=30, session=seeded_session
    )
    assert len(filtered.filiais) == 1
    assert filtered.filiais[0].filial_id == 1
    assert len(filtered.serie_temporal) == 30

    missing_branch = detect_climate_sales_anomalies(
        filial_id=999, dias_analise=30, session=seeded_session
    )
    assert missing_branch.filiais == []
    assert missing_branch.serie_temporal == []

    empty_report = detect_climate_sales_anomalies(
        filial_id=None, dias_analise=30, session=empty_session
    )
    assert empty_report.total_anomalias_criticas == 0
    assert empty_report.filiais == []

    with pytest.raises(ValueError, match="dias_analise"):
        detect_climate_sales_anomalies(filial_id=1, dias_analise=0, session=seeded_session)

    # Non-default analysis windows (15 days and 60 days)
    report_15d = detect_climate_sales_anomalies(
        filial_id=1, dias_analise=15, session=seeded_session
    )
    assert report_15d.dias_analise == 15
    assert len(report_15d.serie_temporal) == 15
    assert report_15d.filiais[0].severidade == "CRITICA"

    report_60d = detect_climate_sales_anomalies(
        filial_id=1, dias_analise=60, session=seeded_session
    )
    assert report_60d.dias_analise == 60
    assert len(report_60d.serie_temporal) == 60
    assert report_60d.filiais[0].anomalia_detectada is True


def test_ensure_database_seeded_initializes_schema_on_session_bind() -> None:
    """Verify ensure_database_seeded creates tables on the provided session's engine."""
    fresh_engine = create_db_engine("sqlite:///:memory:")
    fresh_session = sessionmaker(
        bind=fresh_engine, autoflush=False, autocommit=False, expire_on_commit=False
    )()
    try:
        counts = ensure_database_seeded(session=fresh_session)
        assert counts["filiais"] == 4
        assert counts["consultores"] == 8
        assert counts["produtos"] == 5
        assert counts["posicao_estoque_clima"] == 14600
        assert counts["registro_vendas"] == 29200
    finally:
        fresh_session.close()
        fresh_engine.dispose()


def test_analyze_consultant_product_affinity_pattern(seeded_session: Session) -> None:
    """Verify Pattern 2: Technical Specialists have 35%-45% higher margin & conversion."""
    report = analyze_consultant_product_affinity(filial_id=None, session=seeded_session)

    assert len(report.consultores) == 8
    assert 35.0 <= report.vantagem_media_especialista_pct <= 45.0
    assert 35.0 <= report.vantagem_conversao_especialista_pct <= 45.0

    specialists = [
        c for c in report.consultores if c.perfil_foco == "Especialista Técnico"
    ]
    commodity_sellers = [
        c for c in report.consultores if c.perfil_foco == "Volume/Commodity"
    ]
    assert len(specialists) == 4
    assert len(commodity_sellers) == 4

    for spec in specialists:
        assert 35.0 <= spec.vantagem_margem_tecnica_vs_commodity_pct <= 45.0
        assert spec.vantagem_conversao_tecnica_vs_commodity_pct >= 35.0

    # Filter for Filial Sul (id=2) and check Helena Albuquerque is top technical consultant
    sul_report = analyze_consultant_product_affinity(filial_id=2, session=seeded_session)
    assert len(sul_report.consultores) == 2
    assert sul_report.consultores[0].consultor_nome == "Helena Albuquerque"
    assert sul_report.consultores[0].perfil_foco == "Especialista Técnico"


def test_recommend_stock_rebalancing_coverage_and_transfer_pattern(
    seeded_session: Session, empty_session: Session
) -> None:
    """Verify Pattern 3: Filial Norte >65d seed coverage transfers to Filial Sul <8d."""
    report = recommend_stock_rebalancing(
        max_coverage_days=60, min_coverage_days=10, session=seeded_session
    )

    assert report.total_transferencias_sugeridas >= 2
    assert report.total_valor_risco_encalhe_reais > 0.0

    # Verify exact coverage formula on all branch items
    for item in report.cobertura_filiais:
        expected_cov = round(item.estoque_disponivel_qtd / item.media_diaria_vendas_15d, 2)
        assert item.cobertura_atual_dias == pytest.approx(expected_cov, abs=0.05)

    # Verify recommendations transfer Sementes from Filial Norte (1) to Filial Sul (2)
    sementes_recs = [r for r in report.recomendacoes if r.categoria == "Sementes"]
    assert len(sementes_recs) == 2

    for rec in sementes_recs:
        assert rec.filial_origem_id == 1
        assert rec.filial_destino_id == 2
        assert rec.cobertura_origem_atual_dias > 65.0
        assert rec.cobertura_destino_atual_dias < 8.0
        assert rec.precipitacao_destino_30d_mm >= 10.0
        assert rec.risco_perda_janela_plantio is True
        assert rec.consultor_recomendado_id == 3
        assert rec.consultor_recomendado_nome == "Helena Albuquerque"
        assert rec.quantidade_sugerida > 0
        assert rec.cobertura_origem_pos_transferencia_dias < rec.cobertura_origem_atual_dias
        assert rec.cobertura_destino_pos_transferencia_dias > rec.cobertura_destino_atual_dias

    # Custom narrow thresholds where understocked destination has coverage > 18d (e.g. 27d < 28d)
    narrow_reb = recommend_stock_rebalancing(
        max_coverage_days=31, min_coverage_days=28, session=seeded_session
    )
    assert narrow_reb.total_transferencias_sugeridas >= 3
    for rec in narrow_reb.recomendacoes:
        assert rec.cobertura_origem_pos_transferencia_dias >= 28.0
        assert rec.cobertura_destino_pos_transferencia_dias > rec.cobertura_destino_atual_dias

    # Edge cases: empty database and invalid thresholds
    empty_reb = recommend_stock_rebalancing(session=empty_session)
    assert empty_reb.total_transferencias_sugeridas == 0
    assert empty_reb.recomendacoes == []

    with pytest.raises(ValueError, match="Invalid coverage thresholds"):
        recommend_stock_rebalancing(
            max_coverage_days=10, min_coverage_days=20, session=seeded_session
        )

