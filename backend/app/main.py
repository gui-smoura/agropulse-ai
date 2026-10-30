"""FastAPI entrypoint for AgroPulse AI with resilient auto-seed lifespan, CORS, and routes."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.agent.orchestrator import run_agent_chat
from app.analytics.engine import (
    analyze_consultant_product_affinity,
    detect_climate_sales_anomalies,
    recommend_stock_rebalancing,
)
from app.analytics.schemas import (
    AgentChatRequest,
    AgentChatResponse,
    DashboardOverviewResponse,
    HealthCheckResponse,
)
from app.config import get_settings
from app.database.models import get_db
from app.database.seed_generator import ensure_database_seeded
from app.rate_limit import enforce_agent_rate_limit


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Ensure SQLite database schema exists and is populated with 730 days of data on boot."""
    ensure_database_seeded()
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    settings = get_settings()

    application = FastAPI(
        title="AgroPulse AI API",
        description=(
            "Copiloto Agêntico de Inteligência Comercial e Estoque para Distribuidoras "
            "de Insumos Agropecuários."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @application.get(
        "/api/health",
        response_model=HealthCheckResponse,
        tags=["System"],
    )
    def health_check(
        db: Annotated[Session, Depends(get_db)],
    ) -> HealthCheckResponse:
        """Return server status and verify that the SQLite database is populated."""
        counts = ensure_database_seeded(session=db)
        is_seeded = counts.get("filiais", 0) > 0 and counts.get("registro_vendas", 0) > 0
        return HealthCheckResponse(
            status="ok",
            database_seeded=is_seeded,
            records=counts,
        )

    @application.get(
        "/api/dashboard/overview",
        response_model=DashboardOverviewResponse,
        tags=["Analytics"],
    )
    def get_dashboard_overview(
        db: Annotated[Session, Depends(get_db)],
        filial_id: Annotated[int | None, Query(ge=1)] = None,
        dias_analise: Annotated[int, Query(ge=1, le=365)] = 30,
        max_coverage_days: Annotated[int, Query(ge=15, le=365)] = 60,
        min_coverage_days: Annotated[int, Query(ge=1, le=120)] = 10,
    ) -> DashboardOverviewResponse:
        """Return consolidated deterministic analytics for immediate dashboard rendering."""
        if max_coverage_days <= min_coverage_days:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="max_coverage_days must be greater than min_coverage_days.",
            )

        anomalias = detect_climate_sales_anomalies(
            filial_id=filial_id,
            dias_analise=dias_analise,
            session=db,
        )
        afinidade = analyze_consultant_product_affinity(
            filial_id=filial_id,
            session=db,
        )
        remanejamento = recommend_stock_rebalancing(
            max_coverage_days=max_coverage_days,
            min_coverage_days=min_coverage_days,
            session=db,
        )

        return DashboardOverviewResponse(
            anomalias_climaticas=anomalias,
            afinidade_consultores=afinidade,
            remanejamento_estoque=remanejamento,
        )

    @application.post(
        "/api/agent/chat",
        response_model=AgentChatResponse,
        dependencies=[Depends(enforce_agent_rate_limit)],
        tags=["Agent"],
    )
    def agent_chat(
        payload: AgentChatRequest,
        db: Annotated[Session, Depends(get_db)],
    ) -> AgentChatResponse:
        """Execute the Agent Tool Calling loop on demand with IP rate limiting."""
        cleaned = payload.message.strip()
        if not cleaned:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="O campo 'message' não pode conter apenas espaços em branco.",
            )

        return run_agent_chat(message=cleaned, session=db)

    return application


app = create_app()
