# DESIGN.md — AgroPulse AI Design System & Architecture Specification

## 1. Visão Geral & Filosofia de Design (Brand Identity)

O **AgroPulse AI** é uma plataforma executiva de inteligência comercial e logística preditiva para distribuidoras de insumos agropecuários. 

O direcionamento visual abandona a estética genérica de "terminal hacker / cyber tech" para adotar uma **identidade visual corporativa do agronegócio de alta precisão (Executive Agro Dark)**. O design equilibra a robustez da terra e da lavoura com o rigor matemático de algoritmos determinísticos e copilotos de inteligência artificial.

### Princípios Norteadores:
1. **Rigor e Transparência Determinística:** Métricas analíticas e cálculos não alucinam. A interface visual deve comunicar confiabilidade, clareza tipográfica em números e contratos rígidos.
2. **Estética da Safra e Clima:** O fundo em tons profundos de solo e mata virgem contrasta com acentos luminosos de lavoura em pleno desenvolvimento e alertas orgânicos de estiagem/seca.
3. **Ergonomia Executiva B2B:** Densidade de informação equilibrada, permitindo tomadas de decisão rápidas (aprovação de lotes, remanejamento e auditoria) sem ruído cognitivo.

---

## 2. Paleta de Cores e Tokens Semânticos

A paleta é estruturada com base no tema corporativo dark agro (`AgroPulse Executive UI`):

### 2.1 Superfícies & Fundos (Surfaces)
* **`surface-canvas` (`#05100c` / `#0a1611`):** Tom de floresta profunda / solo escuro. Usado como canvas de fundo da aplicação inteira para conferir profundidade e contraste imersivo.
* **`surface-container-low` (`#121e19`):** Fundo dos cards e blocos de conteúdo primários (KPIs, tabelas, containers do Copiloto).
* **`surface-container-mid` (`#1a2923`):** Superfície para subcontainers, tabelas aninhadas, cabeçalhos de grid e painéis de filtros.
* **`surface-container-high` (`#23352d`):** Cards destacados, hover states e tags secundárias.
* **`border-subtle` (`#1f362b` / `rgba(34, 197, 94, 0.12)`):** Bordas finas e discretas (1px) que delimitam seções mantendo a fluidez.

### 2.2 Cores Semânticas do Agronegócio (Accents & Data Tokens)
* **Verde Safra / Vitalidade (`#22c55e` / `#16a34a`):**
  * *Significado:* Margem capturada, convergência ótima, chuva regular, conversão técnica alta, CTAs primários de aprovação.
  * *Uso:* Botões de ação direta (`Autorizar Remanejamento`), badges de status (`Engine Ativa`, `FastAPI Conectada`).
* **Âmbar Dourado / Colheita & Alerta Médio (`#f59e0b` / `#fbbf24`):**
  * *Significado:* Anomalia climática moderada, estoque em monitoramento (30–45 dias de cobertura), desconto concedido em balcão.
* **Terracota & Alerta Climático / Estiagem (`#ef4444` / `#f87171`):**
  * *Significado:* Estiagem severa ($Z \le -2.0$), risco crítico de encalhe/ruptura ($>65$ dias ou $<10$ dias), lotes próximos da perda de janela agronômica.
* **Ciano Glacial / Tecnologia & Frio (`#38bdf8` / `#0284c7`):**
  * *Significado:* Dados de precipitação em milímetros (mm), monitoramento de carga refrigerada ($8^\circ\text{C}$ a $12^\circ\text{C}$ para sementes e biológicos) e telemetria de APIs.

### 2.3 Tipografia & Cores de Texto
* **`text-primary` (`#f0fdf4` / `#ffffff`):** Leitura de alto contraste para métricas principais e títulos.
* **`text-secondary` (`#94a3b8` / `#86efac` suave):** Rótulos descritivos, metadados de lote e legendas.
* **`text-muted` (`#4ade80` 40% opacidade / `#475569`):** Timestamps, tooltips secundários e identificadores de hash.

---

## 3. Tipografia & Escala de Tipos

* **Família Primária:** `Plus Jakarta Sans`, sans-serif (legibilidade moderna e números bem desenhados para métricas financeiras).
* **Família Monospaçada:** `JetBrains Mono` / `Fira Code` (usada para IDs de lote, traces agênticos, chamadas de tools do FastAPI e fórmulas matemáticas).

### Escala de Tipografia:
* **Display / KPI Hero:** `text-3xl` a `text-4xl` (`32px` a `36px`), `font-bold`, tracking ligeiramente compacto (`tracking-tight`).
* **Page Titles:** `text-2xl` (`24px`), `font-bold`, leading confortável.
* **Section Headers:** `text-base` a `text-lg` (`16px` a `18px`), `font-semibold`.
* **Data / Table Cells:** `text-xs` a `text-sm` (`12px` a `14px`), `font-medium`.
* **Badges / Micro-Copy:** `text-[10px]` a `text-xs` (`10px` a `11px`), `font-mono` ou `font-semibold` com tracking expandido.

---

## 4. Sistema de Espaçamento e Formas (Layout & Grid)

* **Grid Base:** Sistema de 8px (paddings de `p-3`, `p-4`, `p-6` e gaps de `gap-3`, `gap-4`, `gap-6`).
* **Arredondamento de Cantos (Border Radius):**
  * Cards e containers principais: `rounded-xl` (`12px`) a `rounded-2xl` (`16px`).
  * Botões e inputs: `rounded-lg` (`8px`) a `rounded-xl` (`10px`).
  * Badges e pílulas de status: `rounded-full` (`9999px`).
* **Elevação e Sombras:** Sombras sutis e translúcidas (`box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.5)`), reforçadas com bordas internas sutis (`border border-emerald-950/60`).

---

## 5. Arquitetura de Shell e Navegação Global

Para eliminar qualquer atrito de navegação entre cabeçalho e menus laterais:

1. **Barra Lateral Esquerda Persistente (Global Navigation Frame):**
   * *Largura:* `w-64` fixa (`256px`).
   * *Logomarca:* AgroPulse AI com badge de versão e tagline institucional ("Inteligência do Agro").
   * *Módulos de Navegação Unificada:*
     * 📊 **Visão Geral & Copiloto** (`/dashboard/overview`)
     * 👥 **Afinidade Consultores** (`/analytics/affinity`)
     * 🔁 **Simulador de Remanejamento** (`/logistics/simulator`)
     * 🛡️ **Auditoria & Telemetria** (`/telemetry/agent`)
   * *Rodapé do Shell:* Indicador em tempo real do status da Engine Determinística (`Latência: 24ms`) e link de documentação técnica OpenAPI.

2. **Barra Superior Contextual (Context & Filter Bar):**
   * *Função Exclusiva:* Seleção de escopo de trabalho e perfil executivo (não contém links de rotas para evitar concorrência com o menu lateral).
   * *Elementos:*
     * Dropdown de Filiais (*Todas as Filiais*, *Norte*, *Sul*, *Cerrado*, *Pantanal*).
     * Seletor de Safra (*Safra 2024/25 - Safrinha*).
     * Indicador de Sincronização do ERP / Engine FastAPI.
     * Perfil Ativo da Diretoria de Operações.

---

## 6. Padrões de Componentes de Interface

### 6.1 KPI Executive Cards
* Estrutura em 3 níveis: Título do Indicador + Valor Numérico de Alto Impacto (R$ ou Z-Score) + Sub-bloco com micro-status (tempo de cobertura, tendência ou ROI estimado).
* Acentos contextuais no canto superior direito para rápida identificação de criticidade.

### 6.2 Visualização Gráfica Híbrida (Recharts Style)
* Combinação de colunas suaves para grandezas acumuladas (chuva em mm) e curvas Bezier com áreas gradientes para velocidade de vendas (sementes vs. nutrição).
* Linhas de demarcação temporal para eventos determinísticos (ex: *Ponto de Ruptura Climática: Dia -15*).

### 6.3 Copiloto Agêntico Transparente (OpenAI Native Tool Calling)
* **Log de Raciocínio Aberto:** Exibe claramente a tool invocada (`detect_climate_sales_anomalies`, `recommend_stock_rebalancing`), argumentos tipados em Pydantic e latência de retorno.
* **Quick Prompts de 1-Clique:** Botões em pílula estilizados para acionar as principais perguntas de negócio do executivo.
* **Parecer Estruturado:** Caixa de síntese com separação obrigatória entre *Causa Raiz*, *Risco de Janela* e *Ação Prioritária*.

### 6.4 Tabela de Despacho & Matriz de Remanejamento
* Apresentação clara do fluxo de paridade: $\text{Origem (Excesso/Risco)} \longrightarrow \text{Destino (Demanda Ativa)}$.
* Indicador de alteração na cobertura em dias (ex: *68d $\rightarrow$ 28d*).
* Atribuição direta do consultor técnico campeão na filial de destino.

---

## 7. Mapeamento das Telas do Sistema

| Tela | Rota / ID | Objetivo de Negócio / Decisão |
| :--- | :--- | :--- |
| **Visão Geral & Copiloto** | `SCREEN_7` | Cockpit executivo principal. Monitora exposição em risco (R$ 1.84M), anomalias climáticas ativas e aciona o copiloto agêntico. |
| **Afinidade Consultores** | `SCREEN_9` | Visualização de dispersão (Margem vs. Faturamento) isolando consultores técnicos (+14.2 p.p. de margem) de operadores de volume/desconto. |
| **Simulador de Remanejamento** | `SCREEN_3` | Ajuste fino dos limiares da função matemática, cálculo de frete (R$ 6,80/km), preservação de margem e aprovação em lote de cargas. |
| **Auditoria & Telemetria** | `SCREEN_5` | Painel para tech leads e avaliadores. Demonstra o fluxo determinístico vs. probabilístico, rate limiting em memória e validação Pydantic. |

---

## 8. Diretrizes de Acessibilidade & Microinterações
* **Contraste WCAG AAA/AA:** Textos brancos e verdes claros mantêm contraste superior a 7:1 sobre os fundos escuros do ecossistema.
* **Feedback de Estado:** Botões de ação contam com transições suaves de luminosidade (`hover:brightness-110 active:scale-95`).
* **Consistência Semântica:** A cor vermelha é reservada exclusivamente para estiagem severa e risco de quebra de safra, nunca para estados normais do sistema.
