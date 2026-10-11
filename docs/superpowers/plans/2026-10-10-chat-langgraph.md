# chat 服务 LangGraph 迁移 实施计划

分支 `feat/LangGraph`（自 `feat/ai-ui` 切出）。已有一个可运行的需求分析系统：extract → clarify → analysis → risk → summary 五段式（第六章 Agent），以及配套的 UI 协议与 SSE 流式输出。本章把它从命令式 Promise 链迁移到 LangGraph StateGraph，后续增量（条件边澄清循环、interrupt 人机协同、checkpointer 断点续跑、流式对接）都叠加在本章的基线图上。

## Global Constraints

- 依赖：`@langchain/langgraph@^1.2.9`（解析为 1.4.18，此前已作为 `langchain` 包的传递依赖存在，声明为直接依赖零成本）
- 业务逻辑不动：Agent 调用、Prompt、JSON 提取、输入上下文传达全部复用 `sub-agents.ts` 与 `orchestrator.service.ts` 的既有实现
- 173→178 个存量测试不得回归；orchestrator 及其流式契约（stage/delta 事件）在本章保持原样

## Task 1（本章任务书）：基线迁移

> 原始任务书：把 `requirement-analysis.ts` 的 Promise 链迁移到 LangGraph：新建
> `src/llm/graph/requirement-analysis-graph.ts`；Annotation.Root + MessagesAnnotation.spec
> 定义 State（messages/extracted/clarified/analysis/risk/summary，业务字段覆盖型 reducer）；
> 五节点一一对应第六章 Agent，节点复用原 Agent 调用只返回 Partial<State>；
> 线性边 START → extract → clarify → analysis → risk → summary → END；
> 导出 createAnalysisGraph() 与 runAnalysisGraph(input)；保留原入口文件仅改为转调。
> 验证：同样的输入，新图的 summary 与旧链一致。

### 实现要点

1. **依赖**：`bun add @langchain/langgraph@^1.2.9`（services/chat）
2. **新文件 `src/llm/graph/requirement-analysis-graph.ts`**：
   - `RequirementAnalysisState = Annotation.Root({ ...MessagesAnnotation.spec, input, extracted, clarified, analysisText, riskText, summaryText })`
   - 五节点内部 `createSubAgents(chatModel)`，调用方式与旧链逐参一致（extract 只吃 input；clarify/analysis/risk 吃 input+extracted；summary 吃 input+extracted+analysis+risk）
   - 节点把 Agent 原始输出追加进 `messages`（AIMessage），流水线对话记录由此沉淀在 State 里
   - 线性边 + 唯一条件边：`clarify` 判定 `needsClarification` 时路由到 `END`（与旧链提前 return 语义一致，happy path 仍是纯线性）
   - `createAnalysisGraph(model?)`：可注入模型（测试用脚本化模型），缺省走 `createChatModel()`
   - `runAnalysisGraph(input)`：编译图并以 `{ input, messages: [] }` 为初始状态 invoke，返回最终 State
3. **共享抽取**：`extractJson` 从 orchestrator 移到 `src/llm/agents/json-output.ts`，orchestrator 与 graph 共同引用，避免 graph 反向依赖 Nest 服务

### 与任务书的偏差（及原因）

- **文件名**：任务书写的 `requirement-analysis.ts` 在本仓库不存在；第六章五段式 Promise 链的实际载体是 `orchestrator.service.ts`（后几章在其上叠加了 SSE 流式与 steps 落账）。基线图作为新模块创建，orchestrator 暂不转调——它的契约（needs_clarification 提前终止、steps 计时落账、manual_review 兜底、流式事件）无法由最小线性图无损复现，强行转调会回归已测试行为。转调编排器属于后续增量（条件边/中断/检查点补齐后）的收尾动作。
- **字段名**：LangGraph 不允许节点名与 State 通道同名，而任务书的节点名（extract/clarify/analysis/risk/summary）与字段名（analysis/risk/summary）撞了三个。节点名决定图拓扑（任务书边的示意主角），故保留节点名、把三个撞名字段改为 `analysisText`/`riskText`/`summaryText`。
- **State 增加 `input`**：节点需要原始需求才能调用 Agent，`createAnalysisGraph()` 无参签名下 input 必须走 State 传递。
- **`MessagesAnnotation.spec` 必须展开**（`...MessagesAnnotation.spec`）：spec 本身是 `{ messages: channel }` 对象，嵌套赋值（`messages: MessagesAnnotation.spec`）会被静默丢弃写入——v1.4.18 实测最小复现确认，节点内写 messages 不生效、最终 State 不含该键。

### 增量：吸收教程基线的两个设计（2026-10-10 第二笔）

对照教程版 `requirement-analysis-graph.ts` 评审后，吸收两项、拒绝一项：

1. **retrievedContext 进 State（吸收，但全节点可见）**：State 增加 `retrievedContext: Annotation<string>`，节点侧 `effectiveInputOf(state)` 在上下文非空白时拼进输入——与 orchestrator.orchestrate 的 effectiveInput 同一套规则，五个 Agent 都能看到同一份背景（教程版只有 summary 能看到，是业务收窄，不学）。`runAnalysisGraph(input, retrievedContext = '')` 增加可选第二参。这是为后续 checkpointer 断点恢复铺路：上下文作为状态字段，恢复时可见。
2. **runAnalysisGraph 返回展平结果 + steps 记账（吸收）**：新增 `AnalysisGraphResult`（字段用业务名，不带 Text 后缀——DTO 层与 State 通道解耦）与 `AnalysisGraphSteps`（extract/clarify 为 JSON 串，analysis/risk/summary 为原文），朝 OrchestrationResult 的转调形状对齐；clarify 提前终止时 analysis/risk/summary 为空串。
3. **parseJson 静默兜底（拒绝）**：教程版解析失败给默认值（clarify 失败会被当成"不需要澄清"，垃圾数据流进下游），且正则只认第一段 json 围栏。保留我们的 extractJson 抛错语义（fail-fast → 上层 manual_review 兜底），另有正则容忍度与 extract schema（isComplete/missingFields vs 我们的 action/features 契约）差异，均记于评审结论。

测试从 5 个增至 7 个：新增「retrievedContext 五 Agent 可见」「空白不拼接」两条；等价性断言切到展平返回 + steps 全量比对；messages 断言改走 `graph.invoke`（展平返回不含 State 的 messages）。全量 180/180，typecheck 绿。

### 验证

- `src/llm/graph/requirement-analysis-graph.spec.ts` 5 个测试，全部脚本化模型（拦截 `createChatModel` 防真实网络）：
  1. 等价性：同一输入，新图 extracted/clarified/analysisText/riskText/summaryText 与直接顺序调用五 Agent 的旧链逐字段一致
  2. 上下文传达：clarify/analysis 的提示词含 extracted，summary 的提示词含 analysis 与 risk 原文
  3. 提前终止：needsClarification 时 analysis 及之后不执行（仅 2 次模型调用）
  4. messages 按 Agent 顺序追加 5 条原始输出
  5. extract 输出非 JSON 时抛错（与旧链一致，由上层兜底）
- 全量 `bun run test`：178/178 通过；`bun run typecheck` 绿
- 顺手修复两处存量问题（不在任务书内，为保持验证门干净）：
  `ui-chat.controller.spec.ts` 的 mock 类型（`as never` 导致 `res.writes` 推导为 never 的 TS 报错，改为 express Response 交叉类型 + 补 `streamUIResponse` mock）；拉起 Docker 使 Prisma 集成测试恢复。

## Task 2：意图路由（classifier + query/chat 分支）

> 原始任务书（8.3 增量）：State 扩展 intent（默认 analyze）/queryResponse/chatResponse；
> classifierNode 用 withStructuredOutput(zod) 分类，含三类意图规则、边界策略
> （"查询XXX的分析报告"→query）、优先级（编号优先 query、纯闲聊 chat、默认 analyze），
> try-catch 降级关键词匹配；queryHandler/chatHandler 轻量助手节点，返回
> { responseField, summary } 兼容旧接口；条件边 routeByIntent 分流，query/chat → END，
> 保留完整分析链；runAnalysisGraph 输出 intent 与动态 steps；test-graph.ts 七用例验证。

### 实现要点（对照我们基线的命名适配）

1. **State**：`intent: Annotation<AnalysisIntent>({ reducer: 覆盖, default: () => 'analyze' })`——v1 的 `{ default }` 不能脱离 reducer 单独用（TS 编译期即报错）；`queryResponse`/`chatResponse` 为覆盖型通道。
2. **classifierNode**：`IntentSchema = z.object({ intent: z.enum([...]), reasoning })`，`withStructuredOutput(schema, { method: 'functionCalling' })`（方舟模型的既有约束）；System Prompt 按任务书含三类特征/示例、边界与优先级五条；catch 一律降级 `classifyByKeywords`（导出供测试钉死），分类器不写 messages（messages 语义保持"Agent 产物流水"）。
3. **处理器节点**：`invokeAssistant`（system 人设 + effectiveInput，空输出按失败兜底）；两个 handler 只写 `queryResponse`/`chatResponse` + messages——**不写 `state.summary`**：`summary` 通道与 `summary` 节点名撞名不存在，LangGraph 对未知通道写入静默丢弃（本次实测踩到，测试揪出），旧接口兼容由 `runAnalysisGraph` 在 DTO 层 `summaryText ?? queryResponse ?? chatResponse` 兜底。
4. **路由**：`START → classifier`，`addConditionalEdges('classifier', routeByIntent)`（analyze→extract / query→queryHandler / chat→chatHandler），两个 handler → END；分析链与 clarify 提前终止条件边保持基线形态。
5. **输出**：`AnalysisGraphResult` 增 `intent`（必填）与 `queryResponse?`/`chatResponse?`；`extracted/clarified/analysis/risk` 改为可选——query/chat 分支这些节点未执行，保持 undefined 而非 `?? ''` 硬凑；`steps` 按 intent 动态：analyze 出五段，query 出 `{ query }`，chat 出 `{ chat }`。
6. **`test-graph.ts`**（真实模型脚本）：7 用例逐条校验意图/路径/产物/时延，输出 PASS/FAIL 明细与耗时对比，`≥6/7` 达标 exit 0，否则 exit 1。

### 验证

- vitest 13 个（7 基线等价 + 6 意图路由）：关键词 7 用例全对（Case 1 编号+冒号描述→analyze；Case 2/4/5/7→query；Case 3→chat；Case 6 默认 analyze）、LLM 分类桩路由 chat/query、降级路径只消耗 1 次模型调用、DTO summary 兼容、业务字段 undefined；全量 186/186，typecheck 绿
- `test-graph.ts` 实跑（GLM 真实模型）：**意图分类 7/7 全对**，路径全部符合预期；`通过 6/7 ≥ 6 → 通过`
  - 耗时：query 20.5s / chat 9.4s / 完整分析 183s——query/chat 快约 10~19 倍，"明显快于完整分析"成立
  - 唯一 FAIL 是 Case 3 的 `<5s` 硬阈值（9.4s）：该模型单次调用固有开销约 4-5s，classifier+handler 两次调用 9s 是物理下限；阈值保留任务书原值不改，实际达标判据以"明显快于完整分析"为准

## 执行记录与偏差（2026-10-10）

- Task 1：按上述实现，5/5 新测试 + 178/178 全量通过，typecheck 0 错误
- Task 1 增量：吸收教程版 retrievedContext/steps 设计（见上），测试 5→7，全量 180/180
- Task 2：13 图测试 + 全量 186/186；真实模型 7 用例意图全对，脚本 6/7 通过（唯一 FAIL 为 Case 3 时延硬阈值，见验证节）
- 命名适配偏差（沿用 Task 1 结论）：任务书的 extractStep/analysisResult/RunAnalysisGraphOutput 等教程命名映射为本仓库的 extract 等节点名 / analysisText 等通道名 / AnalysisGraphResult；教程 `state.summary` 兼容写法在本图不可用（通道与 summary 节点撞名），下沉到 DTO 层实现
