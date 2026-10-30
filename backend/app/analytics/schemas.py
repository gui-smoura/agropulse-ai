"""Strict Pydantic v2 schemas for deterministic analytics and API/Tool contracts."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DailyClimateSalesPoint(BaseModel):
    """Daily time-series point combining rainfall and sales by key category."""

    model_config = ConfigDict(extra="forbid")

    data: date
    filial_id: int
    filial_nome: str
    precipitacao_mm: float
    vendas_sementes_qtd: float
    vendas_nutricao_seca_qtd: float


class ProductSalesAnomaly(BaseModel):
    """Statistical sales anomaly metrics for a product or category within a branch."""

    model_config = ConfigDict(extra="forbid")

    produto_id: int
    produto_nome: str
    categoria: str
    media_diaria_historica: float
    media_diaria_periodo: float
    variacao_vendas_pct: float
    vendas_z_score: float
    correlacao_chuva_vendas: float
    status_anomalia: Literal["QUEDA_SEVERA", "ALTA_ATIPICA", "NORMAL"]


class BranchClimateAnomaly(BaseModel):
    """Climate and sales anomaly diagnostic for a single branch."""

    model_config = ConfigDict(extra="forbid")

    filial_id: int
    filial_nome: str
    microrregiao: str
    dias_analise: int
    precipitacao_media_historica_mm: float
    precipitacao_media_periodo_mm: float
    variacao_precipitacao_pct: float
    precipitacao_z_score: float
    queda_sementes_pct: float
    alta_nutricao_seca_pct: float
    anomalia_detectada: bool
    severidade: Literal["CRITICA", "MODERADA", "NORMAL"]
    diagnostico: str
    produtos_afetados: list[ProductSalesAnomaly]


class ClimateSalesAnomalyReport(BaseModel):
    """Output contract for `detect_climate_sales_anomalies`."""

    model_config = ConfigDict(extra="forbid")

    dias_analise: int
    total_anomalias_criticas: int
    filiais: list[BranchClimateAnomaly]
    serie_temporal: list[DailyClimateSalesPoint]


class CategoryAffinityMetric(BaseModel):
    """Consultant performance metrics within a single product category."""

    model_config = ConfigDict(extra="forbid")

    categoria: str
    quantidade_total: float
    receita_total: float
    margem_media_pct: float
    participacao_receita_filial_pct: float


class ConsultantAffinityItem(BaseModel):
    """Comprehensive performance and technical affinity profile for a consultant."""

    model_config = ConfigDict(extra="forbid")

    consultor_id: int
    consultor_nome: str
    filial_id: int
    filial_nome: str
    perfil_foco: str
    volume_total: float
    receita_total: float
    margem_media_geral_pct: float
    margem_linhas_tecnicas_pct: float
    volume_linhas_tecnicas: float
    receita_linhas_tecnicas: float
    vantagem_margem_tecnica_vs_commodity_pct: float = Field(
        description=(
            "Percentage superiority of this consultant's technical margin "
            "compared to the Volume/Commodity profile benchmark."
        )
    )
    vantagem_conversao_tecnica_vs_commodity_pct: float = Field(
        description=(
            "Percentage superiority of this consultant's technical sales volume "
            "compared to the Volume/Commodity profile benchmark in the same branch."
        )
    )
    categoria_destaque: str
    categorias: list[CategoryAffinityMetric]


class ConsultantAffinityReport(BaseModel):
    """Output contract for `analyze_consultant_product_affinity`."""

    model_config = ConfigDict(extra="forbid")

    margem_media_especialista_tecnico_pct: float
    margem_media_volume_commodity_pct: float
    vantagem_media_especialista_pct: float = Field(
        description=(
            "Overall relative margin superiority (%) of Technical Specialists "
            "over Volume/Commodity sellers in technical lines (expected 35% to 45%)."
        )
    )
    vantagem_conversao_especialista_pct: float = Field(
        description=(
            "Overall relative volume/conversion superiority (%) of Technical Specialists "
            "over Volume/Commodity sellers in technical lines."
        )
    )
    consultores: list[ConsultantAffinityItem]


class BranchStockCoverageItem(BaseModel):
    """Current stock coverage snapshot for a branch and product."""

    model_config = ConfigDict(extra="forbid")

    filial_id: int
    filial_nome: str
    produto_id: int
    produto_nome: str
    categoria: str
    janela_ideal_dias: int
    estoque_disponivel_qtd: float
    media_diaria_vendas_15d: float
    cobertura_atual_dias: float
    precipitacao_media_30d_mm: float
    status_cobertura: Literal["EXCESSO_CRITICO", "RUPTURA_IMINENTE", "EQUILIBRADO"]


class StockTransferRecommendation(BaseModel):
    """Actionable inter-branch stock transfer recommendation."""

    model_config = ConfigDict(extra="forbid")

    produto_id: int
    produto_nome: str
    categoria: str
    preco_unitario: float
    janela_ideal_dias: int
    filial_origem_id: int
    filial_origem_nome: str
    cobertura_origem_atual_dias: float
    estoque_origem_disponivel_qtd: float
    media_diaria_origem_15d: float
    filial_destino_id: int
    filial_destino_nome: str
    cobertura_destino_atual_dias: float
    estoque_destino_disponivel_qtd: float
    media_diaria_destino_15d: float
    precipitacao_destino_30d_mm: float
    quantidade_sugerida: float
    valor_financeiro_lote_reais: float
    cobertura_origem_pos_transferencia_dias: float
    cobertura_destino_pos_transferencia_dias: float
    risco_perda_janela_plantio: bool
    consultor_recomendado_id: int
    consultor_recomendado_nome: str
    consultor_recomendado_perfil: str
    consultor_margem_media_produto_pct: float
    justificativa: str


class StockRebalancingReport(BaseModel):
    """Output contract for `recommend_stock_rebalancing`."""

    model_config = ConfigDict(extra="forbid")

    max_coverage_days: int
    min_coverage_days: int
    total_valor_risco_encalhe_reais: float
    total_transferencias_sugeridas: int
    recomendacoes: list[StockTransferRecommendation]
    cobertura_filiais: list[BranchStockCoverageItem]


class HealthCheckResponse(BaseModel):
    """Output contract for `GET /api/health`."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"]
    database_seeded: bool
    records: dict[str, int]


class DashboardOverviewResponse(BaseModel):
    """Consolidated output contract for `GET /api/dashboard/overview`."""

    model_config = ConfigDict(extra="forbid")

    anomalias_climaticas: ClimateSalesAnomalyReport
    afinidade_consultores: ConsultantAffinityReport
    remanejamento_estoque: StockRebalancingReport


class AgentChatRequest(BaseModel):
    """Input payload contract for `POST /api/agent/chat`."""

    model_config = ConfigDict(extra="forbid")

    message: str = Field(
        min_length=1,
        max_length=2000,
        description="Pergunta ou comando executivo enviado ao Copiloto Agêntico.",
    )


class AgentChatResponse(BaseModel):
    """Output payload contract for `POST /api/agent/chat`."""

    model_config = ConfigDict(extra="forbid")

    reply: str
    tools_used: list[str]

