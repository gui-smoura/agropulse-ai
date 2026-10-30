"""OpenAI-compatible LLM orchestrator with native Tool Calling and deterministic fallback."""

import json
import logging
import re
from typing import Any

from openai import OpenAI, OpenAIError
from sqlalchemy.orm import Session

from app.agent.tools import (
    AGENT_TOOLS,
    TOOL_ANALYZE_CONSULTANT_AFFINITY,
    TOOL_DETECT_CLIMATE_ANOMALIES,
    TOOL_RECOMMEND_STOCK_REBALANCING,
    VALID_TOOL_NAMES,
    execute_agent_tool,
)
from app.analytics.schemas import (
    AgentChatResponse,
    ConsultantAffinityReport,
    StockRebalancingReport,
)
from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 4
PLACEHOLDER_API_KEYS = {"", "your_api_key_here", "changeme", "none", "null"}

_BRANCH_PATTERNS: tuple[tuple[int, re.Pattern[str]], ...] = (
    (1, re.compile(r"\b(?:filial\s+norte|sinop|norte)\b", re.IGNORECASE)),
    (2, re.compile(r"\b(?:filial\s+sul|dourados|sul)\b", re.IGNORECASE)),
    (3, re.compile(r"\b(?:filial\s+cerrado|rio\s+verde|cerrado)\b", re.IGNORECASE)),
    (4, re.compile(r"\b(?:filial\s+pantanal|corumb[aá]|pantanal)\b", re.IGNORECASE)),
)
_DAYS_WINDOW_PATTERN = re.compile(r"\b(\d{1,3})\s*dias\b", re.IGNORECASE)

SYSTEM_PROMPT = (
    "Você é o AgroPulse AI, Copiloto Executivo de Inteligência Comercial e Estoque para "
    "distribuidoras de insumos agropecuários (Sementes de Pastagem, Nutrição Animal "
    "Águas/Seca e Defensivos).\n\n"
    "DIRETRIZES OBRIGATÓRIAS:\n"
    "1. SEPARAÇÃO DETERMINÍSTICO VS. PROBABILÍSTICO: Você JAMAIS deve realizar cálculos "
    "matemáticos, estatísticos, de cobertura de estoque, Z-score ou margens por conta "
    "própria. Sempre acione as ferramentas analíticas disponíveis "
    "(`detect_climate_sales_anomalies`, `analyze_consultant_product_affinity`, "
    "`recommend_stock_rebalancing`) e interprete exclusivamente os números exatos "
    "retornados pelos JSONs das ferramentas.\n"
    "2. FOCO EXECUTIVO E ACIONÁVEL: Responda sempre em português brasileiro claro, "
    "objetivo e estruturado para tomada de decisão de diretoria comercial e operações:\n"
    "   - Destaque anomalias climáticas críticas (Z-score de precipitação, queda em "
    "Sementes e alta em Nutrição Seca/Proteinado).\n"
    "   - Em recomendações de remanejamento de estoque, cite explicitamente a filial de "
    "origem, a filial de destino, o produto, a cobertura atual e pós-transferência "
    "(em dias), a quantidade sugerida, o valor financeiro do lote (R$) e o consultor "
    "recomendado na ponta de destino.\n"
    "   - Em análises de equipe comercial, compare a conversão e a margem média dos "
    "Especialistas Técnicos em linhas técnicas (Sementes/Defensivos) frente ao perfil "
    "Volume/Commodity.\n"
    "3. ESCOPO RESTRITO: Não invente dados de filiais, produtos ou consultores que não "
    "constem no retorno das ferramentas."
)


def _has_valid_api_key(settings: Settings) -> bool:
    """Return True if a real LLM API key is configured."""
    cleaned = settings.llm_api_key.strip()
    return cleaned.lower() not in PLACEHOLDER_API_KEYS


def _extract_fallback_branch_id(message: str) -> int | None:
    """Extract a specific filial_id (1..4) if the user message targets a single branch."""
    matched_ids = [
        branch_id for branch_id, pattern in _BRANCH_PATTERNS if pattern.search(message)
    ]
    if len(matched_ids) == 1:
        return matched_ids[0]
    return None


def _extract_fallback_days(message: str) -> int:
    """Extract an analysis window in days (1..365) from natural language, defaulting to 30."""
    match = _DAYS_WINDOW_PATTERN.search(message)
    if match:
        days = int(match.group(1))
        if 1 <= days <= 365:
            return days
    return 30


def _select_fallback_tools(message: str) -> list[str]:
    """Select which deterministic tools to invoke based on the user's message intent."""
    msg = message.lower()
    selected: list[str] = []

    climate_keywords = (
        "clima",
        "climátic",
        "climatic",
        "chuva",
        "estiagem",
        "seca",
        "anomalia",
        "z-score",
        "zscore",
        "precipita",
        "sazonal",
        "queda",
        "caíram",
        "cairam",
        "caiu",
        "retraç",
        "retrac",
        "atraso",
        "proteinado",
        "sinop",
    )
    stock_keywords = (
        "estoque",
        "remanejamento",
        "remanejar",
        "transfer",
        "cobertura",
        "encalhe",
        "ruptura",
        "lote",
        "janela",
        "plantio",
        "desequilíbrio",
        "desequilibrio",
    )
    consultant_keywords = (
        "consultor",
        "vendedor",
        "afinidade",
        "margem",
        "conversão",
        "conversao",
        "especialista",
        "commodity",
        "desconto",
        "equipe",
        "performance",
        "helena",
        "carlos",
        "roberto",
        "fernanda",
        "gabriel",
    )

    if any(kw in msg for kw in climate_keywords):
        selected.append(TOOL_DETECT_CLIMATE_ANOMALIES)
    if any(kw in msg for kw in stock_keywords):
        selected.append(TOOL_RECOMMEND_STOCK_REBALANCING)
    if any(kw in msg for kw in consultant_keywords):
        selected.append(TOOL_ANALYZE_CONSULTANT_AFFINITY)

    if not selected:
        return [
            TOOL_DETECT_CLIMATE_ANOMALIES,
            TOOL_RECOMMEND_STOCK_REBALANCING,
            TOOL_ANALYZE_CONSULTANT_AFFINITY,
        ]

    return selected


def _format_brl(value: float) -> str:
    """Format a float as Brazilian currency (R$ 1.234,56)."""
    formatted = f"{value:,.2f}"
    return "R$ " + formatted.replace(",", "X").replace(".", ",").replace("X", ".")


def _run_deterministic_fallback(
    message: str,
    session: Session | None = None,
) -> AgentChatResponse:
    """Execute relevant tools deterministically and synthesize an executive Portuguese response."""
    tools_to_run = _select_fallback_tools(message)
    target_filial_id = _extract_fallback_branch_id(message)
    target_days = _extract_fallback_days(message)
    tools_used: list[str] = []
    sections: list[str] = [
        "### Diagnóstico Executivo AgroPulse AI",
    ]

    for tool_name in tools_to_run:
        if tool_name == TOOL_DETECT_CLIMATE_ANOMALIES:
            tool_args: dict[str, Any] = {
                "filial_id": target_filial_id,
                "dias_analise": target_days,
            }
        elif tool_name == TOOL_ANALYZE_CONSULTANT_AFFINITY:
            tool_args = {"filial_id": target_filial_id}
        else:
            tool_args = {}

        raw_json = execute_agent_tool(tool_name, tool_args, session=session)
        tools_used.append(tool_name)
        data: dict[str, Any] = json.loads(raw_json)

        if tool_name == TOOL_DETECT_CLIMATE_ANOMALIES:
            filiais = data.get("filiais", [])
            dias_janela = data.get("dias_analise", target_days)
            criticas = [f for f in filiais if f.get("severidade") == "CRITICA"]
            normais = [f for f in filiais if f.get("severidade") != "CRITICA"]

            lines = [
                f"#### 1. Monitoramento Agroclimático e Giro de Insumos "
                f"(Últimos {dias_janela} dias)"
            ]
            if criticas:
                for c in criticas:
                    rain_rec = c["precipitacao_media_periodo_mm"]
                    rain_hist = c["precipitacao_media_historica_mm"]
                    rain_var = c["variacao_precipitacao_pct"]
                    rain_z = c["precipitacao_z_score"]
                    sem_drop = c["queda_sementes_pct"]
                    seca_up = c["alta_nutricao_seca_pct"]
                    lines.append(
                        f"- **Alerta Crítico — {c['filial_nome']} ({c['microrregiao']})**: "
                        f"Precipitação média caiu para **{rain_rec:.2f} mm/dia** vs. "
                        f"histórico de **{rain_hist:.2f} mm/dia** (**{rain_var:.1f}%**, "
                        f"Z-score **{rain_z:.2f}**). Impacto direto: retração de "
                        f"**{sem_drop:.1f}%** nas vendas de **Sementes** e disparo de "
                        f"**+{seca_up:.1f}%** na procura por **Nutrição Seca (Proteinado)**."
                    )
                    for prod in c.get("produtos_afetados", []):
                        if prod.get("status_anomalia") in ("QUEDA_SEVERA", "ALTA_ATIPICA"):
                            p_rec = prod["media_diaria_periodo"]
                            p_hist = prod["media_diaria_historica"]
                            p_var = prod["variacao_vendas_pct"]
                            p_z = prod["vendas_z_score"]
                            lines.append(
                                f"  - *{prod['produto_nome']}* ({prod['categoria']}): "
                                f"média recente de {p_rec:.1f} un/dia vs. {p_hist:.1f} un/dia "
                                f"({p_var:+.1f}%, Z={p_z:.2f})."
                            )
                if normais:
                    nomes_normais = ", ".join(
                        f"{n['filial_nome']} ({n['precipitacao_media_periodo_mm']:.1f} mm/dia)"
                        for n in normais
                    )
                    verbo = "opera" if len(normais) == 1 else "operam"
                    lines.append(
                        f"- **Filiais em Regime Regular**: {nomes_normais} {verbo} dentro da "
                        f"normalidade sazonal sem anomalias críticas."
                    )
            elif normais:
                for n in normais:
                    rain_rec = n["precipitacao_media_periodo_mm"]
                    rain_hist = n["precipitacao_media_historica_mm"]
                    rain_var = n["variacao_precipitacao_pct"]
                    rain_z = n["precipitacao_z_score"]
                    sem_var = n["queda_sementes_pct"]
                    seca_var = n["alta_nutricao_seca_pct"]
                    lines.append(
                        f"- **Regime Regular — {n['filial_nome']} ({n['microrregiao']})**: "
                        f"Precipitação média de **{rain_rec:.2f} mm/dia** vs. histórico de "
                        f"**{rain_hist:.2f} mm/dia** ({rain_var:+.1f}%, Z-score **{rain_z:.2f}**). "
                        f"Variação em Sementes de **{sem_var:+.1f}%** e Nutrição Seca de "
                        f"**{seca_var:+.1f}%** (sem anomalias críticas)."
                    )
            sections.append("\n".join(lines))

        elif tool_name == TOOL_RECOMMEND_STOCK_REBALANCING:
            reb_report = StockRebalancingReport.model_validate(data)
            risco_brl = _format_brl(reb_report.total_valor_risco_encalhe_reais)
            lines = [
                "#### 2. Plano de Remanejamento de Estoque entre Filiais",
                (
                    f"- **Capital em Risco de Encalhe/Perda de Janela**: "
                    f"**{risco_brl}** "
                    f"({reb_report.total_transferencias_sugeridas} operações recomendadas)."
                ),
            ]
            for rec in reb_report.recomendacoes:
                lote_brl = _format_brl(rec.valor_financeiro_lote_reais)
                orig_cov = rec.cobertura_origem_atual_dias
                orig_pos = rec.cobertura_origem_pos_transferencia_dias
                dest_cov = rec.cobertura_destino_atual_dias
                dest_pos = rec.cobertura_destino_pos_transferencia_dias
                lines.append(
                    f"- **Transferir {rec.quantidade_sugerida:.0f} un. de {rec.produto_nome}** "
                    f"({lote_brl}): **{rec.filial_origem_nome}** (cobertura atual de "
                    f"**{orig_cov:.1f} dias** → pós-transferência **{orig_pos:.1f} dias**) "
                    f"para **{rec.filial_destino_nome}** (cobertura crítica de "
                    f"**{dest_cov:.1f} dias** → pós-transferência **{dest_pos:.1f} dias**, "
                    f"chuva regular de {rec.precipitacao_destino_30d_mm:.1f} mm/dia). "
                    f"Alocar carteira prioritária para **{rec.consultor_recomendado_nome}** "
                    f"(*{rec.consultor_recomendado_perfil}*, margem média de "
                    f"**{rec.consultor_margem_media_produto_pct:.1f}%**)."
                )
            sections.append("\n".join(lines))

        elif tool_name == TOOL_ANALYZE_CONSULTANT_AFFINITY:
            aff_report = ConsultantAffinityReport.model_validate(data)
            spec_m = aff_report.margem_media_especialista_tecnico_pct
            comm_m = aff_report.margem_media_volume_commodity_pct
            adv_m = aff_report.vantagem_media_especialista_pct
            adv_c = aff_report.vantagem_conversao_especialista_pct
            lines = [
                "#### 3. Afinidade Consultor-Produto e Performance de Margem",
                (
                    f"- **Superioridade Técnica Comprovada**: Consultores de perfil "
                    f"**Especialista Técnico** entregam margem média de **{spec_m:.2f}%** em "
                    f"linhas técnicas (Sementes e Defensivos) contra **{comm_m:.2f}%** do "
                    f"perfil **Volume/Commodity** — uma vantagem de **+{adv_m:.1f}% em margem** "
                    f"e **+{adv_c:.1f}% em volume/conversão**."
                ),
            ]
            if target_filial_id is not None:
                displayed_consultants = aff_report.consultores
            else:
                displayed_consultants = [
                    c for c in aff_report.consultores if c.perfil_foco == "Especialista Técnico"
                ][:3]
            for cons in displayed_consultants:
                rec_brl = _format_brl(cons.receita_linhas_tecnicas)
                adv_branch = cons.vantagem_margem_tecnica_vs_commodity_pct
                lines.append(
                    f"- **{cons.consultor_nome}** ({cons.filial_nome} — *{cons.perfil_foco}*): "
                    f"margem em linhas técnicas de **{cons.margem_linhas_tecnicas_pct:.2f}%** "
                    f"({adv_branch:+.1f}% vs. benchmark commodity da filial) "
                    f"e receita técnica de **{rec_brl}**."
                )
            sections.append("\n".join(lines))

    return AgentChatResponse(
        reply="\n\n".join(sections),
        tools_used=tools_used,
    )


def run_agent_chat(
    message: str,
    session: Session | None = None,
    settings: Settings | None = None,
    openai_client: OpenAI | None = None,
) -> AgentChatResponse:
    """Run the OpenAI-compatible Tool Calling loop or fallback deterministically if unconfigured."""
    active_settings = settings or get_settings()
    cleaned_message = message.strip()
    if not cleaned_message:
        raise ValueError("A mensagem enviada ao agente não pode estar vazia.")

    if openai_client is None and not _has_valid_api_key(active_settings):
        return _run_deterministic_fallback(cleaned_message, session=session)

    client = openai_client or OpenAI(
        api_key=active_settings.llm_api_key,
        base_url=active_settings.llm_base_url,
    )

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": cleaned_message},
    ]
    tools_used: list[str] = []

    try:
        for _ in range(MAX_TOOL_ITERATIONS):
            completion = client.chat.completions.create(
                model=active_settings.llm_model,
                messages=messages,  # type: ignore[arg-type]
                tools=AGENT_TOOLS,
                tool_choice="auto",
                temperature=0.1,
            )
            if not completion.choices:
                return _run_deterministic_fallback(cleaned_message, session=session)

            assistant_msg = completion.choices[0].message
            tool_calls = assistant_msg.tool_calls

            if not tool_calls:
                final_reply = (assistant_msg.content or "").strip()
                if not final_reply or not tools_used:
                    return _run_deterministic_fallback(cleaned_message, session=session)
                return AgentChatResponse(reply=final_reply, tools_used=tools_used)

            messages.append(
                {
                    "role": "assistant",
                    "content": assistant_msg.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in tool_calls
                    ],
                }
            )

            for tc in tool_calls:
                fn_name = tc.function.name
                fn_args = tc.function.arguments
                tool_result_json = execute_agent_tool(fn_name, fn_args, session=session)
                parsed_result = json.loads(tool_result_json)
                if (
                    fn_name in VALID_TOOL_NAMES
                    and not parsed_result.get("error")
                    and fn_name not in tools_used
                ):
                    tools_used.append(fn_name)

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": tool_result_json,
                    }
                )

        # Max iterations reached after executing tools; request final synthesis
        final_completion = client.chat.completions.create(
            model=active_settings.llm_model,
            messages=messages,  # type: ignore[arg-type]
            temperature=0.1,
        )
        if final_completion.choices:
            final_text = (final_completion.choices[0].message.content or "").strip()
            if final_text and tools_used:
                return AgentChatResponse(reply=final_text, tools_used=tools_used)
        return _run_deterministic_fallback(cleaned_message, session=session)

    except OpenAIError as exc:
        logger.warning(
            "LLM provider request failed (%s); falling back to deterministic synthesis.",
            exc,
        )
        fallback_response = _run_deterministic_fallback(cleaned_message, session=session)
        merged_tools = list(dict.fromkeys(tools_used + fallback_response.tools_used))
        return AgentChatResponse(reply=fallback_response.reply, tools_used=merged_tools)

