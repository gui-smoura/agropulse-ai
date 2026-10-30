# SPEC.md — AgroPulse AI: Copiloto Agêntico de Inteligência Comercial e Estoque (Full-Stack Monorepo)



## 1. Visão Geral e Restrição de Escopo (Anti-Bloat)

Sistema agêntico de inteligência comercial voltado para distribuidoras de insumos agropecuários (sementes, nutrição animal e defensivos). O sistema cruza histórico de vendas, cobertura de estoque e dados climáticos (precipitação) para diagnosticar anomalias, mapear a performance de consultores por linha de produto e recomendar o remanejamento de lotes entre filiais antes da perda de janela de plantio/validade.

**REGRA DE OURO DE ESCOPO (O QUE NÃO FAZER):**

* **NÃO** construir telas de CRUD (cadastro de clientes, produtos, login/autenticação, emissão de pedidos ou financeiro).
* **NÃO** usar frameworks pesados de agentes (LangChain/CrewAI). Usar o SDK padrão `openai` (compatível com Groq, Google AI Studio e LM Studio) com *Tool Calling* nativo e validação `Pydantic`.
* O foco é um **Live Demo de Portfólio**: o banco SQLite deve ser gerado automaticamente no boot do servidor FastAPI (`lifespan`) caso não exista, garantindo funcionamento contínuo em containers gratuitos com disco efêmero.

---

## 2. Arquitetura Monorepo e Clean Code

Estrutura modular obrigatória seguindo *Single Responsibility Principle (SRP)*:

```text
agropulse-ai/
├── .github/workflows/ci.yml        # Pipeline de CI (Backend Ruff/Pytest + Frontend Lint/Build)
├── backend/
│   ├── app/
│   │   ├── main.py                 # Entrypoint FastAPI, CORS, Lifespan (Auto-Seed) e Rotas
│   │   ├── config.py               # Variáveis de ambiente (Pydantic Settings)
│   │   ├── rate\\\_limit.py           # Proteção em memória por IP para a rota do Agente LLM
│   │   ├── database/
│   │   │   ├── models.py           # Schema SQLite / SQLAlchemy
│   │   │   └── seed\\\_generator.py   # Gerador determinístico de 2 anos de dados sintéticos
│   │   ├── analytics/
│   │   │   ├── schemas.py          # Contratos Pydantic (Responses da API e Tools)
│   │   │   └── engine.py           # Funções matemáticas/estatísticas puras
│   │   └── agent/
│   │       ├── tools.py            # Definição das ferramentas para o LLM
│   │       └── orchestrator.py     # Cliente LLM, System Prompt e loop de Tool Calling
│   ├── tests/
│   │   └── test\\\_analytics.py       # Testes unitários do motor matemático e endpoints
│   ├── Dockerfile                  # Container enxuto (python:3.11-slim) para deploy gratuito
│   └── pyproject.toml              # Dependências do backend, Ruff e Pytest
├── frontend/
│   ├── src/
│   │   ├── app/                    # Next.js App Router (Dashboard principal em page.tsx)
│   │   ├── components/
│   │   │   ├── kpi-cards.tsx       # Cards de resumo executivo e alertas críticos
│   │   │   ├── anomaly-chart.tsx   # Gráfico Vendas vs. Chuva (Recharts)
│   │   │   ├── rebalance-table.tsx # Tabela de remanejamento sugerido entre filiais
│   │   │   └── agent-copilot.tsx   # Drawer/Painel de Chat com prompts rápidos sugeridos
│   │   └── lib/
│   │       └── api.ts              # Cliente HTTP tipado conectando ao FastAPI
│   ├── package.json
│   └── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
└── SPEC.md
```
---
## 3. Diretrizes de Clean Code:
Tipagem Estrita Ponta a Ponta: 

* Python 3.11+ com Type Hints e modelos Pydantic no back-end; TypeScript estrito (sem any) no front-end Next.js.
* Separação Determinístico vs. Probabilístico: O LLM jamais faz cálculos. Toda agregação, Z-score, correlação e cálculo de cobertura ocorre em backend/app/analytics/engine.py e retorna JSONs estruturados.
* Auto-Seed Resiliente para Cloud: No main.py, o gerenciador de contexto lifespan do FastAPI deve checar se o banco SQLite existe e possui dados; caso contrário, executa seed_generator.py automaticamente antes de aceitar requisições.
* Proteção de Demo Público: A rota POST /api/agent/chat deve limitar requisições por IP (ex: máx. 15 chamadas/hora) para proteger a cota gratuita da API de LLM.
---
## 4. Modelagem de Dados (SQLite) e Padrões Sintéticos (seed_generator.py)
Criar apenas 5 tabelas:

1. filiais: id, nome, cidade, microrregiao (Norte, Sul, Cerrado, Pantanal).
2. consultores: id, nome, filial_id, perfil_foco (Especialista Técnico, Volume/Commodity).
3. produtos: id, nome, categoria (Sementes, Nutrição Águas, Nutrição Seca, Defensivos), janela_ideal_dias, preco_unitario, margem_alvo_pct.
4. posicao_estoque_clima: id, data, filial_id, produto_id, entradas_qtd, saldo_disponivel_qtd, precipitacao_mm.

5. registro_vendas: id, data, filial_id, consultor_id, produto_id, quantidade_vendida, margem_aplicada_pct.

Padrões Ocultos Obrigatórios nos 730 dias gerados:

1. Anomalia Climática vs. Sazonalidade: Atraso severo de chuva nos últimos 30 dias na Filial Norte, derrubando a venda de Sementes de Pastagem em >50% e disparando a procura por Proteinado de Seca.

2. Afinidade Consultor-Produto: Consultores específicos com conversão e margem 35% a 45% superiores em linhas técnicas (Defensivos/Sementes Premium) vs. vendedores focados apenas em volume de sal mineral básico com desconto.

3. Desequilíbrio de Estoque (Gatilho de Transferência): Lote grande de Sementes travado na Filial Norte (Cobertura > 65 dias, risco de perder janela de plantio), enquanto a Filial Sul recebeu chuva regular, está com Cobertura < 8 dias e possui o consultor campeão de vendas daquela linha.
---
## 5. Motor Analítico, Tool Calling e Endpoints FastAPI

Implementar 3 funções em analytics/engine.py que alimentam tanto os gráficos da UI quanto as Tools do Agente:

* detect_climate_sales_anomalies(filial_id: int | None = None, dias_analise: int = 30)
		Calcula Z-score de vendas e precipitação vs. média histórica.
	
*  analyze_consultant_product_affinity(filial_id: int | None = None)
		Cruza volume, receita e margem média por consultor e categoria.

* recommend_stock_rebalancing(max_coverage_days: int = 60, min_coverage_days: int = 10)
	
	Fórmula: $\\\\text{Cobertura em Dias} = \\\frac{\\\\text{Estoque Disponível}}{\\\\text{Média Diária de Vendas (últimos 15 dias)}}$.

* Retorna pares de filiais (Origem -> Destino), quantidade sugerida de transferência e o consultor recomendado na filial de destino.

Contrato de Rotas FastAPI (backend/app/main.py):
1. GET /api/health -> Status do servidor e confirmação do banco populado.
2. GET /api/dashboard/overview -> Retorna dados consolidados das 3 funções analíticas para renderização rápida dos gráficos e tabelas no Next.js sem gastar tokens de LLM.
3. POST /api/agent/chat -> Recebe { "message": str }, executa o loop de Tool Calling do agente consultando as funções analíticas sob demanda e retorna { "reply": str, "tools_used": list[str] }.
---
## 6. Front-end Executivo (frontend/ - Next.js + Tailwind + Recharts)

Interface em tela única (Dashboard + Copiloto Lateral) limpa, responsiva e em modo escuro/corporativo:

* Topo: Indicadores principais (Valor em Risco de Encalhe, Anomalias Climáticas Ativas, Oportunidades de Remanejamento).
* Centro: Gráfico combinando Precipitação (mm) vs. Giro de Sementes/Nutrição por filial + Tabela de Remanejamento de Estoque e Afinidade de Consultores.
* Lateral Direita (Copiloto Agêntico): Chat interativo exibindo quais Tools o agente acionou nos bastidores (badge visual ex: ⚡ Acionou: recommend_stock_rebalancing) e 3 botões de prompt rápido para avaliadores testarem com um clique.

## 7. Fluxo de Git, GitHub Público, CI/CD e Deploy
### 1. Padrão de Commits (Conventional Commits):

	chore: initialize monorepo structure and gitignore

	feat(backend): implement sqlite schema, auto-seed and deterministic analytics engine

	test(backend): add unit tests for stock coverage and anomaly detection

	feat(agent): build openai-compatible tool calling orchestrator and 
	fastapi routes
	
	feat(frontend): create nextjs executive dashboard and agent copilot interface
	
	ci: configure github actions for backend pytest/ruff and frontend build
	
	docs: add portfolio README with mermaid architecture and live demo links
### 2. Variáveis de Ambiente para Deploy:
	Backend (.env): LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, CORS_ORIGINS.
	Frontend (.env.local): NEXT_PUBLIC_API_URL.


