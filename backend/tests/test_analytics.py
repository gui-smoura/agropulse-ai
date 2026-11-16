"""Unit and edge-case tests for AgroPulse AI SQLite schema, seed, analytics, agent, and API."""

import json
from collections.abc import Generator
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from openai import OpenAIError
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.orchestrator import run_agent_chat
from app.agent.tools import (
    TOOL_ANALYZE_CONSULTANT_AFFINITY,
    TOOL_DETECT_CLIMATE_ANOMALIES,
    TOOL_RECOMMEND_STOCK_REBALANCING,
    execute_agent_tool,
)
from app.analytics.engine import (
    analyze_consultant_product_affinity,
    detect_climate_sales_anomalies,
    recommend_stock_rebalancing,
)
from app.config import Settings
from app.database.models import (
    Consultor,
    Filial,
    PosicaoEstoqueClima,
    Produto,
    RegistroVenda,
    create_db_engine,
    get_db,
    init_db,
)
from app.database.seed_generator import (
    DEFAULT_HISTORY_DAYS,
    ensure_database_seeded,
    seed_database,
)
from app.main import app
from app.rate_limit import InMemoryRateLimiter, agent_rate_limiter


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


def test_agent_tools_dispatcher_and_validation(seeded_session: Session) -> None:
    """Verify Pydantic validation and JSON serialization in execute_agent_tool."""
    anom_json = execute_agent_tool(
        TOOL_DETECT_CLIMATE_ANOMALIES,
        '{"filial_id": 1, "dias_analise": 30}',
        session=seeded_session,
    )
    anom_data = json.loads(anom_json)
    assert anom_data["total_anomalias_criticas"] == 1
    assert len(anom_data["filiais"]) == 1
    assert "serie_temporal" not in anom_data

    aff_json = execute_agent_tool(
        TOOL_ANALYZE_CONSULTANT_AFFINITY,
        {"filial_id": 2},
        session=seeded_session,
    )
    aff_data = json.loads(aff_json)
    assert len(aff_data["consultores"]) == 2
    assert aff_data["consultores"][0]["consultor_nome"] == "Helena Albuquerque"

    reb_json = execute_agent_tool(
        TOOL_RECOMMEND_STOCK_REBALANCING,
        None,
        session=seeded_session,
    )
    reb_data = json.loads(reb_json)
    assert reb_data["total_transferencias_sugeridas"] == 2

    # Whitespace-only or JSON "null" raw arguments must be treated as empty dicts
    reb_ws = json.loads(
        execute_agent_tool(TOOL_RECOMMEND_STOCK_REBALANCING, "   ", session=seeded_session)
    )
    assert reb_ws["total_transferencias_sugeridas"] == 2

    reb_null = json.loads(
        execute_agent_tool(TOOL_RECOMMEND_STOCK_REBALANCING, "null", session=seeded_session)
    )
    assert reb_null["total_transferencias_sugeridas"] == 2

    # LLM sentinels for "all branches" (0, "", "null", "todas") normalize to filial_id=None
    for sentinel in (0, "0", "", "null", "todas"):
        anom_all = json.loads(
            execute_agent_tool(
                TOOL_DETECT_CLIMATE_ANOMALIES,
                json.dumps({"filial_id": sentinel, "dias_analise": "15"}),
                session=seeded_session,
            )
        )
        assert len(anom_all["filiais"]) == 4
        assert anom_all["dias_analise"] == 15

        aff_all = json.loads(
            execute_agent_tool(
                TOOL_ANALYZE_CONSULTANT_AFFINITY,
                {"filial_id": sentinel},
                session=seeded_session,
            )
        )
        assert len(aff_all["consultores"]) == 8

    # Invalid tool name or invalid arguments must return structured JSON error without crashing
    err_unknown = json.loads(
        execute_agent_tool("non_existent_tool", "{}", session=seeded_session)
    )
    assert err_unknown["error"] is True

    err_threshold = json.loads(
        execute_agent_tool(
            TOOL_RECOMMEND_STOCK_REBALANCING,
            {"max_coverage_days": 20, "min_coverage_days": 30},
            session=seeded_session,
        )
    )
    assert err_threshold["error"] is True


def test_agent_orchestrator_deterministic_fallback_and_openai_tool_loop(
    seeded_session: Session,
) -> None:
    """Verify deterministic fallback routing and mocked OpenAI native tool calling loop."""
    unconfigured_settings = Settings(_env_file=None, LLM_API_KEY="")

    # 1. Stock-focused prompt routes to recommend_stock_rebalancing
    stock_resp = run_agent_chat(
        message="Quais lotes de sementes estão com risco de encalhe e para onde transferir?",
        session=seeded_session,
        settings=unconfigured_settings,
    )
    assert stock_resp.tools_used == [TOOL_RECOMMEND_STOCK_REBALANCING]
    assert "Filial Norte - Sinop" in stock_resp.reply
    assert "Filial Sul - Dourados" in stock_resp.reply
    assert "Helena Albuquerque" in stock_resp.reply

    # 2. Climate-focused prompt routes to detect_climate_sales_anomalies
    climate_resp = run_agent_chat(
        message="Qual o impacto do atraso de chuva e anomalia climática nas vendas?",
        session=seeded_session,
        settings=unconfigured_settings,
    )
    assert climate_resp.tools_used == [TOOL_DETECT_CLIMATE_ANOMALIES]
    assert "Z-score" in climate_resp.reply
    assert "Proteinado" in climate_resp.reply

    # 2b. Single-branch + custom window fallback (Filial Sul - Dourados, 15 dias)
    sul_resp = run_agent_chat(
        message="Como está a chuva e a margem dos consultores na Filial Sul nos últimos 15 dias?",
        session=seeded_session,
        settings=unconfigured_settings,
    )
    assert sul_resp.tools_used == [
        TOOL_DETECT_CLIMATE_ANOMALIES,
        TOOL_ANALYZE_CONSULTANT_AFFINITY,
    ]
    assert "Últimos 15 dias" in sul_resp.reply
    assert "Regime Regular — Filial Sul - Dourados" in sul_resp.reply
    assert "Helena Albuquerque" in sul_resp.reply
    assert "Roberto Almeida" in sul_resp.reply
    assert "Filial Norte - Sinop" not in sul_resp.reply

    # 3. General prompt invokes all 3 tools
    general_resp = run_agent_chat(
        message="Me dê um panorama executivo completo da operação hoje.",
        session=seeded_session,
        settings=unconfigured_settings,
    )
    assert set(general_resp.tools_used) == {
        TOOL_DETECT_CLIMATE_ANOMALIES,
        TOOL_RECOMMEND_STOCK_REBALANCING,
        TOOL_ANALYZE_CONSULTANT_AFFINITY,
    }

    # 4. Mocked OpenAI client exercising the multi-step tool calling loop
    first_tool_call = SimpleNamespace(
        id="call_stock_1",
        function=SimpleNamespace(
            name=TOOL_RECOMMEND_STOCK_REBALANCING,
            arguments='{"max_coverage_days": 60, "min_coverage_days": 10}',
        ),
    )
    first_completion = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content="",
                    tool_calls=[first_tool_call],
                )
            )
        ]
    )
    second_completion = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content=(
                        "Recomendo transferir imediatamente os lotes de Sementes da Filial Norte "
                        "para a Filial Sul sob gestão de Helena Albuquerque."
                    ),
                    tool_calls=None,
                )
            )
        ]
    )

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = [
        first_completion,
        second_completion,
    ]
    configured_settings = Settings(_env_file=None, LLM_API_KEY="dummy-unit-test-key")

    llm_resp = run_agent_chat(
        message="Analise o estoque e recomende transferências.",
        session=seeded_session,
        settings=configured_settings,
        openai_client=mock_client,
    )
    assert llm_resp.tools_used == [TOOL_RECOMMEND_STOCK_REBALANCING]
    assert "Helena Albuquerque" in llm_resp.reply
    assert mock_client.chat.completions.create.call_count == 2

    # 5. OpenAIError gracefully falls back to deterministic synthesis
    failing_client = MagicMock()
    failing_client.chat.completions.create.side_effect = OpenAIError("Provider timeout")
    fallback_on_error = run_agent_chat(
        message="Compare a margem dos consultores especialistas vs commodity.",
        session=seeded_session,
        settings=configured_settings,
        openai_client=failing_client,
    )
    assert fallback_on_error.tools_used == [TOOL_ANALYZE_CONSULTANT_AFFINITY]
    assert "Especialista Técnico" in fallback_on_error.reply

    # 6. Empty choices or tool-free LLM hallucination falls back deterministically
    empty_choices_client = MagicMock()
    empty_choices_client.chat.completions.create.return_value = SimpleNamespace(choices=[])
    empty_choices_resp = run_agent_chat(
        message="Quais os lotes em risco de cobertura de estoque?",
        session=seeded_session,
        settings=configured_settings,
        openai_client=empty_choices_client,
    )
    assert empty_choices_resp.tools_used == [TOOL_RECOMMEND_STOCK_REBALANCING]
    assert "Filial Norte - Sinop" in empty_choices_resp.reply

    no_tool_client = MagicMock()
    no_tool_client.chat.completions.create.return_value = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content="Resposta inventada sem consultar tools.",
                    tool_calls=None,
                )
            )
        ]
    )
    no_tool_resp = run_agent_chat(
        message="Quais os lotes em risco de cobertura de estoque?",
        session=seeded_session,
        settings=configured_settings,
        openai_client=no_tool_client,
    )
    assert no_tool_resp.tools_used == [TOOL_RECOMMEND_STOCK_REBALANCING]
    assert "Filial Norte - Sinop" in no_tool_resp.reply


def test_fastapi_routes_and_rate_limiting(
    seeded_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify /api/health, /api/dashboard/overview, /api/agent/chat, and HTTP 429 rate limiting."""
    monkeypatch.setattr(
        "app.agent.orchestrator.get_settings",
        lambda: Settings(_env_file=None, LLM_API_KEY=""),
    )

    def _override_get_db() -> Generator[Session, None, None]:
        yield seeded_session

    app.dependency_overrides[get_db] = _override_get_db
    agent_rate_limiter.reset()

    try:
        client = TestClient(app)

        # 1. GET /api/health
        health_res = client.get("/api/health")
        assert health_res.status_code == 200
        health_body = health_res.json()
        assert health_body["status"] == "ok"
        assert health_body["database_seeded"] is True
        assert health_body["records"]["filiais"] == 4
        assert health_body["records"]["registro_vendas"] == 29200

        # 2. GET /api/dashboard/overview
        overview_res = client.get("/api/dashboard/overview")
        assert overview_res.status_code == 200
        overview_body = overview_res.json()
        assert overview_body["anomalias_climaticas"]["total_anomalias_criticas"] == 1
        assert len(overview_body["afinidade_consultores"]["consultores"]) == 8
        assert overview_body["remanejamento_estoque"]["total_transferencias_sugeridas"] == 2

        invalid_overview = client.get(
            "/api/dashboard/overview?max_coverage_days=20&min_coverage_days=30"
        )
        assert invalid_overview.status_code == 422

        # 3. POST /api/agent/chat
        chat_res = client.post(
            "/api/agent/chat",
            json={
                "message": (
                    "Por que as vendas de sementes caíram na Filial Norte "
                    "e qual o plano de estoque?"
                )
            },
        )
        assert chat_res.status_code == 200
        chat_body = chat_res.json()
        assert TOOL_DETECT_CLIMATE_ANOMALIES in chat_body["tools_used"]
        assert TOOL_RECOMMEND_STOCK_REBALANCING in chat_body["tools_used"]
        assert "Filial Norte - Sinop" in chat_body["reply"]

        # Reject whitespace-only message
        blank_res = client.post("/api/agent/chat", json={"message": "   "})
        assert blank_res.status_code == 422

        # 4. Rate Limiting (HTTP 429 after exceeding max_requests + stale bucket eviction)
        custom_limiter = InMemoryRateLimiter(max_requests=2, window_seconds=3600)
        for idx in range(260):
            custom_limiter.check_request(f"198.51.100.{idx}", now=10.0)
        assert len(custom_limiter._hits) == 260
        # Advance past window (3600s); next check prunes all 260 expired IP buckets
        custom_limiter.check_request("192.0.2.10", now=3700.0)
        assert len(custom_limiter._hits) == 1
        custom_limiter.check_request("192.0.2.10", now=3701.0)
        with pytest.raises(Exception) as exc_info:
            custom_limiter.check_request("192.0.2.10", now=3702.0)
        assert getattr(exc_info.value, "status_code", None) == 429

        # Also test HTTP 429 through the FastAPI endpoint itself
        agent_rate_limiter.reset()
        max_req = agent_rate_limiter.max_requests
        for _ in range(max_req):
            ok_resp = client.post(
                "/api/agent/chat",
                json={"message": "Status de chuva na Filial Norte"},
                headers={"X-Forwarded-For": "203.0.113.55"},
            )
            assert ok_resp.status_code == 200

        blocked_resp = client.post(
            "/api/agent/chat",
            json={"message": "Status de chuva na Filial Norte"},
            headers={"X-Forwarded-For": "203.0.113.55"},
        )
        assert blocked_resp.status_code == 429
        assert "Retry-After" in blocked_resp.headers

        # Another IP is unaffected
        other_ip_resp = client.post(
            "/api/agent/chat",
            json={"message": "Status de chuva na Filial Norte"},
            headers={"X-Forwarded-For": "203.0.113.99"},
        )
        assert other_ip_resp.status_code == 200
    finally:
        app.dependency_overrides.clear()
        agent_rate_limiter.reset()



