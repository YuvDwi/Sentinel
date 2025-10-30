use anyhow::Result;
use aws_config::BehaviorVersion;
use aws_sdk_cloudwatch::{
    types::{Dimension, Metric, MetricDataQuery, MetricStat},
    Client as Cw,
};
use std::time::{Duration, SystemTime};

pub async fn cw_get_p95_latency(namespace: &str, endpoint: &str, minutes: i64) -> Result<f64> {
    let cfg = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let cw = Cw::new(&cfg);
    let now = SystemTime::now();
    let start = now - Duration::from_secs((minutes * 60) as u64);

    let dimension = Dimension::builder()
        .name("Endpoint")
        .value(endpoint)
        .build();

    let metric = Metric::builder()
        .namespace(namespace)
        .metric_name("LatencyMs")
        .dimensions(dimension)
        .build();

    let metric_stat = MetricStat::builder()
        .metric(metric)
        .stat("p95")
        .period(60)
        .build();

    let q = MetricDataQuery::builder()
        .id("p95")
        .metric_stat(metric_stat)
        .return_data(true)
        .build();

    let resp = cw
        .get_metric_data()
        .start_time(start.into())
        .end_time(now.into())
        .metric_data_queries(q)
        .send()
        .await?;

    let v = resp
        .metric_data_results()
        .first()
        .and_then(|r| r.values().last())
        .copied()
        .unwrap_or(0.0);
    Ok(v)
}

pub async fn cw_get_sum(namespace: &str, metric_name: &str, endpoint: &str, minutes: i64) -> Result<f64> {
    let cfg = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let cw = Cw::new(&cfg);
    let now = SystemTime::now();
    let start = now - Duration::from_secs((minutes * 60) as u64);

    let dimension = Dimension::builder()
        .name("Endpoint")
        .value(endpoint)
        .build();

    let metric = Metric::builder()
        .namespace(namespace)
        .metric_name(metric_name)
        .dimensions(dimension)
        .build();

    let metric_stat = MetricStat::builder()
        .metric(metric)
        .stat("Sum")
        .period(60)
        .build();

    let q = MetricDataQuery::builder()
        .id("sum")
        .metric_stat(metric_stat)
        .return_data(true)
        .build();

    let resp = cw
        .get_metric_data()
        .start_time(start.into())
        .end_time(now.into())
        .metric_data_queries(q)
        .send()
        .await?;

    let v = resp
        .metric_data_results()
        .first()
        .and_then(|r| r.values().iter().sum::<f64>().into())
        .unwrap_or(0.0);
    Ok(v)
}

pub async fn cw_get_metric_timeseries(
    namespace: &str,
    metric_name: &str,
    endpoint: &str,
    stat: &str,
    minutes: i64,
) -> Result<Vec<(i64, f64)>> {
    let cfg = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let cw = Cw::new(&cfg);
    let now = SystemTime::now();
    let start = now - Duration::from_secs((minutes * 60) as u64);

    // Use different dimensions based on metric type:
    // - "Resource" for infrastructure metrics (DB, Cache)
    // - "Operation" for user-facing operations (vault unlock, sync, etc.)
    // - "Endpoint" for API metrics
    let dimension_name = if metric_name == "DatabaseConnections" || metric_name == "CacheHitRate" {
        "Resource"
    } else if metric_name == "VaultUnlockDuration" 
        || metric_name == "ItemRetrievalDuration"
        || metric_name == "SyncDuration"
        || metric_name == "AuthDuration"
        || metric_name == "DatabaseQueryDuration" {
        "Operation"
    } else {
        "Endpoint"
    };

    let dimension = Dimension::builder()
        .name(dimension_name)
        .value(endpoint)
        .build();

    let metric = Metric::builder()
        .namespace(namespace)
        .metric_name(metric_name)
        .dimensions(dimension)
        .build();

    let metric_stat = MetricStat::builder()
        .metric(metric)
        .stat(stat)
        .period(60)
        .build();

    let q = MetricDataQuery::builder()
        .id("ts")
        .metric_stat(metric_stat)
        .return_data(true)
        .build();

    let resp = cw
        .get_metric_data()
        .start_time(start.into())
        .end_time(now.into())
        .metric_data_queries(q)
        .send()
        .await?;

    let result = resp.metric_data_results().first();
    if let Some(r) = result {
        let timestamps = r.timestamps();
        let values = r.values();
        let mut data: Vec<(i64, f64)> = timestamps
            .iter()
            .zip(values.iter())
            .map(|(ts, val)| {
                let millis = ts.secs() * 1000;
                (millis, *val)
            })
            .collect();
        data.sort_by_key(|k| k.0);
        Ok(data)
    } else {
        Ok(vec![])
    }
}

pub async fn cw_list_endpoints(namespace: &str) -> Result<Vec<String>> {
    let cfg = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let cw = Cw::new(&cfg);

    let resp = cw
        .list_metrics()
        .namespace(namespace)
        .metric_name("RequestCount")
        .send()
        .await?;

    let mut endpoints = std::collections::HashSet::new();
    for metric in resp.metrics() {
        for dim in metric.dimensions() {
            if dim.name() == Some("Endpoint") {
                if let Some(val) = dim.value() {
                    endpoints.insert(val.to_string());
                }
            }
        }
    }

    Ok(endpoints.into_iter().collect())
}
