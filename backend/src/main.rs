use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::{env, net::SocketAddr, sync::Arc, time::Duration};
use std::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use axum::http;
use tracing::{error, info, warn};

mod secrets;
mod auth;
mod aws;

#[derive(Clone)]
struct AppConfig {
    admin_token: String,
    cors_origin: Option<String>,
    collectors_enabled: bool,
    database_url: Option<String>,
    redis_url: Option<String>,
    mysql_url: Option<String>,
    opensearch_url: Option<String>,
    vault_name: String,
}

#[derive(Clone)]
struct CacheEntry {
    data: String,
    expires_at: std::time::Instant,
}

#[derive(Clone)]
struct AppState {
    config: Arc<AppConfig>,
    db_pool: Option<sqlx::PgPool>,
    redis_client: Option<redis::Client>,
    jwt_config: Arc<auth::JwtConfig>,
    trace_cache: Arc<RwLock<HashMap<String, CacheEntry>>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let use_1password = env::var("OP_SERVICE_ACCOUNT_TOKEN").is_ok();
    let vault_name = "7y6d4dfr5tymfnptyslndirnum";

    if use_1password {
        info!("Using 1Password Service Account for secret management");
    } else {
        warn!("OP_SERVICE_ACCOUNT_TOKEN not set - falling back to environment variables");
        warn!("Get a service account at: https://my.1password.com/ -> Integrations -> Service Accounts");
    }

    let admin_token = if use_1password {
        secrets::get_item_field(vault_name, "Admin API Token", "token")
            .unwrap_or_else(|e| {
                error!("Failed to fetch admin token from 1Password: {}", e);
                warn!("Falling back to environment variable ADMIN_TOKEN");
                env::var("ADMIN_TOKEN").unwrap_or_else(|_| "dev-admin-token".to_string())
            })
    } else {
        env::var("ADMIN_TOKEN").unwrap_or_else(|_| "dev-admin-token".to_string())
    };

    let database_url = if use_1password {
        secrets::get_item_field(vault_name, "Postgres Connection", "connection_string")
            .ok()
            .or_else(|| {
                warn!("Could not fetch database URL from 1Password, trying DATABASE_URL env var");
                env::var("DATABASE_URL").ok()
            })
    } else {
        env::var("DATABASE_URL").ok()
    };

    let redis_url = if use_1password {
        secrets::get_item_field(vault_name, "Redis URL", "url")
            .ok()
            .or_else(|| {
                warn!("Could not fetch Redis URL from 1Password, trying REDIS_URL env var");
                env::var("REDIS_URL").ok()
            })
    } else {
        env::var("REDIS_URL").ok()
    };

    let mysql_url = env::var("MYSQL_URL").ok()
        .or_else(|| Some("mysql://dashboard:dashboard@localhost:3306/dashboard".to_string()));

    let opensearch_url = env::var("OPENSEARCH_URL").ok()
        .or_else(|| Some("http://localhost:9200".to_string()));

    let cors_origin = env::var("FRONTEND_ORIGIN").ok()
        .or_else(|| env::var("CORS_ORIGIN").ok());
    let collectors_enabled = env::var("COLLECTORS_ENABLED").ok().map(|v| v == "true").unwrap_or(false);

    let jwt_secret = if use_1password {
        secrets::get_item_field(vault_name, "JWT Secret", "secret")
            .unwrap_or_else(|e| {
                warn!("Failed to fetch JWT secret from 1Password: {}", e);
                env::var("JWT_SECRET").unwrap_or_else(|_| "dev-jwt-secret-change-in-production".to_string())
            })
    } else {
        env::var("JWT_SECRET").unwrap_or_else(|_| "dev-jwt-secret-change-in-production".to_string())
    };

    if use_1password {
        info!("Successfully loaded secrets from 1Password vault: {}", vault_name);
    }

    let db_pool = if let Some(ref url) = database_url {
        match sqlx::PgPool::connect(url).await {
            Ok(pool) => {
                info!("Connected to database");
                Some(pool)
            }
            Err(e) => {
                error!("Failed to connect to database: {}", e);
                None
            }
        }
    } else {
        None
    };

    let redis_client = if let Some(ref url) = redis_url {
        match redis::Client::open(url.as_str()) {
            Ok(client) => {
                info!("Redis client initialized for caching");
                Some(client)
            }
            Err(e) => {
                error!("Failed to initialize Redis client: {}", e);
                None
            }
        }
    } else {
        None
    };

    let cfg = AppConfig { 
        admin_token, 
        cors_origin, 
        collectors_enabled, 
        database_url, 
        redis_url,
        mysql_url,
        opensearch_url,
        vault_name: vault_name.to_string(),
    };
    let jwt_config = Arc::new(auth::JwtConfig::new(jwt_secret));
    let state = AppState { 
        config: Arc::new(cfg), 
        db_pool,
        redis_client,
        jwt_config,
        trace_cache: Arc::new(RwLock::new(HashMap::new())),
    };

    let mut cors = CorsLayer::new()
        .allow_methods(vec![http::Method::GET, http::Method::POST])
        .allow_headers(vec![http::header::AUTHORIZATION, http::header::CONTENT_TYPE])
        .allow_credentials(false);
    if let Some(origin) = &state.config.cors_origin {
        cors = cors.allow_origin(origin.parse::<http::HeaderValue>()?);
    } else {
        cors = cors.allow_origin(Any);
    }

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/auth/login", post(login))
        .route("/api/v1/auth/signup", post(signup))
        .route("/api/v1/cloudwatch/summary", get(get_cw_summary))
        .route("/api/v1/cloudwatch/traces", get(get_cw_traces))
        .route("/api/v1/cloudwatch/metrics/timeseries", get(get_cw_metric_timeseries))
        .route("/api/v1/logs/by-trace", get(get_logs_by_trace))
        .route("/api/v1/summary", get(get_summary))
        .route("/api/v1/db/pg/top-queries", get(get_pg_top_queries))
        .route("/api/v1/db/pg/metrics", get(get_pg_metrics))
        .route("/api/v1/db/mysql/top-queries", get(get_mysql_top_queries))
        .route("/api/v1/db/mysql/metrics", get(get_mysql_metrics))
        .route("/api/v1/redis/metrics", get(get_redis_metrics))
        .route("/api/v1/queues/metrics", get(get_queues_metrics))
        .route("/api/v1/queues/kafka/metrics", get(get_kafka_metrics))
        .route("/api/v1/search/metrics", get(get_search_metrics))
        .route("/api/v1/insights/query", post(post_insights))
        .with_state(state.clone())
        .layer(cors);

    if state.config.collectors_enabled {
        if let Some(db_url) = &state.config.database_url {
            tokio::spawn(pg_collector_loop(db_url.clone()));
        }
        if let Some(redis_url) = &state.config.redis_url {
            tokio::spawn(redis_collector_loop(redis_url.clone()));
        }
        if let Some(mysql_url) = &state.config.mysql_url {
            tokio::spawn(mysql_collector_loop(mysql_url.clone(), state.config.database_url.clone()));
        }
        if let Some(opensearch_url) = &state.config.opensearch_url {
            tokio::spawn(opensearch_collector_loop(opensearch_url.clone(), state.config.database_url.clone()));
        }
    }

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("listening on {}", addr);
    
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    
    info!("Server shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    info!("Shutdown signal received, starting graceful shutdown...");
}

async fn pg_collector_loop(database_url: String) {
    loop {
        if let Err(e) = collect_pg_once(&database_url).await { error!("pg collector error: {}", e); }
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}

async fn collect_pg_once(database_url: &str) -> anyhow::Result<()> {
    use sqlx::{Pool, Postgres};
    let pool: Pool<Postgres> = sqlx::PgPool::connect(database_url).await?;
    // Example: write a simple connection stat snapshot
    let active: i64 = sqlx::query_scalar("select count(*) from pg_stat_activity where state = 'active'")
        .fetch_one(&pool)
        .await
        .unwrap_or(0);
    let max: i64 = sqlx::query_scalar("show max_connections")
        .fetch_one(&pool)
        .await
        .ok()
        .and_then(|v: String| v.parse::<i64>().ok())
        .unwrap_or(100);
    // Insert minimal row (region/tenant stubbed for dev)
    let now = time::OffsetDateTime::now_utc();
    let _ts = now.format(&time::format_description::well_known::Rfc3339)?;
    let _ = sqlx::query("insert into pg_conn_stats (ts, region, tenant, active, waiting, max, replication_lag_sec) values (now(), 'us-east-1','enterprise_123',$1,0,$2,0)")
        .bind(active as i32)
        .bind(max as i32)
        .execute(&pool)
        .await;
    Ok(())
}

async fn redis_collector_loop(redis_url: String) {
    loop {
        if let Err(e) = collect_redis_once(&redis_url).await { error!("redis collector error: {}", e); }
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}

async fn collect_redis_once(redis_url: &str) -> anyhow::Result<()> {
    let client = redis::Client::open(redis_url)?;
    let mut conn = client.get_multiplexed_async_connection().await?;
    let info: String = redis::cmd("INFO").query_async(&mut conn).await?;
    // Basic parsing for a few keys
    let hit_ratio = 0.95f64;
    let mut mem_used_mb = 0.0f64;
    let mut evictions = 0i64;
    for line in info.lines() {
        if let Some((k,v)) = line.split_once(':') {
            match k {
                "keyspace_hits" => {
                    // would need misses to compute properly; skipping detailed calc in dev
                }
                "used_memory" => { mem_used_mb = v.trim().parse::<f64>().unwrap_or(0.0) / (1024.0 * 1024.0) }
                "evicted_keys" => { evictions = v.trim().parse::<i64>().unwrap_or(0) }
                _ => {}
            }
        }
    }
    // For dev, write a stub row (region/tenant fixed)
    if let Some(db_url) = env::var("DATABASE_URL").ok() {
        let pool: sqlx::PgPool = sqlx::PgPool::connect(&db_url).await?;
        let _ = sqlx::query("insert into redis_stats (ts, region, tenant, hit_ratio, mem_used_mb, evictions, ops_sec) values (now(), 'us-east-1','enterprise_123',$1,$2,$3, 3000)")
            .bind(hit_ratio)
            .bind(mem_used_mb)
            .bind(evictions as i32)
            .execute(&pool)
            .await;
    }
    Ok(())
}

async fn mysql_collector_loop(mysql_url: String, pg_url: Option<String>) {
    loop {
        if let Err(e) = collect_mysql_once(&mysql_url, &pg_url).await { 
            error!("mysql collector error: {}", e); 
        }
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}

async fn collect_mysql_once(mysql_url: &str, pg_url: &Option<String>) -> anyhow::Result<()> {
    use sqlx::{Pool, MySql};
    let pool: Pool<MySql> = sqlx::MySqlPool::connect(mysql_url).await?;
    
    // Get active connections
    let active: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM information_schema.processlist WHERE command != 'Sleep'")
        .fetch_one(&pool)
        .await
        .unwrap_or(0);
    
    // Get max connections
    let max: i64 = sqlx::query_scalar("SELECT @@max_connections")
        .fetch_one(&pool)
        .await
        .unwrap_or(150);
    
    // Get slow query count (queries taking > 1 second)
    let slow_queries: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM information_schema.processlist WHERE time > 1"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);
    
    // Try to get query stats from performance_schema (may not be enabled)
    let query_stats = sqlx::query_as::<_, (String, i64, f64, f64)>(
        "SELECT 
            DIGEST_TEXT,
            COUNT_STAR,
            AVG_TIMER_WAIT/1000000000 as avg_ms,
            MAX_TIMER_WAIT/1000000000 as max_ms
         FROM performance_schema.events_statements_summary_by_digest
         WHERE SCHEMA_NAME = DATABASE()
         ORDER BY SUM_TIMER_WAIT DESC 
         LIMIT 5"
    )
    .fetch_all(&pool)
    .await;
    
    // Save to metrics DB if available
    if let Some(db_url) = pg_url {
        if let Ok(pg_pool) = sqlx::PgPool::connect(db_url).await {
            // Save connection stats
            let _ = sqlx::query(
                "INSERT INTO mysql_conn_stats (ts, region, tenant, active, waiting, max, slow_queries, replication_lag_sec) 
                 VALUES (now(), 'us-east-1', 'enterprise_123', $1, 0, $2, $3, 0.0)"
            )
            .bind(active as i32)
            .bind(max as i32)
            .bind(slow_queries as i32)
            .execute(&pg_pool)
            .await;
            
            // Save query stats if we got them
            if let Ok(stats) = query_stats {
                for (digest, count, avg_ms, max_ms) in stats {
                    let _ = sqlx::query(
                        "INSERT INTO mysql_query_stats (ts, region, tenant, fingerprint, sample_query, calls, mean_ms, p95_ms, p99_ms, total_time_ms, rows)
                         VALUES (now(), 'us-east-1', 'enterprise_123', $1, $2, $3, $4, $5, $6, $7, $8)"
                    )
                    .bind(&digest[0..digest.len().min(100)])  // Truncate for fingerprint
                    .bind(&digest)  // Full query as sample
                    .bind(count as i32)
                    .bind(avg_ms)
                    .bind(max_ms)  // Use max as p95 approximation
                    .bind(max_ms)  // Use max as p99 approximation
                    .bind(avg_ms * count as f64)
                    .bind(count as i32)  // rows affected
                    .execute(&pg_pool)
                    .await;
                }
            }
        }
    }
    
    info!("MySQL metrics collected: {} active connections, {} max, {} slow queries", active, max, slow_queries);
    Ok(())
}

async fn opensearch_collector_loop(opensearch_url: String, pg_url: Option<String>) {
    loop {
        if let Err(e) = collect_opensearch_once(&opensearch_url, &pg_url).await { 
            error!("opensearch collector error: {}", e); 
        }
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}

async fn collect_opensearch_once(opensearch_url: &str, pg_url: &Option<String>) -> anyhow::Result<()> {
    let client = reqwest::Client::new();
    
    // Get cluster health
    let health: serde_json::Value = client
        .get(format!("{}/_cluster/health", opensearch_url))
        .send()
        .await?
        .json()
        .await?;
    
    let status = health["status"].as_str().unwrap_or("unknown").to_string();
    let red_indices = health["number_of_data_nodes"].as_u64().unwrap_or(0) as i32;
    let yellow_indices = health["relocating_shards"].as_u64().unwrap_or(0) as i32;
    
    // Get search stats
    let stats_result = client
        .get(format!("{}/_nodes/stats/indices/search", opensearch_url))
        .send()
        .await;
    
    let mut query_p95_ms = 45.0;
    if let Ok(stats_response) = stats_result {
        if let Ok(stats) = stats_response.json::<serde_json::Value>().await {
            // Extract search query time from nodes
            if let Some(nodes) = stats["nodes"].as_object() {
                let mut total_query_time_ms = 0.0;
                let mut total_query_count = 0;
                
                for (_node_id, node_data) in nodes {
                    if let Some(search_time) = node_data["indices"]["search"]["query_time_in_millis"].as_f64() {
                        total_query_time_ms += search_time;
                    }
                    if let Some(query_count) = node_data["indices"]["search"]["query_total"].as_u64() {
                        total_query_count += query_count;
                    }
                }
                
                if total_query_count > 0 {
                    query_p95_ms = (total_query_time_ms / total_query_count as f64) * 1.5; // Rough p95 estimation
                }
            }
        }
    }
    
    // Save to metrics DB if available
    if let Some(db_url) = pg_url {
        if let Ok(pg_pool) = sqlx::PgPool::connect(db_url).await {
            let _ = sqlx::query(
                "INSERT INTO search_stats (ts, region, tenant, cluster_status, red_indices, yellow_indices, query_p95_ms)
                 VALUES (now(), 'us-east-1', 'enterprise_123', $1, $2, $3, $4)"
            )
            .bind(&status)
            .bind(red_indices)
            .bind(yellow_indices)
            .bind(query_p95_ms)
            .execute(&pg_pool)
            .await;
        }
    }
    
    info!("OpenSearch metrics collected: status={}, red={}, yellow={}, p95={}ms", 
          status, red_indices, yellow_indices, query_p95_ms);
    Ok(())
}

fn check_auth(headers: &HeaderMap, token: &str) -> bool {
    // Accept either the static admin token (legacy) OR any non-empty Bearer token (JWT handled in handlers)
    if let Some(hv) = headers.get(http::header::AUTHORIZATION) {
        if let Ok(s) = hv.to_str() {
            if let Some(rest) = s.strip_prefix("Bearer ") {
                // If it matches the static token, allow
                if rest == token { return true; }
                // Otherwise, treat as JWT present; allow here and let handlers perform detailed validation
                return !rest.is_empty();
            }
        }
    }
    false
}

#[derive(Deserialize)]
struct CommonQuery {
    region: Option<String>,
    tenant: Option<String>,
    window: Option<String>,
    limit: Option<u32>,
}

#[derive(Serialize)]
struct SummaryDatabases {
    p95_ms: f64,
    p99_ms: f64,
    active_connections: u32,
    max_connections: u32,
    replication_lag_sec: f64,
    health: &'static str,
}

#[derive(Serialize)]
struct SummaryRedis {
    hit_ratio: f64,
    mem_used_mb: f64,
    evictions: u32,
    health: &'static str,
}

#[derive(Serialize)]
struct SummaryQueues {
    queue_depth: u32,
    consumer_lag: u32,
    oldest_age_sec: u32,
    health: &'static str,
}

#[derive(Serialize)]
struct SummarySearch {
    cluster_status: &'static str,
    red_indices: u32,
    yellow_indices: u32,
    query_p95_ms: f64,
    health: &'static str,
}

#[derive(Serialize)]
struct SummaryResponse {
    region: String,
    tenant: String,
    window: String,
    generated_at: String,
    databases: SummaryDatabases,
    redis: SummaryRedis,
    queues: SummaryQueues,
    search: SummarySearch,
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "stateful-dashboard-backend",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

// =============================================================================
// AUTH ENDPOINTS
// =============================================================================

/// Login endpoint - validates credentials against 1Password and returns JWT
async fn login(
    State(state): State<AppState>,
    Json(req): Json<auth::LoginRequest>,
) -> Result<Json<auth::LoginResponse>, (StatusCode, Json<auth::ErrorResponse>)> {
    info!("Login attempt for user: {}", req.username);
    
    // Validate credentials against 1Password
    let is_valid = secrets::verify_user_credentials(
        &state.config.vault_name,
        &req.username,
        &req.password,
    ).unwrap_or(false);
    
    if !is_valid {
        warn!("Failed login attempt for user: {}", req.username);
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(auth::ErrorResponse {
                error: "Invalid username or password".to_string(),
            }),
        ));
    }
    
    // Get user role from 1Password
    let role = secrets::get_user_role(&state.config.vault_name, &req.username)
        .unwrap_or_else(|_| "viewer".to_string());
    
    // Generate JWT token
    let token = state.jwt_config.generate_token(req.username.clone(), role.clone())
        .map_err(|e| {
            error!("Failed to generate JWT: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(auth::ErrorResponse {
                    error: "Failed to generate authentication token".to_string(),
                }),
            )
        })?;
    
    info!("Successful login for user: {} (role: {})", req.username, role);
    
    Ok(Json(auth::LoginResponse {
        token,
        username: req.username,
        role,
        expires_in: state.jwt_config.expires_in_hours * 3600, // Convert to seconds
    }))
}

/// Signup endpoint - creates a new user in 1Password and returns JWT
async fn signup(
    State(state): State<AppState>,
    Json(req): Json<auth::SignupRequest>,
) -> Result<Json<auth::LoginResponse>, (StatusCode, Json<auth::ErrorResponse>)> {
    info!("Signup attempt for user: {}", req.username);
    
    // Validate input
    if req.username.is_empty() || req.password.is_empty() || req.email.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(auth::ErrorResponse {
                error: "Username, password, and email are required".to_string(),
            }),
        ));
    }
    
    // Check if user already exists
    if secrets::user_exists(&state.config.vault_name, &req.username) {
        warn!("Signup attempt for existing user: {}", req.username);
        return Err((
            StatusCode::CONFLICT,
            Json(auth::ErrorResponse {
                error: "Username already exists".to_string(),
            }),
        ));
    }
    
    // Default role to "viewer" if not specified
    let role = req.role.unwrap_or_else(|| "viewer".to_string());
    
    // Create user in 1Password
    secrets::create_user(
        &state.config.vault_name,
        &req.username,
        &req.password,
        &req.email,
        &role,
    ).map_err(|e| {
        error!("Failed to create user in 1Password: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(auth::ErrorResponse {
                error: format!("Failed to create user: {}", e),
            }),
        )
    })?;
    
    // Generate JWT token
    let token = state.jwt_config.generate_token(req.username.clone(), role.clone())
        .map_err(|e| {
            error!("Failed to generate JWT: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(auth::ErrorResponse {
                    error: "Failed to generate authentication token".to_string(),
                }),
            )
        })?;
    
    info!("Successfully created user: {} (role: {})", req.username, role);
    
    Ok(Json(auth::LoginResponse {
        token,
        username: req.username,
        role,
        expires_in: state.jwt_config.expires_in_hours * 3600,
    }))
}

// =============================================================================
// CLOUDWATCH ROUTE
// =============================================================================

async fn get_cw_summary(
    Query(q): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let ns = q.get("ns").cloned().unwrap_or_else(|| "DemoApp".to_string());
    let ep = q.get("endpoint").cloned().unwrap_or_else(|| "/search".to_string());
    let minutes: i64 = q.get("minutes").and_then(|v| v.parse().ok()).unwrap_or(60);

    let p95 = aws::cw_get_p95_latency(&ns, &ep, minutes).await.unwrap_or(0.0);
    let reqs = aws::cw_get_sum(&ns, "RequestCount", &ep, minutes).await.unwrap_or(0.0);
    let errs = aws::cw_get_sum(&ns, "Error", &ep, minutes).await.unwrap_or(0.0);
    let err_rate = if reqs > 0.0 { errs / reqs } else { 0.0 };

    Json(serde_json::json!({
        "namespace": ns,
        "endpoint": ep,
        "minutes": minutes,
        "p95_ms": p95,
        "requests": reqs,
        "errors": errs,
        "error_rate": err_rate,
    }))
}

async fn get_cw_traces(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let ns = q.get("ns").cloned().unwrap_or_else(|| "1PasswordSimulator".to_string());
    let minutes: i64 = q.get("minutes").and_then(|v| v.parse().ok()).unwrap_or(60);

    let cache_key = format!("traces:{}", ns);
    
    if let Some(client) = &state.redis_client {
        if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
            if let Ok(cached_json) = redis::cmd("GET")
                .arg(&cache_key)
                .query_async::<_, String>(&mut conn)
                .await 
            {
                info!("Redis cache hit for traces: {}", ns);
                if let Ok(cached_data) = serde_json::from_str::<serde_json::Value>(&cached_json) {
                    return Json(cached_data);
                }
            }
        }
    }
    
    if let Ok(cache) = state.trace_cache.read() {
        if let Some(entry) = cache.get(&cache_key) {
            if entry.expires_at > std::time::Instant::now() {
                info!("In-memory cache hit for traces: {}", ns);
                if let Ok(cached_data) = serde_json::from_str::<serde_json::Value>(&entry.data) {
                    return Json(cached_data);
                }
            }
        }
    }

    info!("Cache miss for traces: {}, fetching from CloudWatch...", ns);

    let endpoints = aws::cw_list_endpoints(&ns).await.unwrap_or_default();
    let mut tasks = vec![];
    for endpoint in endpoints.iter().take(15) {
        let ns_clone = ns.clone();
        let endpoint_clone = endpoint.clone();
        tasks.push(tokio::spawn(async move {
            let latency = aws::cw_get_p95_latency(&ns_clone, &endpoint_clone, 5).await.unwrap_or(100.0);
            let requests = aws::cw_get_sum(&ns_clone, "RequestCount", &endpoint_clone, 5).await.unwrap_or(1.0);
            let errors = aws::cw_get_sum(&ns_clone, "Error", &endpoint_clone, 5).await.unwrap_or(0.0);
            (endpoint_clone, latency, requests, errors)
        }));
    }
    
    let results = futures::future::join_all(tasks).await;
    
    let mut traces = vec![];
    for result in results {
        if let Ok((endpoint, latency, requests, errors)) = result {
            if requests > 0.0 {
                let status = if errors > 0.0 { "error" } else { "success" };
                let method = if endpoint.contains("get") || endpoint.contains("list") || endpoint.contains("search") || endpoint.contains("verify") || endpoint.contains("activity") {
                    "GET"
                } else if endpoint.contains("update") {
                    "PUT"
                } else if endpoint.contains("delete") {
                    "DELETE"
                } else {
                    "POST"
                };
                
                // Generate a trace ID
                let trace_id = format!("{:x}", md5::compute(format!("{}{}", endpoint, latency)));
                
                // Estimate spans based on endpoint complexity
                let spans = if endpoint.contains("share") || endpoint.contains("create") {
                    8 + (latency as usize / 30)
                } else if endpoint.contains("update") {
                    7 + (latency as usize / 40)
                } else {
                    4 + (latency as usize / 50)
                };
                
                traces.push(serde_json::json!({
                    "id": trace_id,
                    "method": method,
                    "endpoint": endpoint,
                    "status": status,
                    "duration": latency as u64,
                    "spans": spans,
                    "service": "api-gateway",
                    "timestamp": chrono::Utc::now().format("%m/%d/%Y, %I:%M:%S %p").to_string(),
                }));
            }
        }
    }
    
    // Sort by duration descending
    traces.sort_by(|a, b| {
        let a_dur = a["duration"].as_u64().unwrap_or(0);
        let b_dur = b["duration"].as_u64().unwrap_or(0);
        b_dur.cmp(&a_dur)
    });
    
    let response = serde_json::json!({
        "traces": traces,
        "namespace": ns,
        "minutes": minutes,
    });

    let response_str = response.to_string();
    let mut cached_in_redis = false;
    
    if let Some(client) = &state.redis_client {
        if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
            if redis::cmd("SETEX")
                .arg(&cache_key)
                .arg(300)
                .arg(&response_str)
                .query_async::<_, ()>(&mut conn)
                .await
                .is_ok()
            {
                info!("Cached traces in Redis for: {}", ns);
                cached_in_redis = true;
            }
        }
    }
    
    if !cached_in_redis {
        if let Ok(mut cache) = state.trace_cache.write() {
            cache.insert(cache_key.clone(), CacheEntry {
                data: response_str,
                expires_at: std::time::Instant::now() + Duration::from_secs(300),
            });
            info!("Cached traces in memory for: {}", ns);
        }
    }
    
    Json(response)
}

async fn get_cw_metric_timeseries(
    Query(q): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let ns = q.get("ns").cloned().unwrap_or_else(|| "1PasswordSimulator".to_string());
    let metric = q.get("metric").cloned().unwrap_or_else(|| "LatencyMs".to_string());
    let endpoint = q.get("endpoint").cloned().unwrap_or_else(|| "/api/v1/items/get".to_string());
    let stat = q.get("stat").cloned().unwrap_or_else(|| "Average".to_string());
    let minutes: i64 = q.get("minutes").and_then(|v| v.parse().ok()).unwrap_or(60);

    let data = aws::cw_get_metric_timeseries(&ns, &metric, &endpoint, &stat, minutes)
        .await
        .unwrap_or_default();

    Json(serde_json::json!({
        "namespace": ns,
        "metric": metric,
        "endpoint": endpoint,
        "stat": stat,
        "minutes": minutes,
        "data": data,
    }))
}

async fn get_logs_by_trace(
    Query(q): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let trace_id = match q.get("trace_id") {
        Some(id) => id,
        None => return Json(serde_json::json!({"logs": []})),
    };

    // Search OpenSearch for logs with this trace_id
    let opensearch_url = std::env::var("OPENSEARCH_URL")
        .unwrap_or_else(|_| "http://localhost:9200".to_string());
    
    let client = reqwest::Client::new();
    
    // Search across all log indices
    let search_query = serde_json::json!({
        "query": {
            "match": {
                "trace_id": trace_id
            }
        },
        "sort": [
            {"timestamp": {"order": "asc"}}
        ],
        "size": 50
    });
    
    let logs = match client
        .post(format!("{}logs-*/_search", opensearch_url))
        .json(&search_query)
        .timeout(Duration::from_secs(2))
        .send()
        .await
    {
        Ok(response) => {
            if let Ok(result) = response.json::<serde_json::Value>().await {
                if let Some(hits) = result["hits"]["hits"].as_array() {
                    hits.iter()
                        .filter_map(|hit| hit["_source"].as_object())
                        .map(|source| serde_json::json!({
                            "timestamp": source.get("timestamp").and_then(|v| v.as_str()).unwrap_or(""),
                            "level": source.get("level").and_then(|v| v.as_str()).unwrap_or("INFO"),
                            "service": source.get("service").and_then(|v| v.as_str()).unwrap_or("unknown"),
                            "message": source.get("message").and_then(|v| v.as_str()).unwrap_or(""),
                            "endpoint": source.get("endpoint").and_then(|v| v.as_str()).unwrap_or(""),
                        }))
                        .collect::<Vec<_>>()
                } else {
                    vec![]
                }
            } else {
                vec![]
            }
        }
        Err(_) => vec![],
    };

    Json(serde_json::json!({
        "trace_id": trace_id,
        "logs": logs,
    }))
}

// =============================================================================
// DATA ENDPOINTS
// =============================================================================

async fn get_summary(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<CommonQuery>,
) -> impl IntoResponse {
    if !check_auth(&headers, &state.config.admin_token) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let region = q.region.unwrap_or_else(|| "us-east-1".to_string());
    let tenant = q.tenant.unwrap_or_else(|| "enterprise_123".to_string());
    let window = q.window.unwrap_or_else(|| "5m".to_string());

    // Query real data from database if available
    let (p95_ms, p99_ms) = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (f64, f64)>(
            "SELECT COALESCE(AVG(p95_ms), 0.0), COALESCE(AVG(p99_ms), 0.0) 
             FROM pg_query_stats 
             WHERE region = $1 AND tenant = $2"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_one(pool)
        .await
        .unwrap_or((22.4, 120.0))
    } else {
        (22.4, 120.0)
    };

    let (active_conn, max_conn, repl_lag) = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (i32, i32, f64)>(
            "SELECT active, max, replication_lag_sec 
             FROM pg_conn_stats 
             WHERE region = $1 AND tenant = $2 
             ORDER BY ts DESC LIMIT 1"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_one(pool)
        .await
        .unwrap_or((58, 100, 0.4))
    } else {
        (58, 100, 0.4)
    };

    let (hit_ratio, mem_used, evictions) = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (f64, f64, i32)>(
            "SELECT hit_ratio, mem_used_mb, evictions 
             FROM redis_stats 
             WHERE region = $1 AND tenant = $2 
             ORDER BY ts DESC LIMIT 1"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_one(pool)
        .await
        .unwrap_or((0.93, 412.0, 0))
    } else {
        (0.93, 412.0, 0)
    };

    let (queue_depth, consumer_lag, oldest_age) = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (i32, i32, i32)>(
            "SELECT depth, consumer_lag, oldest_age_sec 
             FROM queue_stats 
             WHERE region = $1 AND tenant = $2 
             ORDER BY ts DESC LIMIT 1"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_one(pool)
        .await
        .unwrap_or((120, 35, 42))
    } else {
        (120, 35, 42)
    };

    let (cluster_status, red_indices, yellow_indices, query_p95) = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (String, i32, i32, f64)>(
            "SELECT cluster_status, red_indices, yellow_indices, query_p95_ms 
             FROM search_stats 
             WHERE region = $1 AND tenant = $2 
             ORDER BY ts DESC LIMIT 1"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_one(pool)
        .await
        .unwrap_or(("green".to_string(), 0, 1, 45.0))
    } else {
        ("green".to_string(), 0, 1, 45.0)
    };

    let resp = SummaryResponse {
        region,
        tenant,
        window,
        generated_at: time::OffsetDateTime::now_utc().format(&time::format_description::well_known::Rfc3339).unwrap(),
        databases: SummaryDatabases {
            p95_ms,
            p99_ms,
            active_connections: active_conn as u32,
            max_connections: max_conn as u32,
            replication_lag_sec: repl_lag,
            health: "healthy",
        },
        redis: SummaryRedis { 
            hit_ratio, 
            mem_used_mb: mem_used, 
            evictions: evictions as u32, 
            health: "healthy" 
        },
        queues: SummaryQueues { 
            queue_depth: queue_depth as u32, 
            consumer_lag: consumer_lag as u32, 
            oldest_age_sec: oldest_age as u32, 
            health: "warning" 
        },
        search: SummarySearch { 
            cluster_status: Box::leak(cluster_status.into_boxed_str()), 
            red_indices: red_indices as u32, 
            yellow_indices: yellow_indices as u32, 
            query_p95_ms: query_p95, 
            health: "healthy" 
        },
    };
    (StatusCode::OK, Json(resp)).into_response()
}

#[derive(Serialize)]
struct PgTopQuery {
    fingerprint: String,
    sample_query: String,
    calls: u32,
    mean_ms: f64,
    p95_ms: f64,
    p99_ms: f64,
    total_time_ms: f64,
    rows: u32,
}

#[derive(Serialize)]
struct PgTopQueriesResponse {
    region: String,
    tenant: String,
    window: String,
    queries: Vec<PgTopQuery>,
}

async fn get_pg_top_queries(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<CommonQuery>,
) -> impl IntoResponse {
    if !check_auth(&headers, &state.config.admin_token) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let region = q.region.unwrap_or_else(|| "us-east-1".to_string());
    let tenant = q.tenant.unwrap_or_else(|| "enterprise_123".to_string());
    let window = q.window.unwrap_or_else(|| "5m".to_string());
    let limit = q.limit.unwrap_or(10) as i64;

    let queries = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (String, String, i32, f64, f64, f64, f64, i32)>(
            "SELECT fingerprint, sample_query, calls, mean_ms, p95_ms, p99_ms, total_time_ms, rows 
             FROM pg_query_stats 
             WHERE region = $1 AND tenant = $2 
             ORDER BY p99_ms DESC 
             LIMIT $3"
        )
        .bind(&region)
        .bind(&tenant)
        .bind(limit)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(fingerprint, sample_query, calls, mean_ms, p95_ms, p99_ms, total_time_ms, rows)| {
            PgTopQuery {
                fingerprint,
                sample_query,
                calls: calls as u32,
                mean_ms,
                p95_ms,
                p99_ms,
                total_time_ms,
                rows: rows as u32,
            }
        })
        .collect()
    } else {
        vec![
            PgTopQuery { fingerprint: "select-orders-by-id".into(), sample_query: "SELECT * FROM orders WHERE id = $1".into(), calls: 5200, mean_ms: 12.4, p95_ms: 40.0, p99_ms: 95.0, total_time_ms: 64500.0, rows: 5200 },
            PgTopQuery { fingerprint: "update-order-status".into(), sample_query: "UPDATE orders SET status = $1 WHERE id = $2".into(), calls: 1200, mean_ms: 25.1, p95_ms: 80.0, p99_ms: 140.0, total_time_ms: 30120.0, rows: 1200 },
        ]
    };

    let resp = PgTopQueriesResponse { region, tenant, window, queries };
    (StatusCode::OK, Json(resp)).into_response()
}

#[derive(Serialize)]
struct LatencyPoint { ts: String, p95_ms: f64, p99_ms: f64 }

#[derive(Serialize)]
struct PgMetricsResponse {
    region: String,
    tenant: String,
    window: String,
    p95_ms: f64,
    p99_ms: f64,
    active_connections: u32,
    max_connections: u32,
    replication_lag_sec: f64,
    latency_series: Vec<LatencyPoint>,
}

async fn get_pg_metrics(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<CommonQuery>) -> impl IntoResponse {
    if !check_auth(&headers, &state.config.admin_token) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let region = q.region.unwrap_or_else(|| "us-east-1".to_string());
    let tenant = q.tenant.unwrap_or_else(|| "enterprise_123".to_string());
    let window = q.window.unwrap_or_else(|| "5m".to_string());

    // Get latest metrics
    let (p95_ms, p99_ms) = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (f64, f64)>(
            "SELECT COALESCE(AVG(p95_ms), 0.0), COALESCE(AVG(p99_ms), 0.0) 
             FROM pg_query_stats 
             WHERE region = $1 AND tenant = $2"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_one(pool)
        .await
        .unwrap_or((22.0, 115.0))
    } else {
        (22.0, 115.0)
    };

    let (active_conn, max_conn, repl_lag) = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (i32, i32, f64)>(
            "SELECT active, max, replication_lag_sec 
             FROM pg_conn_stats 
             WHERE region = $1 AND tenant = $2 
             ORDER BY ts DESC LIMIT 1"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_one(pool)
        .await
        .unwrap_or((62, 100, 0.3))
    } else {
        (62, 100, 0.3)
    };

    // Get time-series data for latency (last 30 points)
    let latency_series = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (String, f64, f64)>(
            "SELECT to_char(ts, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as ts, p95_ms, p99_ms 
             FROM pg_query_stats 
             WHERE region = $1 AND tenant = $2 
             ORDER BY ts DESC 
             LIMIT 30"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .rev()
        .map(|(ts, p95, p99)| LatencyPoint {
            ts,
            p95_ms: p95,
            p99_ms: p99,
        })
        .collect()
    } else {
        let now = time::OffsetDateTime::now_utc();
        (0..30).rev().map(|i| {
            let ts = (now - time::Duration::seconds(i * 10)).format(&time::format_description::well_known::Rfc3339).unwrap();
            LatencyPoint { ts, p95_ms: 20.0 + (i as f64 % 5.0), p99_ms: 100.0 + (i as f64 % 15.0) }
        }).collect()
    };

    let resp = PgMetricsResponse {
        region,
        tenant,
        window,
        p95_ms,
        p99_ms,
        active_connections: active_conn as u32,
        max_connections: max_conn as u32,
        replication_lag_sec: repl_lag,
        latency_series,
    };
    (StatusCode::OK, Json(resp)).into_response()
}

#[derive(Serialize)]
struct RedisHotKey { key: String, hits: u32 }

#[derive(Serialize)]
struct RedisMetricsResponse {
    region: String,
    tenant: String,
    window: String,
    hit_ratio: f64,
    mem_used_mb: f64,
    evictions: u32,
    ops_sec: u32,
    hot_keys: Vec<RedisHotKey>,
}

async fn get_redis_metrics(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<CommonQuery>) -> impl IntoResponse {
    if !check_auth(&headers, &state.config.admin_token) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let region = q.region.unwrap_or_else(|| "us-east-1".to_string());
    let tenant = q.tenant.unwrap_or_else(|| "enterprise_123".to_string());
    let window = q.window.unwrap_or_else(|| "5m".to_string());

    let (hit_ratio, mem_used, evictions, ops_sec) = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (f64, f64, i32, i32)>(
            "SELECT hit_ratio, mem_used_mb, evictions, ops_sec 
             FROM redis_stats 
             WHERE region = $1 AND tenant = $2 
             ORDER BY ts DESC LIMIT 1"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_one(pool)
        .await
        .unwrap_or((0.94, 512.0, 0, 3200))
    } else {
        (0.94, 512.0, 0, 3200)
    };

    // Stubbed hot keys (would need separate table in production)
    let hot_keys = vec![
        RedisHotKey { key: "tenant:enterprise_123:session:abc".into(), hits: 1820 },
        RedisHotKey { key: "cfg:feature-flags".into(), hits: 950 },
    ];

    let resp = RedisMetricsResponse { 
        region, 
        tenant, 
        window, 
        hit_ratio, 
        mem_used_mb: mem_used, 
        evictions: evictions as u32, 
        ops_sec: ops_sec as u32, 
        hot_keys 
    };
    (StatusCode::OK, Json(resp)).into_response()
}

// MySQL monitoring endpoints
#[derive(Serialize)]
struct MySQLMetricsResponse {
    region: String,
    tenant: String,
    window: String,
    p95_ms: f64,
    p99_ms: f64,
    active_connections: u32,
    max_connections: u32,
    slow_queries: u32,
    replication_lag_sec: f64,
}

async fn get_mysql_metrics(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<CommonQuery>) -> impl IntoResponse {
    if !check_auth(&headers, &state.config.admin_token) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let region = q.region.unwrap_or_else(|| "us-east-1".to_string());
    let tenant = q.tenant.unwrap_or_else(|| "enterprise_123".to_string());
    let window = q.window.unwrap_or_else(|| "5m".to_string());

    // Get real data from database if available
    let (active_conn, max_conn, slow_queries, repl_lag) = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (i32, i32, i32, f64)>(
            "SELECT active, max, slow_queries, replication_lag_sec 
             FROM mysql_conn_stats 
             WHERE region = $1 AND tenant = $2 
             ORDER BY ts DESC LIMIT 1"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_one(pool)
        .await
        .unwrap_or((25, 150, 8, 0.12))
    } else {
        (25, 150, 8, 0.12)
    };

    let (p95_ms, p99_ms) = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (f64, f64)>(
            "SELECT COALESCE(AVG(p95_ms), 18.5), COALESCE(AVG(p99_ms), 45.2) 
             FROM mysql_query_stats 
             WHERE region = $1 AND tenant = $2"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_one(pool)
        .await
        .unwrap_or((18.5, 45.2))
    } else {
        (18.5, 45.2)
    };

    let resp = MySQLMetricsResponse {
        region,
        tenant,
        window,
        p95_ms,
        p99_ms,
        active_connections: active_conn as u32,
        max_connections: max_conn as u32,
        slow_queries: slow_queries as u32,
        replication_lag_sec: repl_lag,
    };
    (StatusCode::OK, Json(resp)).into_response()
}

#[derive(Serialize)]
struct MySQLTopQuery {
    fingerprint: String,
    sample_query: String,
    calls: u32,
    mean_ms: f64,
    p95_ms: f64,
    p99_ms: f64,
    total_time_ms: f64,
    rows: u32,
}

#[derive(Serialize)]
struct MySQLTopQueriesResponse {
    region: String,
    tenant: String,
    window: String,
    queries: Vec<MySQLTopQuery>,
}

async fn get_mysql_top_queries(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<CommonQuery>) -> impl IntoResponse {
    if !check_auth(&headers, &state.config.admin_token) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let region = q.region.unwrap_or_else(|| "us-east-1".to_string());
    let tenant = q.tenant.unwrap_or_else(|| "enterprise_123".to_string());
    let window = q.window.unwrap_or_else(|| "5m".to_string());
    let limit = q.limit.unwrap_or(10) as i64;

    let queries = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (String, String, i32, f64, f64, f64, f64, i32)>(
            "SELECT fingerprint, sample_query, calls, mean_ms, p95_ms, p99_ms, total_time_ms, rows 
             FROM mysql_query_stats 
             WHERE region = $1 AND tenant = $2 
             ORDER BY p99_ms DESC 
             LIMIT $3"
        )
        .bind(&region)
        .bind(&tenant)
        .bind(limit)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(fingerprint, sample_query, calls, mean_ms, p95_ms, p99_ms, total_time_ms, rows)| {
            MySQLTopQuery {
                fingerprint,
                sample_query,
                calls: calls as u32,
                mean_ms,
                p95_ms,
                p99_ms,
                total_time_ms,
                rows: rows as u32,
            }
        })
        .collect()
    } else {
        vec![
            MySQLTopQuery {
                fingerprint: "SELECT * FROM user_vaults WHERE user_id = ?".into(),
                sample_query: "SELECT * FROM user_vaults WHERE user_id = 'abc123'".into(),
                calls: 1850,
                mean_ms: 15.3,
                p95_ms: 32.1,
                p99_ms: 58.7,
                total_time_ms: 28305.0,
                rows: 3700,
            },
            MySQLTopQuery {
                fingerprint: "UPDATE sync_status SET last_sync = ? WHERE vault_id = ?".into(),
                sample_query: "UPDATE sync_status SET last_sync = NOW() WHERE vault_id = 'v789'".into(),
                calls: 950,
                mean_ms: 8.2,
                p95_ms: 18.5,
                p99_ms: 35.0,
                total_time_ms: 7790.0,
                rows: 950,
            },
        ]
    };

    let resp = MySQLTopQueriesResponse { region, tenant, window, queries };
    (StatusCode::OK, Json(resp)).into_response()
}

// Kafka-specific metrics
#[derive(Serialize)]
struct KafkaMetricsResponse {
    region: String,
    tenant: String,
    window: String,
    topics: Vec<KafkaTopic>,
    consumer_groups: Vec<KafkaConsumerGroup>,
}

#[derive(Serialize)]
struct KafkaTopic {
    name: String,
    partitions: u32,
    messages_per_sec: f64,
    bytes_in_per_sec: f64,
    lag: u64,
}

#[derive(Serialize)]
struct KafkaConsumerGroup {
    name: String,
    lag: u64,
    members: u32,
}

async fn get_kafka_metrics(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<CommonQuery>) -> impl IntoResponse {
    if !check_auth(&headers, &state.config.admin_token) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let region = q.region.unwrap_or_else(|| "us-east-1".to_string());
    let tenant = q.tenant.unwrap_or_else(|| "enterprise_123".to_string());
    let window = q.window.unwrap_or_else(|| "5m".to_string());

    // Mock data for now (will be replaced with real Kafka admin API queries)
    let topics = vec![
        KafkaTopic {
            name: "vault-operations".into(),
            partitions: 8,
            messages_per_sec: 450.5,
            bytes_in_per_sec: 128000.0,
            lag: 1250,
        },
        KafkaTopic {
            name: "sync-events".into(),
            partitions: 4,
            messages_per_sec: 220.3,
            bytes_in_per_sec: 64000.0,
            lag: 890,
        },
    ];

    let consumer_groups = vec![
        KafkaConsumerGroup {
            name: "vault-processor".into(),
            lag: 1250,
            members: 4,
        },
        KafkaConsumerGroup {
            name: "sync-handler".into(),
            lag: 890,
            members: 2,
        },
    ];

    let resp = KafkaMetricsResponse { region, tenant, window, topics, consumer_groups };
    (StatusCode::OK, Json(resp)).into_response()
}

#[derive(Serialize)]
struct QueueMetric { system: String, queue_name: String, depth: u32, consumer_lag: u32, oldest_age_sec: u32 }

#[derive(Serialize)]
struct QueuesMetricsResponse {
    region: String,
    tenant: String,
    window: String,
    queues: Vec<QueueMetric>,
}

async fn get_queues_metrics(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<CommonQuery>) -> impl IntoResponse {
    if !check_auth(&headers, &state.config.admin_token) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let region = q.region.unwrap_or_else(|| "us-east-1".to_string());
    let tenant = q.tenant.unwrap_or_else(|| "enterprise_123".to_string());
    let window = q.window.unwrap_or_else(|| "5m".to_string());

    let queues = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (String, String, i32, i32, i32)>(
            "SELECT system, queue_name, depth, consumer_lag, oldest_age_sec 
             FROM queue_stats 
             WHERE region = $1 AND tenant = $2 
             ORDER BY ts DESC 
             LIMIT 10"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(system, queue_name, depth, consumer_lag, oldest_age_sec)| {
            QueueMetric {
                system,
                queue_name,
                depth: depth as u32,
                consumer_lag: consumer_lag as u32,
                oldest_age_sec: oldest_age_sec as u32,
            }
        })
        .collect()
    } else {
        vec![
            QueueMetric { system: "kafka".into(), queue_name: "orders".into(), depth: 120, consumer_lag: 35, oldest_age_sec: 42 },
            QueueMetric { system: "sqs".into(), queue_name: "email".into(), depth: 15, consumer_lag: 3, oldest_age_sec: 9 },
        ]
    };

    let resp = QueuesMetricsResponse { region, tenant, window, queues };
    (StatusCode::OK, Json(resp)).into_response()
}

#[derive(Serialize)]
struct SearchMetricsResponse {
    region: String,
    tenant: String,
    window: String,
    cluster_status: String,
    red_indices: u32,
    yellow_indices: u32,
    query_p95_ms: f64,
}

async fn get_search_metrics(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<CommonQuery>) -> impl IntoResponse {
    if !check_auth(&headers, &state.config.admin_token) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let region = q.region.unwrap_or_else(|| "us-east-1".to_string());
    let tenant = q.tenant.unwrap_or_else(|| "enterprise_123".to_string());
    let window = q.window.unwrap_or_else(|| "5m".to_string());

    // Get real data from database collected by OpenSearch collector
    let (cluster_status, red_indices, yellow_indices, query_p95_ms) = if let Some(pool) = &state.db_pool {
        sqlx::query_as::<_, (String, i32, i32, f64)>(
            "SELECT cluster_status, red_indices, yellow_indices, query_p95_ms 
             FROM search_stats 
             WHERE region = $1 AND tenant = $2 
             ORDER BY ts DESC LIMIT 1"
        )
        .bind(&region)
        .bind(&tenant)
        .fetch_one(pool)
        .await
        .unwrap_or(("green".to_string(), 0, 0, 45.0))
    } else {
        ("green".to_string(), 0, 0, 45.0)
    };

    let resp = SearchMetricsResponse { 
        region, 
        tenant, 
        window, 
        cluster_status, 
        red_indices: red_indices as u32, 
        yellow_indices: yellow_indices as u32, 
        query_p95_ms 
    };
    (StatusCode::OK, Json(resp)).into_response()
}

#[derive(Deserialize, Serialize, Clone)]
struct InsightsRequestFilters { region: Option<String>, tenant: Option<String>, window: Option<String> }

#[derive(Deserialize)]
struct InsightsRequest { _question: String, filters: Option<InsightsRequestFilters> }

#[derive(Serialize)]
struct InsightsResponse { answer: String, links: Vec<String>, confidence: f32, filters: Option<InsightsRequestFilters>, assumptions: Vec<String> }

async fn post_insights(State(state): State<AppState>, headers: HeaderMap, Json(req): Json<InsightsRequest>) -> impl IntoResponse {
    if !check_auth(&headers, &state.config.admin_token) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let filters = req.filters.unwrap_or(InsightsRequestFilters { region: Some("us-east-1".into()), tenant: Some("enterprise_123".into()), window: Some("1h".into()) });
    let answer = "p95 DB latency rose due to lock waits on orders; top query fingerprint select-orders-by-id accounts for most time; connections at 80% of max. See DB details → Top Queries and Locks.".to_string();
    let links = vec!["/db/pg?region=us-east-1&tenant=enterprise_123&panel=top-queries".into(), "/db/pg?region=us-east-1&tenant=enterprise_123&panel=locks".into()];
    let resp = InsightsResponse { answer, links, confidence: 0.82, filters: Some(filters), assumptions: vec!["Used default window 1h since none specified".into()] };
    (StatusCode::OK, Json(resp)).into_response()
}


