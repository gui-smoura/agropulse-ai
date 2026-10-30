"""OpenAI-compatible tool definitions and Pydantic-validated dispatcher for AgroPulse AI."""

import json
from typing import Any

from openai.types.chat import ChatCompletionToolParam
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from sqlalchemy.orm import Session

from app.analytics.engine import (
    analyze_consultant_product_affinity,
    detect_climate_sales_anomalies,
    recommend_stock_rebalancing,
)

TOOL_DETECT_CLIMATE_ANOMALIES = "detect_climate_sales_anomalies"
TOOL_ANALYZE_CONSULTANT_AFFINITY = "analyze_consultant_product_affinity"
TOOL_RECOMMEND_STOCK_REBALANCING = "recommend_stock_rebalancing"

VALID_TOOL_NAMES = (
    TOOL_DETECT_CLIMATE_ANOMALIES,
    TOOL_ANALYZE_CONSULTANT_AFFINITY,
    TOOL_RECOMMEND_STOCK_REBALANCING,
)

_NULL_BRANCH_SENTINELS = {0, "0", "", "null", "none", "all", "todas", "todos"}


def _normalize_optional_filial_id(value: Any) -> Any:
    """Normalize common LLM sentinel values for 'all branches' to None."""
    if value is None:
        return None
    if isinstance(value, str) and value.strip().lower() in _NULL_BRANCH_SENTINELS:
        return None
    if isinstance(value, int) and not isinstance(value, bool) and value == 0:
        return None
    return value


class DetectClimateSalesAnomaliesArgs(BaseModel):
    """Validated arguments for `detect_climate_sales_anomalies`."""

    model_config = ConfigDict(extra="forbid")

    filial_id: int | None = Field(
        default=None,
        ge=1,
        description=(
            "ID opcional da filial para filtrar (1=Filial Norte - Sinop, "
            "2=Filial Sul - Dourados, 3=Filial Cerrado - Rio Verde, "
            "4=Filial Pantanal - Corumbá). Se omitido, analisa todas as filiais."
        ),
    )
    dias_analise: int = Field(
        default=30,
        ge=1,
        le=365,
        description="Janela de dias recentes para comparar contra a linha de base histórica.",
    )

    @field_validator("filial_id", mode="before")
    @classmethod
    def normalize_filial_id(cls, value: Any) -> Any:
        """Convert LLM 'all branches' sentinels (0, '', 'null', 'todas') to None."""
        return _normalize_optional_filial_id(value)


class AnalyzeConsultantProductAffinityArgs(BaseModel):
    """Validated arguments for `analyze_consultant_product_affinity`."""

    model_config = ConfigDict(extra="forbid")

    filial_id: int | None = Field(
        default=None,
        ge=1,
        description=(
            "ID opcional da filial para filtrar os consultores (1=Norte, 2=Sul, "
            "3=Cerrado, 4=Pantanal). Se omitido, analisa todos os consultores da rede."
        ),
    )

    @field_validator("filial_id", mode="before")
    @classmethod
    def normalize_filial_id(cls, value: Any) -> Any:
        """Convert LLM 'all branches' sentinels (0, '', 'null', 'todas') to None."""
        return _normalize_optional_filial_id(value)


class RecommendStockRebalancingArgs(BaseModel):
    """Validated arguments for `recommend_stock_rebalancing`."""

    model_config = ConfigDict(extra="forbid")

    max_coverage_days: int = Field(
        default=60,
        ge=15,
        le=365,
        description="Limite máximo de cobertura em dias acima do qual há excesso crítico.",
    )
    min_coverage_days: int = Field(
        default=10,
        ge=1,
        le=120,
        description="Limite mínimo de cobertura em dias abaixo do qual há risco de ruptura.",
    )

    @model_validator(mode="after")
    def validate_thresholds(self) -> "RecommendStockRebalancingArgs":
        """Ensure max_coverage_days is strictly greater than min_coverage_days."""
        if self.max_coverage_days <= self.min_coverage_days:
            raise ValueError("max_coverage_days must be greater than min_coverage_days.")
        return self


AGENT_TOOLS: list[ChatCompletionToolParam] = [
    {
        "type": "function",
        "function": {
            "name": TOOL_DETECT_CLIMATE_ANOMALIES,
            "description": (
                "Calcula o Z-score de precipitação (mm) e de vendas diárias nos últimos N dias "
                "versus a média histórica por filial, identificando estiagens severas, retrações "
                "em Sementes de Pastagem e disparos de demanda em Nutrição Seca (Proteinado)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "filial_id": {
                        "type": ["integer", "null"],
                        "description": (
                            "ID da filial (1=Filial Norte - Sinop, 2=Filial Sul - Dourados, "
                            "3=Filial Cerrado - Rio Verde, 4=Filial Pantanal - Corumbá) "
                            "ou null para todas."
                        ),
                    },
                    "dias_analise": {
                        "type": "integer",
                        "description": "Janela de dias recentes para análise (padrão: 30).",
                        "default": 30,
                    },
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": TOOL_ANALYZE_CONSULTANT_AFFINITY,
            "description": (
                "Cruza volume, receita e margem média ponderada por consultor e categoria de "
                "produto, comparando o desempenho de Especialistas Técnicos (Sementes/Defensivos) "
                "contra vendedores focados em Volume/Commodity (Sal Mineral Básico com desconto)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "filial_id": {
                        "type": ["integer", "null"],
                        "description": (
                            "ID opcional da filial (1=Norte, 2=Sul, 3=Cerrado, 4=Pantanal) "
                            "ou null para todas as filiais."
                        ),
                    },
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": TOOL_RECOMMEND_STOCK_REBALANCING,
            "description": (
                "Calcula a Cobertura em Dias (Estoque Disponível / Média Diária de Vendas dos "
                "últimos 15 dias) por filial e produto, identificando lotes travados em risco "
                "de perder a janela de plantio e recomendando remanejamento (Origem -> Destino) "
                "com quantidade sugerida, valor financeiro e o consultor campeão no destino."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_coverage_days": {
                        "type": "integer",
                        "description": (
                            "Limite máximo de cobertura em dias para caracterizar excesso "
                            "crítico (padrão: 60)."
                        ),
                        "default": 60,
                    },
                    "min_coverage_days": {
                        "type": "integer",
                        "description": (
                            "Limite mínimo de cobertura em dias para caracterizar risco de "
                            "ruptura (padrão: 10)."
                        ),
                        "default": 10,
                    },
                },
                "additionalProperties": False,
            },
        },
    },
]


def _parse_raw_arguments(raw_arguments: str | dict[str, Any] | None) -> dict[str, Any]:
    """Parse raw JSON string or dictionary tool arguments into a clean dict."""
    if raw_arguments is None:
        return {}
    if isinstance(raw_arguments, dict):
        return {k: v for k, v in raw_arguments.items() if v is not None}
    if isinstance(raw_arguments, str):
        cleaned = raw_arguments.strip()
        if not cleaned:
            return {}
        parsed = json.loads(cleaned)
        if parsed is None:
            return {}
        if not isinstance(parsed, dict):
            raise ValueError("Tool arguments JSON must decode to an object.")
        return {k: v for k, v in parsed.items() if v is not None}
    raise ValueError(f"Unsupported tool arguments type: {type(raw_arguments).__name__}")


def execute_agent_tool(
    tool_name: str,
    raw_arguments: str | dict[str, Any] | None = None,
    session: Session | None = None,
) -> str:
    """Validate arguments with Pydantic and execute the requested deterministic analytics tool."""
    try:
        args_dict = _parse_raw_arguments(raw_arguments)

        if tool_name == TOOL_DETECT_CLIMATE_ANOMALIES:
            validated = DetectClimateSalesAnomaliesArgs.model_validate(args_dict)
            report = detect_climate_sales_anomalies(
                filial_id=validated.filial_id,
                dias_analise=validated.dias_analise,
                session=session,
            )
            payload = report.model_dump(mode="json", exclude={"serie_temporal"})
            return json.dumps(payload, ensure_ascii=False)

        if tool_name == TOOL_ANALYZE_CONSULTANT_AFFINITY:
            validated = AnalyzeConsultantProductAffinityArgs.model_validate(args_dict)
            report = analyze_consultant_product_affinity(
                filial_id=validated.filial_id,
                session=session,
            )
            return report.model_dump_json()

        if tool_name == TOOL_RECOMMEND_STOCK_REBALANCING:
            validated = RecommendStockRebalancingArgs.model_validate(args_dict)
            report = recommend_stock_rebalancing(
                max_coverage_days=validated.max_coverage_days,
                min_coverage_days=validated.min_coverage_days,
                session=session,
            )
            return report.model_dump_json()

        raise ValueError(f"Unknown tool '{tool_name}'. Allowed tools: {VALID_TOOL_NAMES}")
    except (ValidationError, ValueError, json.JSONDecodeError) as exc:
        return json.dumps(
            {
                "error": True,
                "tool_name": tool_name,
                "message": str(exc),
            },
            ensure_ascii=False,
        )
