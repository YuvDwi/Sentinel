# Observability Platform

I built this monitoring dashboard to provide real-time visibility into backend systems. It's similar to tools like Datadog and New Relic but designed to be more straightforward to understand and deploy. The goal is to make it easier to diagnose performance issues and system failures without having to dig through scattered log files across multiple services.

## What It Does

The main problem this solves is understanding what's happening in distributed systems. When you have multiple microservices communicating with each other, it's difficult to pinpoint where issues originate. You might see that your API is slow but not know whether it's the database, cache, or an external service call causing the bottleneck. This platform provides visibility into the entire request flow instead of requiring guesswork.

The platform is built around three core components. First is distributed tracing, which follows individual requests through your entire system and shows exactly what happened at each step. You can identify slow operations and pinpoint where failures occur. Second is metrics collection, which tracks performance data over time including request rates, error rates, and latency. Third is log aggregation, which centralizes logs from all services into a single searchable interface.

The key advantage is that everything is integrated. When you see an error rate spike, you can immediately drill down into the specific traces that failed and view the associated logs. There's no need to switch between multiple tools to piece together what happened.

## Architecture

The backend is written in Rust using the Axum web framework. Rust provides excellent performance and memory safety guarantees, making it well-suited for handling high-throughput telemetry data. The backend exposes a REST API that handles authentication, metric storage, and data queries.

For secret management, the platform integrates with 1Password's service account system. Database passwords and API keys are retrieved from 1Password at runtime rather than being stored in environment variables or configuration files. The system gracefully falls back to environment variables if 1Password isn't configured, so it's not a hard dependency.

The frontend is built with React, TypeScript, and Vite. State management uses hooks and context, which provides sufficient functionality without the complexity of Redux. The UI leverages Tailwind CSS and shadcn/ui components for consistent styling. Charts and visualizations are powered by ECharts, which handles large datasets efficiently and provides a comprehensive API.

The platform supports multiple storage backends depending on your needs:

- PostgreSQL for user accounts and configuration
- Redis for caching and session storage
- MySQL for query performance analytics
- OpenSearch for log storage and full-text search

Each component can be enabled or disabled independently. If you don't need OpenSearch, for example, you can disable it and the platform continues to function normally.

The deployment architecture uses AWS services. The frontend is hosted on S3 and distributed through CloudFront, providing global CDN coverage and automatic HTTPS. The backend runs on EC2 instances but could be containerized for deployment on ECS or Kubernetes. CloudWatch handles metrics storage, which integrates naturally with AWS and provides managed long-term retention.

## Key Features

The distributed tracing system captures every request and breaks it down into spans representing individual operations like database queries or API calls. The waterfall view shows exactly where time is spent and which operations are slow. You can filter and search through traces to isolate specific issues.

The metrics dashboard provides real-time visibility into system health. It tracks request rates, error rates, latency percentiles, database connections, cache hit rates, and other performance indicators. Percentile calculations are automatic, showing the full distribution rather than just averages. This is important because averages can mask problems affecting only a subset of users.

The AI assistant analyzes metrics and provides recommendations based on observed patterns. It can detect anomalies and suggest potential causes. You can ask questions in natural language and it will attempt to help diagnose issues. While not perfect, it's particularly useful during late-night debugging sessions.

The query explorer allows you to build custom queries and visualizations. You can aggregate data across dimensions, apply filters, and create dashboards for specific metrics. The query language is intuitive and becomes straightforward with practice.

## Security

Authentication uses JWTs with role-based access control. Users can sign up and log in through the web interface. Sessions are managed with httpOnly cookies to prevent JavaScript access. The backend validates every request and enforces permissions based on user roles.

All communication happens over HTTPS. CloudFront automatically redirects HTTP requests to HTTPS, and the backend enforces security headers to prevent common web vulnerabilities.

Secrets are retrieved from 1Password at runtime rather than being stored in code or configuration files. The backend authenticates to 1Password using a service account token and retrieves credentials as needed. This approach is more secure than storing passwords in environment variables or committing them to version control.

## Deployment

A bash script automates the deployment process. The script can deploy the frontend, backend, and simulator independently or together. It includes health checks to verify services start correctly after deployment.

The frontend build uses Vite with optimizations including code splitting and tree shaking. The build artifacts are uploaded to S3 and the CloudFront cache is invalidated to ensure users receive the latest version immediately.

The backend compiles to a native binary with full Rust optimizations enabled. It's uploaded to EC2 via SSH and runs as a systemd service, providing automatic restarts on failure and standard service management capabilities.

A Python simulator script generates synthetic traffic and publishes it to CloudWatch. It simulates realistic patterns with higher traffic during business hours and lower traffic during off-hours. This is useful for testing and demonstrations when a production system isn't available.

## Database Schema

The PostgreSQL schema includes tables for users, authentication tokens, and configuration. The design is straightforward with indexes on frequently queried columns. Migrations are SQL files that can be applied sequentially.

Metrics use CloudWatch's native format rather than a custom storage system. Metrics are organized by namespace and dimensions, making queries straightforward. The platform supports custom metrics for application-specific tracking needs.

Traces are stored hierarchically with each trace containing multiple spans. Spans include timing information, tags, and logs. The structure supports both synchronous and asynchronous operations and can represent complex request flows with multiple branches.

## Performance

The Rust backend can handle thousands of requests per second on modest hardware. The stateless architecture allows horizontal scaling by adding more instances as needed.

Caching is used extensively to reduce database load. Frequently accessed data is cached in Redis with appropriate TTLs. An in-memory cache handles data that changes infrequently.

The frontend uses code splitting and lazy loading to avoid loading unnecessary code upfront. Large datasets are paginated or virtualized to maintain browser performance. Charts use canvas rendering, which performs better than SVG with large numbers of data points.

## Self-Monitoring

The platform monitors itself using the same instrumentation it provides to users. Request rates, errors, and latency are tracked for all endpoints. Database query performance is monitored and slow queries are logged for analysis. A health check endpoint verifies that all dependencies are available.

Logs are structured and include correlation IDs for tracing requests across service boundaries. Log levels can be configured independently for different components.

## Development

The codebase maintains clean separation of concerns with comprehensive error handling. Rust's type system catches many bugs at compile time. TypeScript provides similar benefits on the frontend.

Local development uses Docker Compose to start PostgreSQL, Redis, and OpenSearch. This allows running the complete stack locally without AWS credentials.

## Future Enhancements

The architecture is designed to be extensible. Potential additions include support for additional data sources, improved anomaly detection, custom alerting rules, and integrations with incident management tools like PagerDuty.

The AI assistant could be enhanced to learn from system-specific patterns over time and provide more targeted recommendations. The query language could be expanded to support more complex analysis and transformations.

## Getting Started

Deployment requires AWS credentials with permissions for S3, CloudFront, EC2, and CloudWatch. A 1Password service account is optional for secret management. The deployment script automates most of the process but requires configuration of:

- S3 bucket name
- CloudFront distribution ID
- EC2 host and SSH key path
- CloudFront domain

For local development, run the backend with cargo and the frontend with npm. Docker Compose starts all required services. Environment variables control feature flags and service connections.

The platform is production-ready and can handle real traffic. The codebase is well-organized and maintainable, making it straightforward to extend or modify as needed.

