-- Minimal metrics schema for the Stateful Systems Dashboard (duplicated for container init)

create table if not exists pg_query_stats (
    ts                timestamptz not null,
    region            text        not null,
    tenant            text        not null,
    fingerprint       text        not null,
    sample_query      text        not null,
    calls             integer     not null,
    mean_ms           double precision not null,
    p95_ms            double precision not null,
    p99_ms            double precision not null,
    total_time_ms     double precision not null,
    rows              integer     not null
);

create index if not exists idx_pg_query_stats_time on pg_query_stats (ts);
create index if not exists idx_pg_query_stats_rtt on pg_query_stats (region, tenant, ts);
create index if not exists idx_pg_query_stats_fp on pg_query_stats (fingerprint);

create table if not exists pg_conn_stats (
    ts                timestamptz not null,
    region            text        not null,
    tenant            text        not null,
    active            integer     not null,
    waiting           integer     not null,
    max               integer     not null,
    replication_lag_sec double precision not null default 0
);

create index if not exists idx_pg_conn_stats_time on pg_conn_stats (ts);
create index if not exists idx_pg_conn_stats_rtt on pg_conn_stats (region, tenant, ts);

create table if not exists redis_stats (
    ts                timestamptz not null,
    region            text        not null,
    tenant            text        not null,
    hit_ratio         double precision not null,
    mem_used_mb       double precision not null,
    evictions         integer     not null,
    ops_sec           integer     not null
);

create index if not exists idx_redis_stats_time on redis_stats (ts);
create index if not exists idx_redis_stats_rtt on redis_stats (region, tenant, ts);

create table if not exists queue_stats (
    ts                timestamptz not null,
    system            text        not null,
    region            text        not null,
    tenant            text        not null,
    queue_name        text        not null,
    depth             integer     not null,
    consumer_lag      integer     not null,
    oldest_age_sec    integer     not null
);

create index if not exists idx_queue_stats_time on queue_stats (ts);
create index if not exists idx_queue_stats_rtt on queue_stats (region, tenant, ts);
create index if not exists idx_queue_stats_q on queue_stats (system, queue_name);

create table if not exists search_stats (
    ts                timestamptz not null,
    region            text        not null,
    tenant            text        not null,
    cluster_status    text        not null,
    red_indices       integer     not null,
    yellow_indices    integer     not null,
    query_p95_ms      double precision not null
);

create index if not exists idx_search_stats_time on search_stats (ts);
create index if not exists idx_search_stats_rtt on search_stats (region, tenant, ts);

create table if not exists mysql_query_stats (
    ts                timestamptz not null,
    region            text        not null,
    tenant            text        not null,
    fingerprint       text        not null,
    sample_query      text        not null,
    calls             integer     not null,
    mean_ms           double precision not null,
    p95_ms            double precision not null,
    p99_ms            double precision not null,
    total_time_ms     double precision not null,
    rows              integer     not null
);

create index if not exists idx_mysql_query_stats_time on mysql_query_stats (ts);
create index if not exists idx_mysql_query_stats_rtt on mysql_query_stats (region, tenant, ts);
create index if not exists idx_mysql_query_stats_fp on mysql_query_stats (fingerprint);

create table if not exists mysql_conn_stats (
    ts                timestamptz not null,
    region            text        not null,
    tenant            text        not null,
    active            integer     not null,
    waiting           integer     not null,
    max               integer     not null,
    slow_queries      integer     not null default 0,
    replication_lag_sec double precision not null default 0
);

create index if not exists idx_mysql_conn_stats_time on mysql_conn_stats (ts);
create index if not exists idx_mysql_conn_stats_rtt on mysql_conn_stats (region, tenant, ts);

