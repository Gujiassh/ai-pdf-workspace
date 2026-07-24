# 检索评测

## 先复用同一套评测集

当前评测集位于 [`retrieval-v1.jsonl`](retrieval-v1.jsonl)。它包含 40 条人工标注问题，覆盖当前工作区的两份 ready PDF：

- `01、系统分析师大纲第二版.pdf`：考试说明、数据库、项目管理、信息安全、系统分析、需求工程、SOA 和题型示例
- `Shape Up Stop Running in Circles and... (Z-Library).pdf`：shaping、appetite、rabbit holes、betting、building、scope 和 hill chart

每条记录使用精确的 `sourceFilename` 和 `pages` 标记相关页面。评测按页面去重：同一页返回多个 chunk 只算一个结果，避免 chunk 数量影响指标。

## 运行 dense baseline

从 API 目录执行：

```bash
cd /home/cc/code/citeframe/apps/api
uv run python scripts/evaluate_retrieval.py \
  --workspace-id <workspace-id> \
  --dataset ../../docs/evals/retrieval-v1.jsonl \
  --top-k 6 \
  --output /tmp/ai-pdf-retrieval-dense-v1.json
```

脚本只读 workspace 中 `status=ready` 且未删除的文档，使用当前 embedding provider 生成问题向量，再调用现有 dense `retrieve_chunks`。它不会写业务表。

## 指标怎么读

- `Recall@k`：标注的相关页面有多少进入前 `k` 个候选页面
- `MRR`：第一个相关页面出现得有多靠前
- `nDCG@k`：同时考虑相关页面数量和排序位置
- `citationHit@k`：前 `k` 个候选页面是否至少包含一个标注相关页面；它表示候选来源命中，不等于模型最终回答的事实正确性
- `latencyMs`：问题向量生成加 dense 检索的端到端耗时，报告 mean、p50、p95 和 max

## 2026-07-15 dense baseline

本次使用 Ollama `qwen3-embedding:0.6b`、`1024` 维、`embedding-v1`、`top-k=6`，共 40 条问题：

| 指标 | 结果 |
| --- | ---: |
| Recall@6 | 0.7708 |
| MRR | 0.7229 |
| nDCG@6 | 0.6935 |
| citationHit@6 | 0.8500 |
| latency p50 | 68.9 ms |
| latency p95 | 90.7 ms |
| latency max | 1961.8 ms |

首条问题包含模型冷启动，max 不能直接当作稳定请求延迟；后续实验需要单独记录 warm-up 后的 p50/p95。

### 当前暴露的问题

- 同语言、术语直接出现在正文的查询表现较好，例如数据库三级模式、需求工程、SOA。
- Shape Up 的中英混合查询和跨章节抽象概念表现较弱；`rabbit holes`、`pitch`、`betting table + circuit breaker` 等问题在前 6 个候选中没有命中标注页。
- 部分多页面问题只召回其中一页，说明当前 dense top-k 对“一个问题需要多个分散页面”的覆盖仍不足。

这些结果只说明当前召回边界，不足以单独证明必须引入某一种排序方案。本次已经在同一评测集上完成 dense、lexical 和 RRF 对比；rerank 和生产级 lexical 查询仍需单独验证。

## 离线 lexical/RRF 对比

在同一批 40 条问题上又跑了一次离线实验：dense 和 lexical 各取 24 个候选页面，再用 `RRF(k=60)` 合并，最后统一按前 6 个页面计算指标。lexical 使用当前 ready chunks 的 BM25 风格词项得分；它是评测实验实现，不是生产查询路径。

| 策略 | Recall@6 | MRR | nDCG@6 | citationHit@6 | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| dense | 0.7708 | 0.7229 | 0.6935 | 0.8500 | 72.5 ms | 78.8 ms |
| lexical | 0.6833 | 0.6579 | 0.6327 | 0.7500 | 1.1 ms | 1.5 ms |
| RRF | 0.8167 | 0.7667 | 0.7426 | 0.9000 | 73.4 ms | 79.9 ms |

RRF 在这批数据上同时提高了召回、排序和候选来源命中，改善主要来自 lexical 补回 dense 漏掉的术语页面；纯 lexical 不足以替代向量召回。RRF 的延迟接近 dense，因为当前实验仍需要生成 query embedding；lexical 的毫秒级延迟是进程内已加载语料的结果，不能直接当作 PostgreSQL 全文索引延迟。

该离线阶段当时只批准“继续做 hybrid/RRF 生产实验”，并未批准立即切换默认检索。后续生产验收需要：

1. 把 lexical 候选实现为数据库可解释、可观测的查询，不把当前 Python 语料扫描直接搬进请求路径。
2. 用 warm-up 后的延迟和真实并发压测比较 dense 与 RRF。
3. 保留 dense-only 回归和按文档类型拆分的指标，确认 RRF 没有牺牲当前已命中的中文术语问题。

## 2026-07-16 生产 Hybrid/RRF 验收

生产实现不复用离线 Python 语料扫描。它在 PostgreSQL 内使用两条 lexical 路径：

- 含拉丁术语的问题使用 `simple` text search + GIN 表达式索引，并按术语覆盖率与全文排名排序。
- 纯中文问题使用 `pg_trgm` GiST KNN 词相似候选；Workspace、显式 Asset scope、ready、未删除、current index/generation 和 Representation/locator 链条一致性都在候选排序前生效。
- Dense 与 lexical 都在候选 limit 前按 Evidence locator 语义去重，再使用 `RRF(k=60)` 合并；PDF 整页按 Asset+页去重，区域 Evidence 保持独立。

验收命令：

```bash
cd /home/cc/code/citeframe/apps/api
uv run python scripts/evaluate_production_retrieval.py \
  --workspace-id 57c7ff61-8dc2-472e-bcbe-bc1f40fd1a0d \
  --top-k 6 \
  --candidate-k 10 \
  --rrf-constant 60 \
  --warmup-runs 1 \
  --concurrency 4 \
  --concurrency-repetitions 1 \
  --output ../../docs/evals/retrieval-production-v1.json
```

最终同轮 40 条结果：

| 策略 | Recall@6 | MRR | nDCG@6 | citationHit@6 | retrieval p95 | 端到端 p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dense | 0.7708 | 0.7229 | 0.6935 | 0.8500 | 10.8 ms | 106.6 ms |
| Hybrid/RRF | 0.8417 | 0.7063 | 0.7176 | 0.9250 | 80.6 ms | 175.9 ms |

`端到端` 口径为 query embedding + retrieval。M305 Asset/current-chain 重跑已完成，Hybrid Recall 提升 `0.0708`，citation hit 提升 `0.0750`；端到端 `p95` 增加 `69.3 ms`，比例为 `1.650x`。4 worker 并发各执行 40 条：Dense/Hybrid 都是 `0` error、`0` result drift；Hybrid 并发 retrieval `p95=75.9 ms`、吞吐约 `48.8 req/s`。

候选数比较显示 `candidate_k=10` 是当前数据集的质量/成本拐点：比 `6/8` 保留更多质量收益，又比 `12/18/24` 获得更高或相当的综合指标和更低延迟。因此服务默认使用 `candidate_k=10`。

结论：质量、端到端延迟和并发稳定性门禁全部通过，Chat 默认策略切换为 Hybrid/RRF；仍可通过 `AI_PDF_RETRIEVAL_STRATEGY=dense` 显式选择 Dense，不做运行时静默降级。Rerank 当前没有必要接入。

该报告使用当前 Workspace 的 318 个 PDF ContentUnit，只证明当前数据量的生产路径门禁。PostgreSQL 在这一规模仍可能选择 exact sort 而不是 HNSW；Phase 4 必须用更大分层语料验证执行计划、缓冲区命中和 p95 后，才能宣称规模化性能成立。

完整逐 case 报告见 [`retrieval-production-v1.json`](retrieval-production-v1.json)。
