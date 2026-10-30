/**
 * Strict TypeScript HTTP client mirroring FastAPI Pydantic v2 schemas in
 * `backend/app/analytics/schemas.py`. Zero usage of `any`.
 */

export type AnomalyStatus = "QUEDA_SEVERA" | "ALTA_ATIPICA" | "NORMAL";
export type AnomalySeverity = "CRITICA" | "MODERADA" | "NORMAL";
export type CoverageStatus =
  | "EXCESSO_CRITICO"
  | "RUPTURA_IMINENTE"
  | "EQUILIBRADO";

export interface DailyClimateSalesPoint {
  data: string;
  filial_id: number;
  filial_nome: string;
  precipitacao_mm: number;
  vendas_sementes_qtd: number;
  vendas_nutricao_seca_qtd: number;
}

export interface ProductSalesAnomaly {
  produto_id: number;
  produto_nome: string;
  categoria: string;
  media_diaria_historica: number;
  media_diaria_periodo: number;
  variacao_vendas_pct: number;
  vendas_z_score: number;
  correlacao_chuva_vendas: number;
  status_anomalia: AnomalyStatus;
}

export interface BranchClimateAnomaly {
  filial_id: number;
  filial_nome: string;
  microrregiao: string;
  dias_analise: number;
  precipitacao_media_historica_mm: number;
  precipitacao_media_periodo_mm: number;
  variacao_precipitacao_pct: number;
  precipitacao_z_score: number;
  queda_sementes_pct: number;
  alta_nutricao_seca_pct: number;
  anomalia_detectada: boolean;
  severidade: AnomalySeverity;
  diagnostico: string;
  produtos_afetados: ProductSalesAnomaly[];
}

export interface ClimateSalesAnomalyReport {
  dias_analise: number;
  total_anomalias_criticas: number;
  filiais: BranchClimateAnomaly[];
  serie_temporal: DailyClimateSalesPoint[];
}

export interface CategoryAffinityMetric {
  categoria: string;
  quantidade_total: number;
  receita_total: number;
  margem_media_pct: number;
  participacao_receita_filial_pct: number;
}

export interface ConsultantAffinityItem {
  consultor_id: number;
  consultor_nome: string;
  filial_id: number;
  filial_nome: string;
  perfil_foco: string;
  volume_total: number;
  receita_total: number;
  margem_media_geral_pct: number;
  margem_linhas_tecnicas_pct: number;
  volume_linhas_tecnicas: number;
  receita_linhas_tecnicas: number;
  vantagem_margem_tecnica_vs_commodity_pct: number;
  vantagem_conversao_tecnica_vs_commodity_pct: number;
  categoria_destaque: string;
  categorias: CategoryAffinityMetric[];
}

export interface ConsultantAffinityReport {
  margem_media_especialista_tecnico_pct: number;
  margem_media_volume_commodity_pct: number;
  vantagem_media_especialista_pct: number;
  vantagem_conversao_especialista_pct: number;
  consultores: ConsultantAffinityItem[];
}

export interface BranchStockCoverageItem {
  filial_id: number;
  filial_nome: string;
  produto_id: number;
  produto_nome: string;
  categoria: string;
  janela_ideal_dias: number;
  estoque_disponivel_qtd: number;
  media_diaria_vendas_15d: number;
  cobertura_atual_dias: number;
  precipitacao_media_30d_mm: number;
  status_cobertura: CoverageStatus;
}

export interface StockTransferRecommendation {
  produto_id: number;
  produto_nome: string;
  categoria: string;
  preco_unitario: number;
  janela_ideal_dias: number;
  filial_origem_id: number;
  filial_origem_nome: string;
  cobertura_origem_atual_dias: number;
  estoque_origem_disponivel_qtd: number;
  media_diaria_origem_15d: number;
  filial_destino_id: number;
  filial_destino_nome: string;
  cobertura_destino_atual_dias: number;
  estoque_destino_disponivel_qtd: number;
  media_diaria_destino_15d: number;
  precipitacao_destino_30d_mm: number;
  quantidade_sugerida: number;
  valor_financeiro_lote_reais: number;
  cobertura_origem_pos_transferencia_dias: number;
  cobertura_destino_pos_transferencia_dias: number;
  risco_perda_janela_plantio: boolean;
  consultor_recomendado_id: number;
  consultor_recomendado_nome: string;
  consultor_recomendado_perfil: string;
  consultor_margem_media_produto_pct: number;
  justificativa: string;
}

export interface StockRebalancingReport {
  max_coverage_days: number;
  min_coverage_days: number;
  total_valor_risco_encalhe_reais: number;
  total_transferencias_sugeridas: number;
  recomendacoes: StockTransferRecommendation[];
  cobertura_filiais: BranchStockCoverageItem[];
}

export interface HealthCheckResponse {
  status: "ok";
  database_seeded: boolean;
  records: Record<string, number>;
}

export interface DashboardOverviewResponse {
  anomalias_climaticas: ClimateSalesAnomalyReport;
  afinidade_consultores: ConsultantAffinityReport;
  remanejamento_estoque: StockRebalancingReport;
}

export interface AgentChatRequest {
  message: string;
}

export interface AgentChatResponse {
  reply: string;
  tools_used: string[];
}

export interface DashboardOverviewQueryParams {
  filial_id?: number | null;
  dias_analise?: number;
  max_coverage_days?: number;
  min_coverage_days?: number;
}

const DEFAULT_API_BASE_URL = "http://localhost:8000";

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, "");
  }
  return DEFAULT_API_BASE_URL;
}

export class ApiClientError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

async function parseErrorDetail(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "detail" in data &&
      typeof (data as { detail: unknown }).detail === "string"
    ) {
      return (data as { detail: string }).detail;
    }
  } catch {
    // Ignore JSON parsing errors on non-JSON error bodies
  }
  return `Erro HTTP ${response.status}: ${response.statusText}`;
}

export async function fetchHealthCheck(
  signal?: AbortSignal
): Promise<HealthCheckResponse> {
  const url = `${getApiBaseUrl()}/api/health`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    const detail = await parseErrorDetail(response);
    throw new ApiClientError(detail, response.status);
  }

  return (await response.json()) as HealthCheckResponse;
}

export async function fetchDashboardOverview(
  params?: DashboardOverviewQueryParams,
  signal?: AbortSignal
): Promise<DashboardOverviewResponse> {
  const searchParams = new URLSearchParams();
  if (params?.filial_id !== undefined && params.filial_id !== null) {
    searchParams.set("filial_id", String(params.filial_id));
  }
  if (params?.dias_analise !== undefined) {
    searchParams.set("dias_analise", String(params.dias_analise));
  }
  if (params?.max_coverage_days !== undefined) {
    searchParams.set("max_coverage_days", String(params.max_coverage_days));
  }
  if (params?.min_coverage_days !== undefined) {
    searchParams.set("min_coverage_days", String(params.min_coverage_days));
  }

  const queryString = searchParams.toString();
  const url = `${getApiBaseUrl()}/api/dashboard/overview${
    queryString ? `?${queryString}` : ""
  }`;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    const detail = await parseErrorDetail(response);
    throw new ApiClientError(detail, response.status);
  }

  return (await response.json()) as DashboardOverviewResponse;
}

export async function sendAgentChatMessage(
  message: string,
  signal?: AbortSignal
): Promise<AgentChatResponse> {
  const payload: AgentChatRequest = { message };
  const url = `${getApiBaseUrl()}/api/agent/chat`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const detail = await parseErrorDetail(response);
    throw new ApiClientError(detail, response.status);
  }

  return (await response.json()) as AgentChatResponse;
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCompactBRL(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `R$ ${(value / 1_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}k`;
  }
  return formatCurrencyBRL(value);
}

export function formatNumberBR(value: number, decimals = 1): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
