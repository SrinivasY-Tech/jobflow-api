# PostgreSQL notes: jobflow-api

Learning notes from building this project: what I measured, what surprised me, and why the
schema looks the way it does. Raw `EXPLAIN (ANALYZE, BUFFERS)` output is in [`docs/explain/`](explain/).

Environment for every number below: PostgreSQL 16 (`postgres:16-alpine` in Docker Desktop on a
Windows laptop), default configuration, warm cache (each query run once before the captured run).
Absolute times will differ on other machines. Compare **plans and buffer counts**, not milliseconds.

---

## 1. Data set

`npm run seed:jobs -- --count 200000` (set-based `INSERT ... SELECT generate_series`, ~20 s):

| status   | rows    | share |
|----------|---------|-------|
| DONE     | 149,659 | ~75%  |
| ASSIGNED | 20,242  | ~10%  |
| NEW      | 30,107  | ~15%  |

Priorities are skewed towards 2–3, and `created_at` is spread over a year. ASSIGNED/DONE jobs get real
`assignments` rows (20 seed workstations), so the seeded data respects the same invariants as
the API: 20,242 active assignments = 20,242 ASSIGNED jobs. `ANALYZE` runs at the end, so planner
statistics are fresh.

`jobs` table: 15 MB heap, primary key index 4.4 MB.

## 2. The query being tuned

`GET /jobs?status=NEW&limit=20` (the planner's work queue). Captured with `log_statement = 'all'`,
this is exactly what TypeORM sends:

```sql
SELECT "Job"."id", "Job"."title", "Job"."status", "Job"."priority", "Job"."created_at", "Job"."updated_at"
FROM "jobs" "Job"
WHERE (("Job"."status" = $1))
ORDER BY "Job"."priority" DESC, "Job"."created_at" ASC, "Job"."id" ASC
LIMIT 20 OFFSET 0;                                   -- $1 = 'NEW'

SELECT COUNT(1) AS "cnt" FROM "jobs" "Job" WHERE (("Job"."status" = $1));   -- for "total"
```

`id` is the final tie-breaker so the order is total. Without it, rows with equal
`(priority, created_at)` can swap between pages, and paging can repeat or skip rows.

Reproduce all plans: `bash docs/explain/run-explain.sh <label>`.

## 3. Results

`ms` = execution time; `buf` = shared buffers touched (8 kB pages); access path in brackets.

| Query | No indexes (`before/`) | + composite (`after-composite/`) | + partial (`after-partial/`) |
|---|---|---|---|
| q1 NEW, page 1 | 12.6 ms / 1919 buf [Seq Scan + top-N sort] | **0.14 ms / 23 buf** [Index Scan composite] | 0.31 ms / 23 buf [composite] |
| q2 COUNT NEW | 12.6 ms / 1868 buf [Seq Scan] | 3.7 ms / 152 buf [Index **Only** Scan composite] | 5.0 ms / 151 buf [Index Only Scan **partial**] |
| q3 NEW, OFFSET 10000 | 33.4 ms / 1877 buf [Seq Scan] | 5.2 ms / **10068** buf [Index Scan] | 7.7 ms / 10068 buf |
| q4 NEW, priority ≥ 4 | 11.7 ms / 1919 buf [Seq Scan] | 0.15 ms / 23 buf | 0.23 ms / 23 buf |
| q5 DONE, page 1 | 17.6 ms / 1919 buf [Seq Scan] | 0.19 ms / 24 buf | 0.18 ms / 24 buf |
| q6 keyset with `OR` | 14.6 ms / 1890 buf [Seq Scan] | 6.5 ms / **10068** buf [Index Scan + **Filter**] | 8.9 ms / 10068 buf |
| q7 keyset `UNION ALL` | (added later) | **0.48 ms / 30 buf** [2 Index Scans + Merge Append] | 0.51 ms / 30 buf |

Index sizes: composite **8.1 MB**, partial **1.2 MB** (6.7× smaller), pkey 4.4 MB.

**Reproduced** on a fresh clone with an empty volume (new random seed): q1 went from 1,918 buffers /
18.1 ms [Seq Scan] to 23 buffers / 0.137 ms [Index Scan composite], with the same index sizes.
Plans and buffer counts repeat closely; times without an index vary between runs (12.6 vs 18.1 ms).

Write cost (50k inserts, each in a rolled-back transaction, single run, so noisy):
pkey only **96 ms**, + partial **156 ms**, + composite + partial **282 ms**.

## 4. What I learned from the plans

### Without an index: read everything, sort, keep 20
`Parallel Seq Scan` over all 1,868 pages, `Rows Removed by Filter: 84950` per worker, then a
`top-N heapsort`. The cost grows with the **table**, not with the result: 20 rows cost the same as 30k.

### The composite index `(status, priority DESC, created_at, id)`
- Equality column first (`status`), then the `ORDER BY` columns **in the same directions**. The
  scan walks the index already in the requested order, so there's no `Sort` node, and `Limit` stops after 20
  rows. 1,919 → 23 buffers.
- It serves every status (q5 DONE: 1,919 → 24 buffers).
- `priority >= 4` (q4) is free: the matching rows are the first entries of the index range anyway.
- `COUNT` becomes an **Index Only Scan** (`Heap Fetches: 0`): it never touches the table because
  the visibility map says the pages are all-visible (fresh after `ANALYZE`/vacuum).

### OFFSET is linear, even with a perfect index
q3 (`OFFSET 10000`) reads 10,020 index entries and throws away 10,000 of them. Note the
**buffer count went up** (1,877 → 10,068) while time went *down* (33 → 5 ms). The index scan
visits heap pages in index order, so the same page is counted again on every revisit. There's no
sort and no parallel workers, so it's still faster. Buffers and time don't always agree, so read both.

### Keyset pagination: the obvious version doesn't use the index (q6)
```sql
WHERE status = 'NEW' AND (priority < 4 OR (priority = 4 AND (created_at, id) > ('…', 14711)))
```
The plan shows the condition as a **`Filter`**, not an **`Index Cond`**: 10,000 rows read and
discarded, exactly like OFFSET. The reason is the **mixed sort directions** (`priority DESC`, `created_at ASC`):
"everything after this cursor" is not one contiguous range of the index, so Postgres can't seek to it.

Fix (q7): split it into two ranges, each a real `Index Cond`, and let `Merge Append` combine them:
```sql
(SELECT … WHERE status='NEW' AND priority = 4 AND (created_at, id) > ('…', 14711) ORDER BY … LIMIT 20)
UNION ALL
(SELECT … WHERE status='NEW' AND priority < 4 ORDER BY … LIMIT 20)
ORDER BY priority DESC, created_at, id LIMIT 20;
```
30 buffers, constant no matter how deep the page. (With uniform directions,
e.g. all `DESC`, a single row comparison `(a, b, c) < (x, y, z)` would have been enough.)

### COUNT(*) is always O(matching rows)
Even as an index-only scan, `COUNT` reads every matching entry (30k → ~150 pages, ~4 ms). For
`DONE` (150k rows) it would be ~5× that, on every page request. Postgres has no stored
row count, because under MVCC each transaction may see a different count. Options:
drop `total` and return `hasNextPage` (fetch `limit + 1`); return an estimate (`EXPLAIN` row
estimate / `pg_class.reltuples`); or keep `total` only for small filtered sets.

### Partial index `(priority DESC, created_at, id) WHERE status = 'NEW'`: an honest result
- **With the composite present, the planner didn't use it for the page query.** Both cost ~23
  buffers; the composite won on estimated cost. It *was* picked for `COUNT` (151 vs 152 buffers,
  so no real gain).
- **Alone** (composite dropped in a rolled-back transaction, `after-partial/partial_only_hypothetical.txt`),
  it serves the NEW queue just as well (22 buffers) at **1/7 of the size**, and it doesn't even need an
  `Index Cond`, because every entry is a NEW job.
- It can't help any other status: DONE page → back to a full scan, 23 ms.
- **Generic plans can't use it** (`after-partial/generic_plan.txt`). With `PREPARE … WHERE status = $1`
  and `plan_cache_mode = force_generic_plan`, the planner doesn't know `$1 = 'NEW'` when planning,
  so it can't prove the predicate holds and falls back to a full scan (19.9 ms). The composite
  index works for generic plans (0.05 ms). node-postgres uses unnamed statements, which are planned
  with the actual values (custom plans), so the API is fine today. A driver or pooler that caches
  named prepared statements could silently lose the partial index after 5 executions.

**Decision.** Both indexes stay in the repo, because comparing them is the point of this exercise. For a real
system I'd choose based on the query mix:
- Only the open queue is hot, with custom plans → **partial index alone**: 6.7× smaller and cheaper on writes, and it
  stays small however much DONE history piles up.
- History by status is also listed, or generic plans are possible → **composite alone**.
- Keeping both is mostly redundant here: writes pay for both (282 vs 156 ms per 50k inserts), and only COUNT
  used the partial one.

### Indexed status columns and HOT updates
`status` is part of an index, so every status change (NEW → ASSIGNED → DONE) is a **non-HOT update**: a
new row version *and* new entries in every index on `jobs`. A table with frequent status changes
needs vacuum to keep up; worth watching `n_tup_hot_upd` vs `n_tup_upd` in `pg_stat_user_tables`.

---

## 5. Concurrency: what each safeguard prevents (measured)

The assign transaction (captured with `log_statement = 'all'`, READ COMMITTED):

```sql
START TRANSACTION;
SET LOCAL lock_timeout = '5s';
SELECT … FROM "jobs" "j" WHERE "j"."id" = $1 FOR UPDATE;              -- 1. lock the job
SELECT … FROM "workstations" "w" WHERE "w"."id" = $1 FOR UPDATE;      -- 2. lock the workstation
SELECT COUNT(1) FROM "assignments" WHERE workstation_id = $1 AND completed_at IS NULL;  -- 3. capacity
INSERT INTO "assignments"(…) VALUES (DEFAULT, $1, $2, $3, DEFAULT, $4, $5) RETURNING "id", "assigned_at";
UPDATE "jobs" SET "status" = 'ASSIGNED', "updated_at" = CURRENT_TIMESTAMP WHERE "id" = $2;
COMMIT;
```

`test/concurrency.e2e-spec.ts` fires parallel HTTP requests (pool size 10) and checks the database
afterwards. To check that the test can actually fail, I removed each safeguard in turn:

| Experiment | Same job ×50 | 20 jobs → capacity 3 | Complete ×10 |
|---|---|---|---|
| All safeguards (shipped code) | 1×201, 49×409 ✅ | 3×201, 17×409 ✅ | 1×200, 9×409 ✅ |
| E1: no job `FOR UPDATE` (index kept) | 1×201 ✅ but the 409s came from the **unique index** (`23505`) | ✅ | **10×200** ❌ |
| E2: no job lock **and** no partial unique index | **10×201: ten active assignments for one job** ❌ | ✅ | **10×200** ❌ |
| E3: no workstation `FOR UPDATE` | ✅ | **10×201 on capacity 3** ❌ | ✅ |

What this shows:
- **Job row lock**: serializes work on one job. The second transaction blocks on `FOR UPDATE`, and
  after the first commits, READ COMMITTED **re-reads the locked row**, sees `ASSIGNED`, and returns a clean 409.
  Without it, `complete` has no backstop at all: nine callers are told they completed an already-completed job.
- **Partial unique index** `UNIQUE (job_id) WHERE completed_at IS NULL`: the backstop that holds even
  when the application logic is wrong (E1). Defence in depth: the database guarantees the invariant,
  and the lock only makes the error message nice and specific.
- **Workstation row lock**: capacity is a rule across *many* rows (count of assignments), which no
  unique index or CHECK can express. Without serializing per workstation, every transaction counts
  the same "2 of 3" and inserts: classic **write skew**.
- **10 in E2/E3 = pool size**: everything that ran in the first parallel wave got through.

### The test that couldn't fail
The first version of the concurrency test **passed with the locks removed**. On a cold pool, the
first transaction committed while the other requests were still opening TCP + auth connections
(tens of ms), so nothing truly overlapped. Fix: open all pool connections first (30 parallel
`GET /health`). Lesson: prove a concurrency test can fail by removing the protection it tests for.

### Alternatives considered for assignment
| Approach | Why not (here) |
|---|---|
| `SERIALIZABLE` + retry on `40001` | Correct and general, but every caller needs a retry loop, and under contention many transactions abort. Explicit row locks are easier to explain and give specific 409 messages. |
| Optimistic locking (`version` column) | Fine for one row, but capacity spans many rows. Contention on a hot job means many retries. |
| `active_count` column on workstations + `UPDATE … SET active_count = active_count + 1 WHERE id = $1 AND active_count < capacity` | Atomic and lock-light (a single statement). A good choice at scale. Rejected for now: a denormalized counter can drift from the real rows and needs its own consistency checks. |
| `pg_advisory_xact_lock(workstation_id)` | Works, but it's a lock on a number, not a row. Easy to get wrong, and invisible in the schema. |
| `NOWAIT` / `SKIP LOCKED` | `SKIP LOCKED` suits "give me *any* free job" queues, not "assign *this* job". `NOWAIT` would turn short waits into errors. A 5 s `lock_timeout` is the middle ground. |

Lock order is always job → workstation (`complete` locks only the job; capacity edits only the
workstation), so no two transactions can wait on each other in a cycle.

---

## 6. Other Postgres details I ran into

- **`integer` vs `bigint` ids**: the `pg` driver returns `int8` as a JS **string** (it can exceed
  `Number.MAX_SAFE_INTEGER`). `integer` identity columns avoid that, at a 2.1 billion row ceiling.
- **Identity values are never rolled back**: a failed duplicate insert used up id 4, so the next user
  got id 5. Gaps are normal; never rely on ids being consecutive.
- **`CREATE INDEX CONCURRENTLY`** doesn't block writes but can't run in a transaction. The index
  migrations set `transaction = false`, and migrations run with `-t each`. If it fails midway, it
  leaves an `INVALID` index that must be dropped (`\d jobs` shows it).
  **Gotcha found by CI's revert step:** TypeORM's `migration:revert` always wraps `down()` in a
  transaction (it ignores `transaction = false`; see `MigrationExecutor.undoLastMigration`), so
  `DROP INDEX CONCURRENTLY` fails there. `down()` uses a plain `DROP INDEX` behind
  `SET LOCAL lock_timeout = '5s'`, so a blocked drop fails fast instead of queueing.
- **TypeORM `migration:generate` would have dropped data**: changing `varchar(200)` to `(150)` in
  the entity produced `DROP COLUMN title; ADD title` instead of `ALTER COLUMN … TYPE`. Migrations
  here are hand-written and reviewed; `npm run migration:check` only detects drift.
- **TypeORM `logging: ['error']` leaks parameters**: a failed insert logged the full statement
  with the password hash. Query logging is off outside development.
- **`email = lower(email)` CHECK + plain UNIQUE** gives case-insensitive uniqueness without
  `citext`.
- **REPEATABLE READ for the load endpoint**: two statements (workstation + assignments) read from one
  snapshot, so the count can't disagree with the capacity shown next to it.
