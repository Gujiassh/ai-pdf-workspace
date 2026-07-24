# M403A capacity and retrieval optimization log

Updated: 2026-07-23

## 1. Purpose and fixed gates

This log records the M403A optimization process, including rejected experiments. It is the durable lookup entry for the hypothesis, implementation or runtime change, exact evidence, result, and final decision behind each attempt.

The S2 release gates remain fixed:

- 500k Dense-visible / 700k physical ContentUnit corpus under PostgreSQL 3C/6 GiB and runner 1C/2 GiB
- both cosine and binary HNSW selected by warm all-ready D1/D8 and selected D1 plans
- minimum final Evidence-location Recall@10 `>= 0.95`
- Dense / lexical / Hybrid warm p95 `<= 100 / 150 / 250 ms`
- 8-concurrent Hybrid p95 `<= 400 ms`, throughput `>= 20 req/s`, zero errors and result drift
- database `<= 12 GiB`, load plus index build `<= 2700s`
- final containers, volumes, and networks all empty

Only one fresh S0/S1/S2 run can set `releaseGatePassed=true`. S1- or S2-only runs are diagnostics and remain `debugOnly=true` even when their scale gates pass.

## 2. Optimization history

| Date | Problem / hypothesis | Method | Measured result | Decision and evidence |
| --- | --- | --- | --- | --- |
| 2026-07-20 | Planner performed exact top-N after scanning scoped ContentUnits instead of using HNSW. | Added a bounded embedding-only `MATERIALIZED` ANN candidate stage, then retained the full Workspace, Asset, current-chain, type, Representation, and Locator checks outside it. | Fresh S1 changed Dense p95 from about `943-956ms` to `10.2ms`; HNSW and GIN plans, Recall, scope, concurrency, and cleanup passed. | Accepted as the production query boundary. Evidence: `/home/cc/tmp/citeframe-m403a-s1-cluster-v13-debug/report.json`. |
| 2026-07-20 | Random synthetic vectors did not encode the eight production retrieval signatures, so Recall failures did not measure ANN quality. | Rebuilt the generator around eight orthogonal signature centers plus deterministic locator perturbations while preserving scale, D1/D8/D64 duplication, noise cohorts, and persisted corpus fingerprints. | S0/S1 reached Recall@10 `1.00` for all signature cases. | Accepted as the capacity corpus semantic oracle. |
| 2026-07-20 | S1/S2 Recall varied at `ef_search=100`; Latin lexical prefix expansion missed latency gates. | Increased production and runner `ef_search` to `400`; changed Latin retrieval to a ContentUnit-only materialized GIN candidate prefix with unchanged final scope/rank semantics. | S1 Recall became `1.00`; Dense/lexical/Hybrid p95 `22.3/45.1/61.2ms`, concurrent p95 `187.2ms`, throughput `57.0 req/s`. | Accepted. Evidence: `/home/cc/tmp/citeframe-m403a-s1-ef400-v16-debug/report.json`. |
| 2026-07-20 | Cold restart was killed during background WAL checkpoint and then exceeded the health wait during crash recovery. | Counted explicit `CHECKPOINT` time in the capacity budget, set PostgreSQL Compose stop grace to five minutes, and raised only the health/SQL wait window to 300 seconds. | Subsequent restarts completed without forced kill; measured performance thresholds were unchanged. | Accepted as runner correctness, not a performance relaxation. |
| 2026-07-20 | S2 embedding insert spent over 39 minutes on avoidable temporary 1024D vector I/O. | Stored only 64 deterministic signal dimensions in the temporary seed relation and appended 960 zeros only in the final persisted `vector(1024)` insert. | S0 dataset checksum, persisted fingerprint, final vectors, Recall, and scope remained unchanged; load fell to `7.6s` in S0. | Accepted. The aborted run cleaned all Compose resources. |
| 2026-07-20/21 | S2 failed ANN Recall and lexical concurrency. | Tested ANN `2x` overfetch, `ef_search=800/1200`, and `max_parallel_workers_per_gather=0/1/2` on one frozen S2 corpus. | None simultaneously fixed Recall and the lexical/concurrency gates. | Rejected and removed. Evidence: `/home/cc/tmp/citeframe-m403a-s2-ab-v20/matrix.json`. |
| 2026-07-21 | HNSW graph quality was too low at construction time. | Rebuilt the frozen corpus with `ef_construction=96` then `128`. | `96` retained minimum Recall `0.90`; `128` reached all Recall `1.00`, build `759.1s`, index about `1803 MiB`. | `128` accepted at that stage; later current-chain canonical work required further quality checks. |
| 2026-07-21 | Lexical-only concurrency dominated S2. | Added generated stored `content_units.search_vector`, replaced the expression GIN index, and kept the same tsquery, scope, ranking, and RRF semantics. | Two retained-corpus runs reached concurrent p95 `213.9/233.4ms` and throughput `66.18/62.08 req/s`; migration cost `106.8s`, storage increase about `148 MiB`. | Accepted after owner approval because this changes physical schema but not API or save semantics. |
| 2026-07-22 | ANN current-chain filtering occurred after HNSW candidate discovery, allowing stale rows to consume the approximate prefix. | Added embedding `asset_id`, generation, index, and `is_current` projection; backfilled fail closed; added scope trigger; made ingestion activate only the latest target projection; changed HNSW to current-only partial indexes. | Migration roundtrip, 360-row local backfill, two triggers, SQLite/PostgreSQL parity, current-chain scope, and fresh S1 passed. | Accepted. Migration requires a maintenance window; no zero-downtime claim. |
| 2026-07-22 | `ef_construction=256` and then `512` improved graph quality but the fresh full canonical still missed one S2 neighbor. | Ran complete canonical builds with higher graph construction effort. | Latest failed canonical: S0/S1 passed; S2 `image-ocr:D1 Recall@10=0.90`; all other query, latency, concurrency, capacity, cost, resource, and cleanup gates passed. | `512` retained as the construction setting, but M403A stayed fail closed. Evidence: `docs/evals/artifacts/m403a-efconstruction512-failed/report.json`. |
| 2026-07-22 | Wider HNSW connectivity might improve graph coverage. | Tested `m=24`, then binary-searched `m=20` and `m=18` in isolated S1. | `m=24` lost HNSW plans and produced Dense p95 `116.3ms`, concurrent p95 `5188.0ms`, throughput `6.15 req/s`. `m=20/18` lost the selected-scope HNSW plan. | Rejected and reverted; default `m=16` is the verified plan boundary. |
| 2026-07-22 | `relaxed_order` might recover the missing candidate after iterative filtered HNSW scanning. | Ran S2 with relaxed ordering and the same final cosine ordering. | S2 performance passed but `image-ocr:D1` remained `0.90`. | Rejected and reverted to `strict_order`. Evidence: `/home/cc/tmp/citeframe-m403a-s2-relaxed-ef512-20260722T061500Z/report.json`. |
| 2026-07-22 | Parallel HNSW build might be the source of graph nondeterminism. | Tested serial HNSW construction. | S1 passed, but S2 reached only 85% after about 21 minutes of HNSW build; with load and remaining phases it was already projected beyond 45 minutes. | Rejected and reverted; the aborted run cleaned all resources. |
| 2026-07-22 | A second approximate metric could recover cosine HNSW misses without changing final ranking. | Added a current-only `binary_quantize(embedding)::bit(1024)` Hamming HNSW. Production Dense takes cosine `N` plus binary `4N`, unions by embedding identity, and reranks by the original 1024D cosine distance before the unchanged business scope. | Focused tests: 29 passed; migration subset: 10 passed; migration roundtrip and Alembic drift passed. No API, persisted business field, Citation, NoteSource, Chat, or save-semantic change. | Architecture approved. Production Image remains disabled. |
| 2026-07-22 | Verify the dual-index architecture at S1 before paying S2 cost. | Fresh S1-only isolated run. | 9/9 all-ready/selected Recall cases `1.00`; warm all-ready D1/D8 and selected D1 used both indexes; Dense/Hybrid p95 `18.2/32.3ms`; concurrent p95 `148.9ms`; throughput `74.2 req/s`; database `1.44 GiB`; cleanup zero. | S1 scale passed. Evidence: `/home/cc/tmp/citeframe-m403a-s1-binary-ef512-20260722T012805Z/report.json`. |
| 2026-07-22 | Verify the former S2 Recall failure and capacity impact. | Fresh S2-only isolated run with dual indexes. | 9/9 Recall cases `1.00`, including `image-ocr:D1=1.00`; both ANN plans and every query gate passed. Dense/lexical/Hybrid p95 `35.4/23.8/58.4ms`; concurrent p95 `242.7ms`; throughput `54.33 req/s`; database `7.16 GiB`; cleanup zero. Load/index was `3216.427s`, above `2700s`. | Query architecture passed, scale failed only capacity time. Evidence: `/home/cc/tmp/citeframe-m403a-s2-binary-ef512-20260722T013605Z/report.json`. |
| 2026-07-22 | Determine whether the first S2 capacity failure was only a single shared-host I/O spike. | Repeated the unchanged S2 dual-index run after `vmstat` iowait fell from `29%` to about `11-14%`. | 9/9 Recall and both ANN plans still passed. Load/index improved to `2817.828s` but remained `117.828s` above the gate; concurrent p95 was `417.263ms`, while throughput remained `49.96 req/s` with zero errors/drift. Phase timings: load `688.705s`, cosine HNSW `1561.014s`, binary HNSW `386.756s`, FTS GIN `61.792s`, trigram GiST `21.922s`, VACUUM/ANALYZE `89.520s`, checkpoint `8.120s`. | The dual-index capacity gap is reproducible enough to require a design adjustment; do not keep rerunning unchanged. Evidence: `/home/cc/tmp/citeframe-m403a-s2-binary-ef512-retry-20260722T025405Z/report.json`. |
| 2026-07-22 | The auxiliary binary graph may not need the same construction effort as the primary cosine graph because it only broadens candidate discovery and never controls final rank. | Keep cosine HNSW at `ef_construction=512`; lower only binary HNSW to `128`; preserve binary `4N`, identity union, original 1024D cosine rerank, query scope, and every frozen gate. | Focused tests `29 passed`; Alembic model drift and compile checks passed. Fresh S1: 9/9 Recall `1.00`; both ANN plan gates passed; Dense/lexical/Hybrid p95 `21.9/13.1/30.7ms`; concurrent p95 `115.6ms`, throughput `84.96 req/s`; binary build `13.604s`; database `1.44 GiB`; cleanup zero. | S1 accepted; fresh S2 pending. Evidence: `/home/cc/tmp/citeframe-m403a-s1-binary-ef128-20260722T055904Z/report.json`. |
| 2026-07-22 | The binary-128 S2 run started while the shared host was under severe I/O pressure. | Started a fresh isolated S2, observed before useful seed progress: `iowait=51%`, blocked tasks `b=16-17`, swap about `7.9 GiB`; interrupted only the agent-owned Compose run and allowed its trap to clean resources. | No seed/report was produced, so this is not Recall or capacity evidence. Containers, volumes, and networks were all zero after cleanup. | Invalid environment run; do not count it for or against binary `128`. Retry only after host pressure returns to a comparable state. Evidence: `/home/cc/tmp/citeframe-m403a-s2-binary-ef128-20260722T061101Z/s2/failure-compose.log` and `failure-down.log`. |
| 2026-07-22 | Measure binary-128 S2 quality while retaining evidence of shared-host contamination. | Completed a fresh S2 while unrelated full-workspace `find` scans were reading hundreds of MiB and host iowait remained roughly `19-43%`. | 9/9 Recall `1.00`, both ANN plans, scope, serial latency, throughput, database size, and cleanup passed. Binary build fell from ef512 `386.756s` to `160.118s`. Load `1278.867s` and cosine HNSW `1713.992s` pushed total to `3341.810s`; concurrent p95 was `406.589ms`. | Binary `128` quality and construction-cost hypothesis passed; S2 scale remains failed. Repeat once after the unrelated scans end, with unchanged code and thresholds. Evidence: `/home/cc/tmp/citeframe-m403a-s2-binary-ef128-retry-20260722T070545Z/report.json`. |
| 2026-07-22 | Recheck binary-128 under the cleanest available host window. | Started after an 8-second host sample showed `wa=5-10%`, `b=1-2`; kept all code and thresholds unchanged. | 9/9 Recall, both ANN plans, serial p95, throughput, database size, and cleanup passed. Load/index was `2721.264s`, only `21.264s` above the gate; concurrent p95 `424.622ms` was `24.622ms` above the gate. Binary build `185.943s`. | Still failed closed. The remaining gap is small but real; do not relax thresholds. Evidence: `/home/cc/tmp/citeframe-m403a-s2-binary-ef128-clean-20260722T083017Z/report.json`. |
| 2026-07-22 | The auxiliary graph and online candidate window still have budget headroom because all binary-128 S1/S2 exact oracles remained `1.00`. | Lower binary HNSW construction from `128` to pgvector default `64` and binary candidates from `4N` to `3N`; keep cosine HNSW `512/N`, identity union, original 1024D cosine rerank, business scope, and all gates. | Focused tests `29 passed`; Alembic/compile/diff passed. Fresh S1: 9/9 Recall `1.00`, both ANN plans, Dense/Hybrid p95 `24.7/40.9ms`, concurrent p95 `159.1ms`, throughput `61.31 req/s`, binary build `9.520s`, cleanup zero. | S1 accepted; fresh S2 pending. Evidence: `/home/cc/tmp/citeframe-m403a-s1-binary-ef64-3n-20260722T094754Z/report.json`. |
| 2026-07-22 | First binary64/3N S2 started during another sustained shared-disk slowdown. | Let the run continue until capacity failure was mathematically certain: embedding insert exceeded 25 minutes before cosine HNSW began; even historical best remaining phases could not fit the 2700s gate. Interrupted the agent-owned run and let the runner trap clean it. | No seed/report and no S2 quality conclusion. Cleanup left zero containers, volumes, and networks. | Invalid capacity window; do not count for or against binary64/3N. Run one final S2 only after a sustained low-iowait preflight. Evidence: `/home/cc/tmp/citeframe-m403a-s2-binary-ef64-3n-20260722T100333Z/s2/failure-compose.log` and `failure-down.log`. |
| 2026-07-22 | Verify the final binary64/3N candidate under a sustained valid host window. | Required 60 consecutive `vmstat` samples with `wa<=15%` and `b<=2`, then ran one unchanged S2-only isolated acceptance. | Preflight `avg/max wa=5.1/9%`, `avg/max b=1.033/2`. S2 passed every scale gate: 9/9 Recall `1.00`; both HNSW and GIN plans; Dense/lexical/Hybrid p95 `32.745/23.391/55.745ms`; 8-concurrent p95 `291.122ms`; throughput `56.405 req/s`; load/index `2255.299s`; database `7.159 GiB`; zero errors, drift, and cleanup residue. | Final configuration accepted for the fresh canonical. The S2-only report correctly remains `debugOnly=true / releaseGatePassed=false`. Evidence: `docs/evals/artifacts/m403a-v2/preflight/citeframe-m403a-confirm-preflight-20260722T111446Z.tsv` and `docs/evals/artifacts/m403a-v2/diagnostics/final-s2/report.json`. |

## 3. First dual-index S2 capacity breakdown

The first dual-index S2 run was retained as a failed diagnostic rather than presented as a release pass:

| Phase | Seconds |
| --- | ---: |
| Corpus load | 530.967 |
| cosine HNSW | 1593.108 |
| binary HNSW | 394.151 |
| FTS GIN | 243.362 |
| trigram GiST | 43.241 |
| VACUUM / ANALYZE | 402.717 |
| CHECKPOINT | 8.880 |
| Total load and index | 3216.427 |

The previous same-scale cosine-only relaxed-order diagnostic completed in `1819.483s`: load `445.977s`, cosine HNSW `1318.695s`, FTS GIN `15.008s`, trigram GiST `21.857s`, VACUUM / ANALYZE `6.195s`, checkpoint `11.751s`. The first dual-index run therefore includes both the real binary index cost and strong shared-host I/O inflation in FTS/VACUUM and other phases.

Immediately after cleanup, host `vmstat` showed `wa=29%`, blocked tasks `b=6-7`, and about `1.8 GiB` swap in use. This is runtime evidence of shared-host I/O pressure, not grounds to relax the frozen 45-minute gate.

## 4. Completed unchanged retry

- Status: `failed closed`
- Command: `bash infra/scripts/run-m403a-acceptance.sh --output-dir /home/cc/tmp/citeframe-m403a-s2-binary-ef512-retry-20260722T025405Z --scales s2`
- Configuration: unchanged production/runner code and unchanged frozen thresholds
- Result: 9/9 Recall and both ANN plans passed. Load/index `2817.828s` and concurrent p95 `417.263ms` failed their fixed gates. Cleanup removed every container, volume, and network.

## 5. Binary-128 result and final auxiliary-budget experiment

- Binary-128 status: S1 and S2 quality passed; clean S2 missed load/index by `21.264s` and concurrent p95 by `24.622ms`, so it remains failed closed.
- Active change: binary HNSW `ef_construction=64`, binary candidate multiplier `3N`; cosine HNSW remains `512/N`.
- Preserved invariants: no API/persisted business field/save-semantic change; binary remains candidate-only; final ordering remains original 1024D cosine; current-chain and selected scope remain unchanged.
- S1 status: all gates passed. First S2 attempt was invalidated before index construction because the load phase alone made the frozen total-time gate impossible; cleanup was complete.
- Final retry preflight: require a sustained low-iowait sample before starting. Do not repeatedly spend full S2 seeds during shared-host scans.
- Verification completed: `29 passed`, Alembic no drift, compileall/diff check passed; fresh S1 passed all scale gates with 9/9 Recall and both ANN plans.
- Development migration roundtrip completed `f2a4 -> e1f3 -> f2a4`. A new post-roundtrip SQL inspection on 2026-07-22 enumerated the actual `pg_indexes` / `pg_index` rows rather than assuming index names: cosine current-only HNSW has `ef_construction=512`, binary current-only HNSW has `ef_construction=64`, both are `indisvalid=true / indisready=true`, 360/360 embeddings are current, invalid-current count is zero, and both statement-level scope triggers are installed. Command: `docker exec ai-pdf-postgres psql -X -U ai_pdf -d ai_pdf_workspace ...`; source index definitions and the database state match.
- Full regression after the binary parameter change: API `278 passed, 1 warning`; Worker `93 passed`.
- Final sequence completed: binary64/3N S2 passed, then one fresh full canonical passed and was archived under `docs/evals/artifacts/m403a-v2/`.

The first binary-128 S2 attempt was intentionally aborted before seed progress because the host was in an invalid I/O state (`wa=51%`, `b=16-17`, swap about `7.9 GiB`). Its Compose trap left zero containers, volumes, and networks; it is not a product or architecture result.

The next completed S2 proved binary-128 Recall and plan behavior, and cut binary build time to `160.118s`, but unrelated workspace scans inflated load/index to `3341.810s` and concurrent p95 to `406.589ms`. After those scans ended, an 8-second `vmstat` sample showed `wa=5-10%` and `b=1-2`; the cleanest binary-128 S2 still failed the frozen load/index and concurrency gates, so the active final candidate is binary64/3N.

## 6. Final binary64/3N preflight record

- Configuration fingerprint before the final S2: relevant worktree diff SHA-256 `d975af516092679814605efe49a1440e39d7ac567a078574487b93504c4945b2`; migration/model/retrieval/runner file SHA-256 values were recorded by the controller command output.
- Residual-resource check: no M403A containers, volumes, or networks were present before preflight.
- Database truth check: Alembic head `f2a4c6e8b0d1`; current-only cosine/binary indexes are valid and ready with `ef_construction=512/64`; binary expression is `(binary_quantize(embedding))::bit(1024)`; both predicates are `is_current IS TRUE`; 360/360 rows are current, zero current rows are invalid, and two scope triggers are installed.
- First 20-second host sample: `vmstat 1 20` held `wa=9-11%` with blocked queue normally `b=2`, but `/proc/pressure/io` remained `some avg10=60.02 / full avg10=59.79`. One unrelated `find /tmp /home/cc ...` process had remained in uninterruptible I/O for about 49 minutes and had read about 854 MiB. It was not terminated.
- Corrected 60-second preflight artifact: `docs/evals/artifacts/m403a-v2/preflight/citeframe-m403a-preflight-20260722T105414Z.vmstat`, SHA-256 `50f2b76b106614101dd22bce2b2dd7c7db2ba6c6bb833601b4b3521ddc096228`. Direct reparse of the raw rows produced `avg wa=9.344%`, `max wa=15%`, `avg b=1.828`, `max b=4`, with 56/64 (`87.5%`) rows satisfying `wa<=15% && b<=2`. An initial one-pass summary printed incorrect maximum fields because its awk input handling was wrong; that summary was rejected and is not evidence.
- Decision: do not classify the first sample alone as a valid start window. Run a longer consecutive preflight; start the single final unchanged S2 only if `wa <= 10-15%` and `b <= 1-2` remain sustained without a new scan spike. Otherwise wait and retain this as environment evidence, not a product result.

The rolling preflight waited 15 minutes without relaxing the rule. Its final 60-second window reached 59/60 acceptable rows, so it still did not authorize the run. A separate confirmation artifact then reached 60/60 with `avg b=1.033`, `max b=2`, `avg wa=5.100%`, and `max wa=9%`; SHA-256 `91cff54ce65d09ea28e9f6b4b362fad9f0cd072feb886045b3157525eb0ceb71`. Only that confirmation authorized the final S2.

## 7. Final S2 result

- Command: `bash infra/scripts/run-m403a-acceptance.sh --output-dir /home/cc/tmp/citeframe-m403a-s2-binary-ef64-3n-final-20260722T111607Z --scales s2`; the retained copy is `docs/evals/artifacts/m403a-v2/diagnostics/final-s2/report.json`.
- Report SHA-256: `caf11b53c011d25987569001bc96de21802801f5e049aaf97ba32441628d9f07`
- Corpus: 500,000 Dense-visible / 700,000 physical ContentUnits, 700,000 embeddings, 600,000 current, 0 invalid current, 215,134 locators; every seed contract passed.
- Build: load `680.638s`; cosine HNSW `1402.503s`; binary HNSW `109.104s`; FTS GIN `12.080s`; trigram GiST `19.327s`; VACUUM/ANALYZE `25.519s`; checkpoint `6.127s`; total `2255.299s`.
- Query: 9/9 all-ready/selected Recall `1.00`; cosine HNSW, binary HNSW, FTS GIN, current-chain/scope, D8/D64, buffer, no-temp-block and serial stability gates all passed.
- Performance: Dense/lexical/Hybrid p95 `32.745/23.391/55.745ms`; 8-concurrent p95 `291.122ms`; throughput `56.405 req/s`; 32/32 completed, zero errors and zero drift.
- Capacity/cleanup: database `7.159 GiB`; cosine index `1.666 GiB`; binary index `90.5 MiB`; client/PostgreSQL resource limits passed; Compose down exit `0`; no containers, volumes, or networks remained.
- Decision: S2 scale passed and unlocks one fresh unchanged S0/S1/S2 canonical. This diagnostic alone cannot set `releaseGatePassed=true`.

## 8. Fresh canonical result

- Preflight: 60/60 samples passed with `avg/max b=0.033/1` and `avg/max wa=0.250/3%`; retained at `docs/evals/artifacts/m403a-v2/preflight/citeframe-m403a-canonical-preflight-20260722T120843Z.tsv`.
- Command: `bash infra/scripts/run-m403a-acceptance.sh --output-dir /home/cc/tmp/citeframe-m403a-canonical-binary-ef64-3n-20260722T121012Z`; retained at `docs/evals/artifacts/m403a-v2/report.json`.
- Result: `debugOnly=false`, `completeScaleSet=true`, S0/S1/S2 all passed, and `releaseGatePassed=true`.
- S2 corpus and plans: 500,000 Dense-visible / 700,000 physical ContentUnits; 9/9 Recall `1.00`; cosine HNSW, binary HNSW, FTS GIN, current-chain/scope, D8/D64, buffer and no-temp-block gates all passed.
- S2 build: load `565.654s`; cosine HNSW `1329.643s`; binary HNSW `104.594s`; FTS GIN `12.269s`; trigram GiST `20.016s`; VACUUM/ANALYZE `21.573s`; checkpoint `8.993s`; total `2062.742s`.
- S2 query/capacity: Dense/lexical/Hybrid p95 `32.237/41.663/54.373ms`; 8-concurrent p95 `246.531ms`; throughput `61.069 req/s`; database `7.159 GiB`; zero errors, drift, and cleanup residue.
- Artifact: report SHA-256 `53a1a7de1c762321ff684a7faa127d3a2fbb06a490f4b30ac2e686c380124b3a`; all 74 retained files pass `docs/evals/artifacts/m403a-v2/SHA256SUMS` when verified from the artifact root.
- Artifact handling: the first post-copy `sha256sum -c docs/evals/artifacts/m403a-v2/SHA256SUMS` was run from the repository root and failed because entries are relative to the artifact root. It was rejected as operator error; rerunning `sha256sum -c SHA256SUMS` inside `docs/evals/artifacts/m403a-v2` passed every file. Dummy `.env.deploy`, test caches, and original temporary run directories were not retained.

## 9. Current product boundary

- M403A is complete; the accepted physical configuration is cosine `ef_construction=512/N` plus binary `ef_construction=64/3N`, with final original-vector cosine reranking.
- Production Image ingestion remains disabled. M403A passing does not itself change the catalog, API, Worker registry, Web upload entry, or save semantics.
- M403B remains a separate production-enablement stage requiring explicit approval and its own migration/runtime/recovery acceptance.
- M404 still requires real target users and remains `not_evaluable`; until then the product stage is internal preview.

## 10. Closeout verification and cleanup

- Migration roundtrip: `f2a4c6e8b0d1 -> e1f3a5c7d9b2 -> f2a4c6e8b0d1`. At e1f3, the four current-scope columns, both scope triggers, and both current-only indexes were absent, while the historical cosine HNSW returned with `ef_construction=128`. At head, cosine512 and binary64 were valid/ready and current-only, 360/360 embeddings were current, invalid current count was zero, two triggers were present, and `alembic check` reported no upgrade operations.
- The first parallel full-test invocation lost the two long-running exec session identifiers and returned only partial progress output. Those processes were allowed to finish, but their unknown exit status was not counted as evidence. Explicit log-backed reruns then passed: API `278 passed, 1 warning in 147.33s`; Worker `93 passed in 39.57s`.
- A direct `uv run ruff` failed because Ruff was not installed in either project venv. `uvx ruff check` then found 12 real static findings: unused imports/variables, one unnecessary f-string, and two lexical statement-factory lambda assignments. The minimal cleanup removed only unused symbols and replaced those lambdas with equivalent local functions; focused API/Worker tests passed `81/12`.
- After the lint-only cleanup, final full reruns passed: API `278 passed, 1 warning in 126.56s`; Worker `93 passed in 43.08s`. API/Worker Ruff and compileall, runner shell syntax, canonical JSON oracle, artifact SHA-256 verification, and `git diff --check` passed.
- Temporary-output policy: `apps/web/test-results`, four pytest log files, pytest caches, source/test `__pycache__`, original final-S2/canonical `/home/cc/tmp` directories, and raw preflight copies were moved to the system trash. Source tests and the durable `docs/evals/artifacts/m403a-v2/` evidence were retained. Dummy `.env.deploy` files were excluded from the archive.
