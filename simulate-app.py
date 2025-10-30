#!/usr/bin/env python3
"""
Simulates a 1Password-like backend application that publishes metrics to CloudWatch.
This creates realistic traffic patterns similar to what a password manager would generate.
"""

import time
import random
import sys
import math

try:
    import boto3
    from datetime import datetime
    import requests
    import hashlib
except ImportError as e:
    print(f"[ERROR] {e}")
    print("Install dependencies: pip3 install boto3 requests")
    sys.exit(1)

# CloudWatch client
cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')

# OpenSearch endpoint (from docker-compose)
OPENSEARCH_URL = 'http://localhost:9200'

NAMESPACE = '1PasswordSimulator'
ENDPOINTS = [
    '/api/v1/auth/signin',
    '/api/v1/auth/verify',
    '/api/v1/vaults/list',
    '/api/v1/items/get',
    '/api/v1/items/search',
    '/api/v1/items/create',
    '/api/v1/items/update',
    '/api/v1/items/delete',
    '/api/v1/secrets/share',
    '/api/v1/sync',
    '/api/v1/watchtower/check',
    '/api/v1/activity/recent',
]

def get_time_multiplier():
    """Get traffic multiplier based on time of day (simulates peak hours)."""
    hour = datetime.now().hour
    # Peak hours: 9am-5pm (multiplier 1.5-2.0)
    # Off hours: night (multiplier 0.3-0.5)
    if 9 <= hour <= 17:
        return random.uniform(1.5, 2.0)
    elif 0 <= hour <= 6:
        return random.uniform(0.3, 0.5)
    else:
        return random.uniform(0.8, 1.2)

def simulate_request(endpoint):
    """Simulate a single API request and return metrics."""
    # Simulate latency (highly optimized production system like 1Password)
    base_latency = {
        '/api/v1/auth/signin': 110,       # Auth with crypto (highly optimized)
        '/api/v1/auth/verify': 12,        # Very fast (session check)
        '/api/v1/vaults/list': 28,        # Fast read
        '/api/v1/items/get': 38,          # Fast read (well-cached)
        '/api/v1/items/search': 75,       # Search with excellent indexing
        '/api/v1/items/create': 125,      # Write with encryption (optimized)
        '/api/v1/items/update': 115,      # Write with encryption
        '/api/v1/items/delete': 55,       # Medium write
        '/api/v1/secrets/share': 165,     # Crypto + network (optimized)
        '/api/v1/sync': 135,              # Device sync (efficient)
        '/api/v1/watchtower/check': 220,  # External checks (some variance)
        '/api/v1/activity/recent': 32,    # Fast read
    }
    
    # Very tight variance for an extremely stable system
    latency = base_latency.get(endpoint, 70) + random.randint(-10, 20)
    
    # Occasional spikes that create "yellow" warnings but rarely errors
    spike_roll = random.random()
    if spike_roll < 0.01:  # 1% chance of moderate spike (yellow zone)
        latency *= random.uniform(1.4, 1.8)  # Moderate spike
    elif spike_roll < 0.012:  # 0.2% chance of larger spike (might hit red)
        latency *= random.uniform(2.0, 2.5)  # Larger spike
    
    # Extremely low error rates - production-grade reliability (99.98%+ success)
    error_rates = {
        '/api/v1/auth/signin': 0.0015,     # 0.15% auth failures (mostly invalid creds)
        '/api/v1/auth/verify': 0.0005,     # 0.05% session issues
        '/api/v1/items/search': 0.001,     # 0.1% search timeouts
        '/api/v1/watchtower/check': 0.003, # 0.3% external service issues
        '/api/v1/sync': 0.0012,            # 0.12% sync conflicts
        '/api/v1/items/create': 0.0008,    # 0.08% write failures
        '/api/v1/items/update': 0.0008,    # 0.08% write failures
    }
    
    error_rate = error_rates.get(endpoint, 0.0003)  # Default 0.03% - extremely rare
    is_error = random.random() < error_rate
    
    # Extremely rare timeout errors (almost never in production)
    if is_error and random.random() < 0.05:  # Only 5% of errors are timeouts
        latency = random.randint(2500, 4000)  # Moderate timeout window
    
    return {
        'latency_ms': max(8, int(latency)),
        'is_error': is_error
    }

def publish_metrics(endpoint, latency_ms, is_error):
    """Publish metrics to CloudWatch."""
    try:
        # Simulate database connections (excellent usage: 18-38 out of 100)
        db_connections = random.randint(18, 38) + random.randint(-2, 2)
        
        # Simulate cache hit rate (exceptional caching: 96-99.5%)
        cache_hit_rate = random.uniform(96, 99.5)
        
        cloudwatch.put_metric_data(
            Namespace=NAMESPACE,
            MetricData=[
                {
                    'MetricName': 'RequestCount',
                    'Dimensions': [{'Name': 'Endpoint', 'Value': endpoint}],
                    'Value': 1,
                    'Unit': 'Count',
                    'Timestamp': datetime.utcnow()
                },
                {
                    'MetricName': 'LatencyMs',
                    'Dimensions': [{'Name': 'Endpoint', 'Value': endpoint}],
                    'Value': latency_ms,
                    'Unit': 'Milliseconds',
                    'Timestamp': datetime.utcnow()
                },
                {
                    'MetricName': 'Error',
                    'Dimensions': [{'Name': 'Endpoint', 'Value': endpoint}],
                    'Value': 1 if is_error else 0,
                    'Unit': 'Count',
                    'Timestamp': datetime.utcnow()
                },
                {
                    'MetricName': 'DatabaseConnections',
                    'Dimensions': [{'Name': 'Resource', 'Value': 'primary-db'}],
                    'Value': db_connections,
                    'Unit': 'Count',
                    'Timestamp': datetime.utcnow()
                },
                {
                    'MetricName': 'CacheHitRate',
                    'Dimensions': [{'Name': 'Resource', 'Value': 'redis'}],
                    'Value': cache_hit_rate,
                    'Unit': 'Percent',
                    'Timestamp': datetime.utcnow()
                }
            ]
        )
        status = '[ERROR]' if is_error else '[OK]'
        print(f"{status} {endpoint}: {latency_ms}ms | DB: {db_connections} | Cache: {cache_hit_rate:.1f}%")
    except Exception as e:
        print(f"[ERROR] Failed to publish metrics: {e}")

def publish_user_operation_metrics():
    """Publish user-facing operation metrics to CloudWatch."""
    try:
        # Simulate vault unlock duration (crypto operations: 200-450ms)
        vault_unlock = random.uniform(250, 380) + random.randint(-20, 30)
        if random.random() < 0.02:  # 2% chance of slower unlock
            vault_unlock *= random.uniform(1.3, 1.7)
        
        # Simulate item retrieval (fast: 15-60ms)
        item_retrieval = random.uniform(20, 50) + random.randint(-5, 15)
        if random.random() < 0.01:  # 1% chance of cache miss
            item_retrieval *= random.uniform(2.0, 3.5)
        
        # Simulate sync duration (network + crypto: 100-300ms)
        sync_duration = random.uniform(120, 250) + random.randint(-15, 40)
        if random.random() < 0.03:  # 3% chance of slower sync
            sync_duration *= random.uniform(1.4, 2.0)
        
        # Simulate auth duration (includes crypto: 80-200ms)
        auth_duration = random.uniform(95, 170) + random.randint(-10, 25)
        if random.random() < 0.015:  # 1.5% chance of slower auth
            auth_duration *= random.uniform(1.5, 2.2)
        
        # Simulate database query duration (well-optimized: 2-25ms)
        db_query_duration = random.uniform(3, 18) + random.randint(-1, 8)
        if random.random() < 0.02:  # 2% chance of slow query
            db_query_duration *= random.uniform(3.0, 6.0)
        
        cloudwatch.put_metric_data(
            Namespace=NAMESPACE,
            MetricData=[
                {
                    'MetricName': 'VaultUnlockDuration',
                    'Dimensions': [{'Name': 'Operation', 'Value': 'vault_unlock'}],
                    'Value': max(150, vault_unlock),
                    'Unit': 'Milliseconds',
                    'Timestamp': datetime.utcnow()
                },
                {
                    'MetricName': 'ItemRetrievalDuration',
                    'Dimensions': [{'Name': 'Operation', 'Value': 'item_retrieval'}],
                    'Value': max(10, item_retrieval),
                    'Unit': 'Milliseconds',
                    'Timestamp': datetime.utcnow()
                },
                {
                    'MetricName': 'SyncDuration',
                    'Dimensions': [{'Name': 'Operation', 'Value': 'sync'}],
                    'Value': max(80, sync_duration),
                    'Unit': 'Milliseconds',
                    'Timestamp': datetime.utcnow()
                },
                {
                    'MetricName': 'AuthDuration',
                    'Dimensions': [{'Name': 'Operation', 'Value': 'authentication'}],
                    'Value': max(60, auth_duration),
                    'Unit': 'Milliseconds',
                    'Timestamp': datetime.utcnow()
                },
                {
                    'MetricName': 'DatabaseQueryDuration',
                    'Dimensions': [{'Name': 'Operation', 'Value': 'db_query'}],
                    'Value': max(1, db_query_duration),
                    'Unit': 'Milliseconds',
                    'Timestamp': datetime.utcnow()
                }
            ]
        )
    except Exception as e:
        print(f"[ERROR] Failed to publish operation metrics: {e}")

def write_logs_to_opensearch(endpoint, latency_ms, is_error, trace_id):
    """Write structured logs to OpenSearch for trace correlation"""
    try:
        # Determine log level and messages based on request
        if is_error:
            level = 'ERROR'
            messages = [
                f"Request failed for {endpoint}",
                f"Error processing request: timeout after {latency_ms}ms",
                f"Retry attempt failed for {endpoint}"
            ]
        else:
            level = 'INFO' if latency_ms < 200 else 'WARN'
            if 'auth' in endpoint:
                messages = [
                    f"Authentication request received for {endpoint}",
                    f"User credentials validated successfully",
                    f"Session token generated"
                ]
            elif 'vault' in endpoint or 'items' in endpoint:
                messages = [
                    f"Vault operation started: {endpoint}",
                    f"Database query completed in {latency_ms}ms",
                    f"Vault operation completed successfully"
                ]
            elif 'search' in endpoint:
                messages = [
                    f"Search query received: {endpoint}",
                    f"OpenSearch query executed",
                    f"Results returned: {random.randint(1, 50)} items"
                ]
            else:
                messages = [
                    f"Request received: {endpoint}",
                    f"Processing request",
                    f"Request completed in {latency_ms}ms"
                ]
        
        # Write 2-3 logs per request
        timestamp = datetime.utcnow()
        for i, message in enumerate(random.sample(messages, min(len(messages), random.randint(2, 3)))):
            log_entry = {
                'timestamp': timestamp.isoformat() + 'Z',
                'level': level,
                'service': 'api-gateway',
                'endpoint': endpoint,
                'trace_id': trace_id,
                'message': message,
                'latency_ms': latency_ms,
                'request_id': f"{trace_id}-{i}"
            }
            
            # Index to OpenSearch
            index_name = f"logs-{timestamp.strftime('%Y.%m.%d')}"
            try:
                requests.post(
                    f"{OPENSEARCH_URL}/{index_name}/_doc",
                    json=log_entry,
                    headers={'Content-Type': 'application/json'},
                    timeout=1
                )
            except:
                pass  # Silently fail if OpenSearch is down
                
    except Exception:
        pass  # Don't let logging failures break the simulator

def main():
    print("=" * 70)
    print("1Password-like Application Simulator")
    print("=" * 70)
    print(f"CloudWatch Namespace: {NAMESPACE}")
    print(f"Region: us-east-1")
    print(f"Simulating 15-40 req/s across {len(ENDPOINTS)} endpoints")
    print(f"Metrics: RequestCount, LatencyMs, Error")
    print(f"Peak hours: 9am-5pm (higher traffic)")
    print(f"Off hours: 12am-6am (lower traffic)")
    print("=" * 70)
    print()
    print("To view metrics in your dashboard:")
    print("   1. Go to http://localhost:5173/")
    print("   2. Configure CloudWatch with:")
    print(f"      - Namespace: {NAMESPACE}")
    print("   3. View traces and metrics")
    print()
    print("Press Ctrl+C to stop")
    print("-" * 70)
    print()
    
    request_count = 0
    error_count = 0
    operation_metrics_counter = 0
    
    try:
        while True:
            # Get time-based traffic multiplier
            multiplier = get_time_multiplier()
            
            # Burst pattern: occasionally send multiple requests at once
            burst_size = 1
            if random.random() < 0.1:  # 10% chance of burst
                burst_size = random.randint(2, 5)
            
            for _ in range(burst_size):
                # Randomly select an endpoint (weighted by typical usage)
                # Read-heavy workload with frequent session checks
                weights = [
                    8,   # auth/signin
                    50,  # auth/verify (very frequent)
                    25,  # vaults/list
                    35,  # items/get
                    15,  # items/search
                    5,   # items/create
                    4,   # items/update
                    2,   # items/delete
                    3,   # secrets/share
                    20,  # sync
                    5,   # watchtower/check
                    10,  # activity/recent
                ]
                endpoint = random.choices(ENDPOINTS, weights=weights)[0]
                
                # Simulate request
                metrics = simulate_request(endpoint)
                
                # Generate trace ID (same format as backend)
                trace_id = hashlib.md5(f"{endpoint}{metrics['latency_ms']}{time.time()}".encode()).hexdigest()
                
                # Publish to CloudWatch
                publish_metrics(endpoint, metrics['latency_ms'], metrics['is_error'])
                
                # Write logs to OpenSearch
                write_logs_to_opensearch(endpoint, metrics['latency_ms'], metrics['is_error'], trace_id)
                
                request_count += 1
                if metrics['is_error']:
                    error_count += 1
            
            # Publish user operation metrics every 15-25 requests
            operation_metrics_counter += burst_size
            if operation_metrics_counter >= random.randint(15, 25):
                publish_user_operation_metrics()
                operation_metrics_counter = 0
            
            if request_count % 100 == 0:
                error_rate = (error_count / request_count) * 100
                print()
                print(f"[STATS] Total: {request_count} requests | Errors: {error_count} ({error_rate:.2f}%)")
                print(f"[STATS] Traffic multiplier: {multiplier:.2f}x")
                print()
            
            # Dynamic sleep based on time of day
            base_sleep = 0.05  # ~20 req/s base
            sleep_time = base_sleep / multiplier
            time.sleep(sleep_time)
            
    except KeyboardInterrupt:
        print()
        print()
        print("=" * 70)
        print("Simulator stopped")
        print(f"Total requests: {request_count}")
        print(f"Total errors: {error_count} ({(error_count/request_count)*100:.2f}%)")
        print("=" * 70)

if __name__ == '__main__':
    main()

