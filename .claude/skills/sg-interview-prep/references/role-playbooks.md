# 热门岗位面试 Playbooks

先根据 JD 和轮次选择最相关的 playbook。每轮只测试少数核心能力，不要把整份题库一次问完。任何岗位都必须遵守 source fidelity：JD 是岗位要求，不是候选人履历。

## 1. Software Engineering / Live Coding

### 评估重点

- requirements clarification 与 assumptions
- 数据结构、算法或系统选择的理由
- correctness、time complexity、space complexity
- edge cases、tests、debugging 与可读性
- 沟通：让面试官听得见推理，而不是沉默写完代码

### 推荐流程

1. 给出问题，不先给提示。
2. 等候选人澄清输入、输出、限制和异常条件。
3. 要求先讲 baseline approach，再讨论优化。
4. 让候选人编码或写 pseudocode，并解释关键步骤。
5. 用正常、边界和失败输入做 dry run。
6. 追问复杂度、替代方案、可维护性或 scale trade-off。

### 禁止项

- 不因 JD 写了 distributed systems、cloud 或 Kubernetes，就把它们写成候选人经验。
- 不在候选人尝试前直接给完整解法。
- 不只看最终代码；必须区分独立完成、轻提示后完成和高度引导后完成。

## 2. Data / Analytics / SQL Case

### 评估重点

- 先定义业务问题与 metric，包括 numerator、denominator、time window 和 grain
- 数据来源、join key、null、duplicate、selection bias 与 tracking change
- SQL 或分析方法是否能回答问题
- segmentation、validation、alternative explanation
- recommendation、business implication 与 monitoring

### 推荐追问

- “What exactly do you mean by conversion rate?”
- “What is the grain of each table, and could the join duplicate orders?”
- “How would you validate that this is causal rather than seasonal?”
- “What decision would the business make from this analysis?”

候选人没有工作 SQL 经验时，可以测试其 SQL 思路，但必须如实称为 coursework、practice 或 case performance。

## 3. Product Management / Product Sense

### 结构

1. Clarify：目标、范围、平台与约束
2. User：选择明确 user segment，不说“所有用户”
3. Problem：基于证据或假设定义 pain point
4. Goal：说明 user value 与 business/product goal
5. Ideas：提出多个方案并给出 prioritisation criteria
6. Metrics：north-star metric、input metrics 与 guardrails
7. Experiment：MVP、success threshold、risks 与 next step

### 评分提醒

- 不因候选人做过 redesign 就把其职位改成 Product Manager。
- 不奖励堆功能；优先奖励清楚的问题定义、取舍和验证。
- 未上线的项目可以谈 prototype evidence 和 learning，不能编 adoption 或 revenue。

## 4. Consulting Case

先确认 case 是 candidate-led、interviewer-led 还是 written case。

### Candidate-led

候选人主动澄清 objective、建立 issue tree、提出 initial hypothesis、选择优先分析路径，并在获得数据后更新观点。面试官只逐步释放必要信息。

### Interviewer-led

面试官按模块推进，候选人仍需说明结构、计算过程和 insight，不要机械等下一题。

### 必查项

- 结构是否针对问题，而不是背通用框架
- hypothesis 是否可被证伪
- 数学是否写清公式、单位、量级和 sanity check
- insight 是否回答“so what”
- synthesis 是否含 recommendation、evidence、risks、next steps

Case 中没有给出的市场规模、成本、价格或增长率不得补造。

## 5. Finance / Risk / Banking

根据岗位选择 credit、market、operational、compliance、corporate finance 或 investment 方向，避免把所有金融面试都问成估值题。

### 常见评估维度

- financial statement 与 cash-flow logic
- credit drivers、scenario analysis、sensitivity 与 model limitation
- risk appetite、controls、exception handling 与 escalation
- commercial impact 与 downside protection
- ethics：发现 bypass、misstatement 或 conflict of interest 时的判断

不知道最新监管要求或公司数字时，候选人应清楚承认边界并说明核实路径，不要 bluff。需要当前事实时先查 MAS、公司年报或官方材料。

## 6. Operations / Management Trainee

### 评估重点

- prioritisation、capacity、service level 与 escalation
- root cause、process control、handover 与 continuous improvement
- frontline stakeholder management 与 conflict
- leadership、resilience 与安全意识

可以用课程、实习、兼职、CCA 或 National Service 的真实故事。NS 的 rank、branch、unit、team size 和成果必须来自用户材料。

情景题先明确目标、约束和风险，再讲短期 containment、root-cause analysis、长期 prevention 与 monitoring。

## 7. Marketing / Growth

### 评估重点

- campaign objective 与 target audience
- insight、positioning、message 与 channel rationale
- funnel metrics、experiment design 与 attribution
- budget allocation、creative learning 与 iteration
- brand、privacy 与 measurement trade-offs

必须区分 proposal、organic content、paid campaign 和已上线项目。没有真实数据时，不编 reach、CTR、CAC、conversion、ROI 或 budget；可以讨论“会如何测量”。

## 8. UX Research / Product Design

### Portfolio walkthrough

要求候选人讲清：problem → role → method choice → evidence → design/research decision → validation → limitation → next step。

### 深挖方向

- 为什么选择访谈、survey、usability test 或其他方法
- sample bias、recruitment、consent、privacy 与 researcher bias
- evidence 如何改变 decision，而不是只展示漂亮 deliverables
- 没上线时如何验证，以及下一步需要什么证据

课程项目必须称课程项目；不得编商业客户、上线采用率或业务结果。

## 9. Engineering / Biomedical / R&D

### 评估重点

- problem definition、constraints 与 scientific/engineering rationale
- experimental design、controls、validation、failure analysis
- safety、quality、standards 与 manufacturability，只使用候选人真实接触过的内容
- trade-offs、uncertainty、limitations 与 next experiment
- 面向专家和非技术 stakeholder 的双层表达

目标是 medical device、semiconductor 或其他行业，不代表过去研究已经属于该行业。不得把 research relevance 改写成已完成 product development；不得编 patient count、performance gain、标准认证、clinical validation 或 patent 状态。

## 跨岗位行为题

每个 playbook 至少搭配一题真实行为题，验证候选人是否能把专业判断落到具体行动：

- collaboration 或 conflict
- prioritisation 或 ambiguity
- failure、mistake 或 feedback
- ethics、quality 或 control judgement
- motivation 与 role fit

行为题仍用真实 STAR/C-STAR；岗位专项题使用本文件对应结构，不要把所有题都硬套 STAR。
