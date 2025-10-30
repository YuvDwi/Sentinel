-- Comprehensive seed data for Stateful Dashboard
-- Includes multiple regions, tenants, and time-series data

-- Helper: Generate timestamps for the last 24 hours
-- We'll insert data points every 5 minutes for realistic time-series

-- Clean existing data
TRUNCATE TABLE pg_query_stats, pg_conn_stats, redis_stats, queue_stats, search_stats;

-- ============================================================================
-- PostgreSQL Query Stats
-- ============================================================================

-- US-EAST-1 / Enterprise (simulating production load)
INSERT INTO pg_query_stats (ts, region, tenant, fingerprint, sample_query, calls, mean_ms, p95_ms, p99_ms, total_time_ms, rows) VALUES
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'enterprise_123', 'select-user-by-id', 'SELECT * FROM users WHERE id = $1', 1200, 2.0, 18.2, 45.3, 2400.5, 1200),
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'enterprise_123', 'select-orders', 'SELECT * FROM orders WHERE customer_id = $1', 850, 6.1, 32.1, 78.9, 5200.8, 850),
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'enterprise_123', 'update-sessions', 'UPDATE sessions SET last_active = NOW() WHERE session_id = $1', 3500, 2.5, 12.5, 28.4, 8900.2, 3500),
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'enterprise_123', 'select-products', 'SELECT * FROM products WHERE category = $1 AND status = $2', 420, 8.3, 45.2, 89.1, 3500.6, 4200),
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'enterprise_123', 'insert-events', 'INSERT INTO events (user_id, event_type, data) VALUES ($1, $2, $3)', 2100, 1.8, 8.2, 15.3, 3780.0, 2100),

-- US-EAST-1 / Consumer (lighter load)
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'consumer_456', 'select-user-by-id', 'SELECT * FROM users WHERE id = $1', 450, 1.8, 12.4, 28.5, 810.0, 450),
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'consumer_456', 'select-products', 'SELECT * FROM products WHERE category = $1', 650, 5.2, 24.7, 55.6, 3380.0, 650),
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'consumer_456', 'update-profile', 'UPDATE user_profiles SET data = $1 WHERE user_id = $2', 280, 4.1, 18.3, 42.1, 1148.0, 280),

-- EU-WEST-1 / Enterprise (EU production)
(NOW() - INTERVAL '0 minutes', 'eu-west-1', 'enterprise_123', 'select-user-by-id', 'SELECT * FROM users WHERE id = $1', 980, 1.5, 15.8, 38.2, 1470.0, 980),
(NOW() - INTERVAL '0 minutes', 'eu-west-1', 'enterprise_123', 'select-orders', 'SELECT * FROM orders WHERE customer_id = $1', 720, 5.8, 28.4, 65.3, 4176.0, 720),
(NOW() - INTERVAL '0 minutes', 'eu-west-1', 'enterprise_123', 'update-sessions', 'UPDATE sessions SET last_active = NOW() WHERE session_id = $1', 2800, 2.2, 11.2, 24.8, 6160.0, 2800),

-- AP-SOUTH-1 / Consumer (APAC region)
(NOW() - INTERVAL '0 minutes', 'ap-south-1', 'consumer_789', 'select-user-by-id', 'SELECT * FROM users WHERE id = $1', 320, 2.2, 16.8, 42.5, 704.0, 320),
(NOW() - INTERVAL '0 minutes', 'ap-south-1', 'consumer_789', 'select-products', 'SELECT * FROM products WHERE category = $1', 480, 6.4, 32.5, 68.2, 3072.0, 480);

-- ============================================================================
-- PostgreSQL Connection Stats
-- ============================================================================

INSERT INTO pg_conn_stats (ts, region, tenant, active, waiting, max, replication_lag_sec) VALUES
-- US-EAST-1
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'enterprise_123', 58, 2, 100, 0.4),
(NOW() - INTERVAL '5 minutes', 'us-east-1', 'enterprise_123', 62, 1, 100, 0.3),
(NOW() - INTERVAL '10 minutes', 'us-east-1', 'enterprise_123', 55, 0, 100, 0.2),
(NOW() - INTERVAL '15 minutes', 'us-east-1', 'enterprise_123', 48, 0, 100, 0.3),
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'consumer_456', 28, 0, 100, 0.2),
(NOW() - INTERVAL '5 minutes', 'us-east-1', 'consumer_456', 32, 1, 100, 0.1),
-- EU-WEST-1
(NOW() - INTERVAL '0 minutes', 'eu-west-1', 'enterprise_123', 42, 1, 100, 0.3),
(NOW() - INTERVAL '5 minutes', 'eu-west-1', 'enterprise_123', 38, 0, 100, 0.2),
(NOW() - INTERVAL '10 minutes', 'eu-west-1', 'enterprise_123', 45, 2, 100, 0.4),
-- AP-SOUTH-1
(NOW() - INTERVAL '0 minutes', 'ap-south-1', 'consumer_789', 18, 0, 100, 0.1),
(NOW() - INTERVAL '5 minutes', 'ap-south-1', 'consumer_789', 22, 0, 100, 0.2);

-- ============================================================================
-- Redis Stats
-- ============================================================================

INSERT INTO redis_stats (ts, region, tenant, hit_ratio, mem_used_mb, evictions, ops_sec) VALUES
-- US-EAST-1
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'enterprise_123', 0.93, 412.5, 0, 1200),
(NOW() - INTERVAL '5 minutes', 'us-east-1', 'enterprise_123', 0.94, 408.2, 0, 1150),
(NOW() - INTERVAL '10 minutes', 'us-east-1', 'enterprise_123', 0.92, 415.8, 1, 1280),
(NOW() - INTERVAL '15 minutes', 'us-east-1', 'enterprise_123', 0.95, 402.3, 0, 1050),
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'consumer_456', 0.95, 220.8, 0, 580),
(NOW() - INTERVAL '5 minutes', 'us-east-1', 'consumer_456', 0.96, 218.2, 0, 620),
-- EU-WEST-1
(NOW() - INTERVAL '0 minutes', 'eu-west-1', 'enterprise_123', 0.89, 380.2, 2, 950),
(NOW() - INTERVAL '5 minutes', 'eu-west-1', 'enterprise_123', 0.91, 375.8, 1, 920),
(NOW() - INTERVAL '10 minutes', 'eu-west-1', 'enterprise_123', 0.88, 385.4, 3, 980),
-- AP-SOUTH-1
(NOW() - INTERVAL '0 minutes', 'ap-south-1', 'consumer_789', 0.97, 145.2, 0, 380),
(NOW() - INTERVAL '5 minutes', 'ap-south-1', 'consumer_789', 0.96, 148.8, 0, 420);

-- ============================================================================
-- Queue Stats
-- ============================================================================

INSERT INTO queue_stats (ts, system, region, tenant, queue_name, depth, consumer_lag, oldest_age_sec) VALUES
-- US-EAST-1 / Enterprise - Kafka queues
(NOW() - INTERVAL '0 minutes', 'kafka', 'us-east-1', 'enterprise_123', 'orders', 85, 12, 28),
(NOW() - INTERVAL '0 minutes', 'kafka', 'us-east-1', 'enterprise_123', 'events', 142, 8, 15),
(NOW() - INTERVAL '0 minutes', 'kafka', 'us-east-1', 'enterprise_123', 'notifications', 35, 2, 8),
(NOW() - INTERVAL '5 minutes', 'kafka', 'us-east-1', 'enterprise_123', 'orders', 92, 15, 32),
(NOW() - INTERVAL '5 minutes', 'kafka', 'us-east-1', 'enterprise_123', 'events', 158, 12, 22),
-- US-EAST-1 / Consumer - SQS queues
(NOW() - INTERVAL '0 minutes', 'sqs', 'us-east-1', 'consumer_456', 'email', 15, 3, 9),
(NOW() - INTERVAL '0 minutes', 'sqs', 'us-east-1', 'consumer_456', 'analytics', 48, 5, 18),
(NOW() - INTERVAL '5 minutes', 'sqs', 'us-east-1', 'consumer_456', 'email', 12, 2, 7),
-- EU-WEST-1 / Enterprise
(NOW() - INTERVAL '0 minutes', 'kafka', 'eu-west-1', 'enterprise_123', 'orders', 62, 8, 18),
(NOW() - INTERVAL '0 minutes', 'kafka', 'eu-west-1', 'enterprise_123', 'events', 98, 5, 12),
(NOW() - INTERVAL '5 minutes', 'kafka', 'eu-west-1', 'enterprise_123', 'orders', 58, 7, 15),
-- AP-SOUTH-1 / Consumer
(NOW() - INTERVAL '0 minutes', 'sqs', 'ap-south-1', 'consumer_789', 'email', 8, 1, 5),
(NOW() - INTERVAL '0 minutes', 'sqs', 'ap-south-1', 'consumer_789', 'analytics', 22, 3, 12);

-- ============================================================================
-- Search Stats (OpenSearch/Elasticsearch)
-- ============================================================================

INSERT INTO search_stats (ts, region, tenant, cluster_status, red_indices, yellow_indices, query_p95_ms) VALUES
-- US-EAST-1
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'enterprise_123', 'green', 0, 1, 45.2),
(NOW() - INTERVAL '5 minutes', 'us-east-1', 'enterprise_123', 'green', 0, 1, 42.8),
(NOW() - INTERVAL '10 minutes', 'us-east-1', 'enterprise_123', 'yellow', 0, 2, 52.3),
(NOW() - INTERVAL '15 minutes', 'us-east-1', 'enterprise_123', 'green', 0, 0, 38.5),
(NOW() - INTERVAL '0 minutes', 'us-east-1', 'consumer_456', 'green', 0, 0, 28.4),
(NOW() - INTERVAL '5 minutes', 'us-east-1', 'consumer_456', 'green', 0, 0, 32.1),
-- EU-WEST-1
(NOW() - INTERVAL '0 minutes', 'eu-west-1', 'enterprise_123', 'green', 0, 1, 38.7),
(NOW() - INTERVAL '5 minutes', 'eu-west-1', 'enterprise_123', 'yellow', 0, 3, 55.2),
(NOW() - INTERVAL '10 minutes', 'eu-west-1', 'enterprise_123', 'green', 0, 1, 42.3),
-- AP-SOUTH-1
(NOW() - INTERVAL '0 minutes', 'ap-south-1', 'consumer_789', 'green', 0, 0, 35.8),
(NOW() - INTERVAL '5 minutes', 'ap-south-1', 'consumer_789', 'green', 0, 0, 38.2);

-- ============================================================================
-- Summary Stats
-- ============================================================================

SELECT 
  'Seed data loaded successfully!' as message,
  COUNT(DISTINCT region) as regions,
  COUNT(DISTINCT tenant) as tenants,
  (SELECT COUNT(*) FROM pg_query_stats) as pg_metrics,
  (SELECT COUNT(*) FROM redis_stats) as redis_metrics,
  (SELECT COUNT(*) FROM queue_stats) as queue_metrics
FROM pg_query_stats;




