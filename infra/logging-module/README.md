# Logging Infrastructure Guide

Complete infrastructure setup and operational guide for Complytude's structured logging system.

## Overview

Complytude uses **nestjs-pino** for structured logging with JSON (NDJSON) output. This guide covers production deployment, log aggregation, monitoring, and troubleshooting.

## Table of Contents

- [Architecture](#architecture)
- [Log Flow](#log-flow)
- [Production Setup](#production-setup)
- [Log Aggregation](#log-aggregation)
- [Monitoring & Alerting](#monitoring--alerting)
- [Performance Tuning](#performance-tuning)
- [Troubleshooting](#troubleshooting)
- [Cost Optimization](#cost-optimization)

---

## Architecture

### Multi-Service Logging Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Complytude Services                         │
│  ┌──────────────┬──────────────┬──────────────────────────────┐ │
│  │ API Gateway  │  Worker AI   │  Worker Ingestion            │ │
│  │ (3000)       │  (3001)      │  (3002)                      │ │
│  └──────┬───────┴──────┬───────┴──────────┬───────────────────┘ │
│         │              │                  │                     │
│    Pino Logger    Pino Logger        Pino Logger               │
│         │              │                  │                     │
│      stdout          stdout             stdout                 │
└─────────┴──────────────┴──────────────────┴─────────────────────┘
          │              │                  │
          └──────────────┴──────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
    Docker Logs                  Kubernetes Logs
          │                             │
    docker logs                   kubectl logs
          │                             │
          └──────────────┬──────────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
    Datadog Agent              FluentD/Filebeat
          │                             │
          └──────────────┬──────────────┘
                         │
          ┌──────────────┴──────────────────┐
          │                                  │
    Datadog Logs                      ELK Stack
    (Recommended)                   (Alternative)
          │                                  │
    ┌─────┴─────────────────────────────────┴─────┐
    │         Alerts & Dashboards                  │
    │  • Error rate monitoring                     │
    │  • Slow request detection                    │
    │  • Resource usage tracking                   │
    │  • Tenant activity monitoring                │
    └──────────────────────────────────────────────┘
```

---

## Log Flow

### Request Lifecycle with Logging

```
1. Client Request
   ↓
   x-request-id: abc-123 (or generated)
   ↓
2. API Gateway Receives Request
   ↓
   [INFO] Request received
   {
     "trace_id": "abc-123",
     "service_name": "gateway",
     "tenant_id": "tenant-uuid",
     "req": { "method": "POST", "url": "/api/documents" }
   }
   ↓
3. Service Processing
   ↓
   [DEBUG] Processing document
   {
     "trace_id": "abc-123",
     "service_name": "gateway",
     "document_id": "doc-uuid"
   }
   ↓
4. Worker Called (if needed)
   ↓
   [INFO] Job dispatched to worker
   {
     "trace_id": "abc-123",
     "service_name": "gateway",
     "job_id": "job-uuid",
     "worker": "worker-ai"
   }
   ↓
5. Worker Processes
   ↓
   [INFO] Job received
   {
     "trace_id": "abc-123",
     "service_name": "worker-ai",
     "job_id": "job-uuid"
   }
   ↓
6. Response Sent
   ↓
   [INFO] Request completed
   {
     "trace_id": "abc-123",
     "service_name": "gateway",
     "res": { "statusCode": 201, "responseTime": 145 }
   }
```

---

## Production Setup

### Docker Compose Configuration

#### Development (Pretty Print)

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  api:
    environment:
      NODE_ENV: development
      SERVICE_NAME: gateway
      LOG_LEVEL: debug
      LOG_PRETTY: "true"
      LOG_AUTO_LOGGING: "true"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

#### Production (NDJSON)

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  api:
    environment:
      NODE_ENV: production
      SERVICE_NAME: gateway
      LOG_LEVEL: info
      LOG_PRETTY: "false"
      LOG_AUTO_LOGGING: "true"
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
        labels: "service,environment"
        
  worker-ai:
    environment:
      NODE_ENV: production
      SERVICE_NAME: worker-ai
      LOG_LEVEL: info
      LOG_PRETTY: "false"
      LOG_AUTO_LOGGING: "true"
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
        
  worker-ingestion:
    environment:
      NODE_ENV: production
      SERVICE_NAME: worker-ingestion
      LOG_LEVEL: info
      LOG_PRETTY: "false"
      LOG_AUTO_LOGGING: "true"
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
```

### Kubernetes Configuration

```yaml
# k8s/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: complytude-api
  labels:
    app: complytude-api
    service: gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: complytude-api
  template:
    metadata:
      labels:
        app: complytude-api
        service: gateway
    spec:
      containers:
      - name: api
        image: complytude/api:latest
        env:
        - name: NODE_ENV
          value: "production"
        - name: SERVICE_NAME
          value: "gateway"
        - name: LOG_LEVEL
          value: "info"
        - name: LOG_PRETTY
          value: "false"
        - name: LOG_AUTO_LOGGING
          value: "true"
        resources:
          limits:
            memory: "1Gi"
            cpu: "1000m"
          requests:
            memory: "512Mi"
            cpu: "500m"
```

---

## Log Aggregation

### Option 1: Datadog (Recommended)

**Why Datadog:**
- Best-in-class log aggregation and APM
- Native JSON parsing
- Powerful query language
- Built-in alerting and dashboards
- Excellent trace correlation

#### Setup

1. **Install Datadog Agent**

```yaml
# docker-compose.prod.yml
services:
  datadog-agent:
    image: gcr.io/datadoghq/agent:latest
    environment:
      - DD_API_KEY=${DATADOG_API_KEY}
      - DD_SITE=datadoghq.com
      - DD_LOGS_ENABLED=true
      - DD_LOGS_CONFIG_CONTAINER_COLLECT_ALL=true
      - DD_CONTAINER_EXCLUDE="name:datadog-agent"
      - DD_ENV=production
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /proc/:/host/proc/:ro
      - /sys/fs/cgroup/:/host/sys/fs/cgroup:ro
```

2. **Tag Logs for Filtering**

Datadog automatically parses JSON logs and extracts fields:

```json
{
  "service": "gateway",
  "trace_id": "abc-123",
  "tenant_id": "tenant-uuid",
  "level": "info"
}
```

3. **Create Dashboards**

```
# Datadog Query Examples

# All Gateway Logs
service:gateway

# Error Logs Across All Services
level:error

# Specific Tenant Activity
tenant_id:abc-123-tenant-uuid

# Slow Requests (>1s)
service:gateway @res.responseTime:>1000

# Trace All Related Logs
trace_id:abc-123-def-456
```

### Option 2: ELK Stack (Elasticsearch, Logstash, Kibana)

#### Setup with Filebeat

```yaml
# docker-compose.elk.yml
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    depends_on:
      - elasticsearch

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch

  filebeat:
    image: docker.elastic.co/beats/filebeat:8.11.0
    user: root
    volumes:
      - ./filebeat.yml:/usr/share/filebeat/filebeat.yml:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    depends_on:
      - logstash
```

**filebeat.yml:**

```yaml
filebeat.inputs:
- type: container
  paths:
    - '/var/lib/docker/containers/*/*.log'
  json.keys_under_root: true
  json.add_error_key: true

processors:
- add_docker_metadata:
    host: "unix:///var/run/docker.sock"
- decode_json_fields:
    fields: ["message"]
    target: ""
    overwrite_keys: true

output.logstash:
  hosts: ["logstash:5044"]
```

### Option 3: AWS CloudWatch

```typescript
// Install cloudwatch transport
// pnpm install pino-cloudwatch

// cloudwatch-logger.config.ts
import pinoCW from 'pino-cloudwatch';

const streamConfig = {
  logGroupName: '/complytude/production',
  logStreamName: `gateway-${process.env.HOSTNAME}`,
  awsRegion: 'us-east-1',
};

export const cloudwatchLogger = pinoCW(streamConfig);
```

---

## Monitoring & Alerting

### Key Metrics to Monitor

#### Error Rate

```
# Datadog Alert
service:gateway level:error
Alert when: count > 10 over last 5 minutes
```

#### Slow Requests

```
# Datadog Alert
service:gateway @res.responseTime:>2000
Alert when: count > 20 over last 5 minutes
```

#### High Log Volume (Potential Attack/Bug)

```
# Datadog Alert
service:gateway
Alert when: log volume > 10000 per minute
```

#### Missing Tenant Context (Potential Auth Issue)

```
# Datadog Alert
service:gateway -tenant_id:*
Alert when: count > 100 over last 10 minutes
```

### Sample Dashboard Queries

#### Request Rate by Service

```
# Datadog Query
service:* @req.method:* | group by service | count
```

#### Top 10 Slowest Endpoints

```
# Datadog Query
service:gateway @res.responseTime:* 
| group by @req.url 
| p95(@res.responseTime)
| top 10
```

#### Error Rate by Tenant

```
# Datadog Query
level:error tenant_id:*
| group by tenant_id
| count
```

#### Trace Analysis

```
# Datadog Query
trace_id:abc-123-def-456
| timeline
```

---

## Performance Tuning

### Log Level Management

**Production Recommendations:**

| Service | Environment | LOG_LEVEL | Rationale |
|---------|-------------|-----------|-----------|
| API Gateway | Production | `info` | Balance between visibility and volume |
| Worker AI | Production | `info` | Capture job processing without spam |
| Worker Ingestion | Production | `info` | Track ingestion without excessive logs |
| **All Services** | **Staging** | `debug` | Full visibility for testing |
| **All Services** | **Development** | `debug` | Maximum local debugging |

### Asynchronous Logging

Ensure asynchronous logging in production for performance:

```typescript
// pino.config.ts (already configured)
{
  sync: prettyPrint, // false in production
  minLength: 4096, // Buffer size
}
```

### Log Rotation

**Docker:**

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "50m"  # Rotate after 50MB
    max-file: "5"    # Keep 5 files (250MB total)
```

**Kubernetes:**

```yaml
# Logrotate config
/var/log/containers/*.log {
  rotate 7
  daily
  maxsize 100M
  missingok
  notifempty
  compress
  delaycompress
}
```

### Sampling (High-Traffic Optimization)

For very high-traffic endpoints, implement log sampling:

```typescript
// In pino.config.ts
autoLogging: {
  ignore: (req: any) => {
    // Sample health checks (1 in 100)
    if (req.url === '/health') {
      return Math.random() > 0.01;
    }
    return false;
  },
}
```

---

## Troubleshooting

### Problem: Logs Not Appearing in Aggregator

**Symptoms:**
- Logs visible in `docker logs` or `kubectl logs`
- Not appearing in Datadog/ELK

**Solutions:**

1. **Check Agent Status**
   ```bash
   # Datadog
   docker exec datadog-agent agent status
   
   # Filebeat
   docker exec filebeat filebeat test output
   ```

2. **Verify Log Format**
   Ensure logs are valid NDJSON:
   ```bash
   docker logs api 2>&1 | jq .
   ```

3. **Check Network Connectivity**
   ```bash
   # Datadog
   docker exec datadog-agent curl -v https://http-intake.logs.datadoghq.com
   
   # ELK
   docker exec filebeat nc -zv logstash 5044
   ```

### Problem: High Log Volume Costs

**Symptoms:**
- Datadog/CloudWatch bill is high
- Storage filling up quickly

**Solutions:**

1. **Increase LOG_LEVEL to `warn` or `error` in production**
   ```bash
   LOG_LEVEL=warn
   ```

2. **Implement Sampling** (see Performance Tuning section)

3. **Exclude Verbose Endpoints**
   ```typescript
   autoLogging: {
     ignore: (req: any) => {
       const noisyEndpoints = ['/health', '/metrics', '/websocket'];
       return noisyEndpoints.some(ep => req.url.includes(ep));
     },
   }
   ```

4. **Set Log Retention Policy**
   - Datadog: 7 days for info, 30 days for error
   - ELK: Index lifecycle management (ILM)
   - CloudWatch: 7-day retention

### Problem: Trace ID Not Correlating

**Symptoms:**
- Same request shows different `trace_id` across services

**Solutions:**

1. **Ensure Header Forwarding**
   ```typescript
   // In HTTP client calls to workers
   const response = await axios.post(workerUrl, data, {
     headers: {
       'x-request-id': req.id, // Forward trace ID
     },
   });
   ```

2. **Verify genReqId Implementation**
   ```typescript
   genReqId: (req: any) => {
     return req.headers['x-request-id'] || uuidv4();
   },
   ```

### Problem: Tenant Context Missing

**Symptoms:**
- `tenant_id` not appearing in logs
- Empty `tenant_id` field

**Solutions:**

1. **Check Authentication**
   Ensure JWT guard is setting `request.auth.tenant`:
   ```typescript
   // In JWT strategy
   request.auth = {
     tenant: {
       tenantId: payload.tenantId,
       userId: payload.userId,
     },
   };
   ```

2. **Verify Custom Extractor**
   ```typescript
   // In pino.config.ts
   customProps: (req: any, res: any) => {
     console.log('Auth object:', req.auth); // Debug
     // ...
   },
   ```

---

## Cost Optimization

### Log Volume Estimation

**API Gateway (1000 req/min):**
- Average log size: 500 bytes
- Logs per request: 2 (request + response)
- Daily volume: 1000 × 60 × 24 × 2 × 500 = **1.44 GB/day**

**Workers (500 jobs/min):**
- Average log size: 300 bytes
- Logs per job: 3 (receive + process + complete)
- Daily volume: 500 × 60 × 24 × 3 × 300 = **648 MB/day**

**Total: ~2.1 GB/day = ~63 GB/month**

### Cost Comparison (63 GB/month)

| Provider | Ingestion | Storage (30 days) | Total |
|----------|-----------|-------------------|-------|
| **Datadog** | $0.10/GB × 63 = $6.30 | $0.05/GB × 63 = $3.15 | **$9.45/month** |
| **AWS CloudWatch** | $0.50/GB × 63 = $31.50 | $0.03/GB × 63 = $1.89 | **$33.39/month** |
| **Self-Hosted ELK** | $0 (compute only) | Storage costs | **~$20-50/month** |

**Recommendation**: Datadog for ease of use and cost-effectiveness at this scale.

### Reduction Strategies

1. **Smart Filtering** - Exclude health checks and metrics endpoints
2. **Increase Log Level** - Use `info` instead of `debug` in production
3. **Sampling** - Sample high-frequency, low-value logs (health checks)
4. **Shorter Retention** - 7 days for info logs, 30 days for errors
5. **Compress Old Logs** - Use log rotation with compression

---

## Related Documentation

- [Logger Module README](../../libs/shared/src/logger/README.md) - Developer guide
- [Architecture Documentation](../../docs/ARCHITECTURE.md) - System architecture
- [Deployment Guide](../../docs/DEPLOYMENT.md) - Production deployment

---

**Last Updated**: February 8, 2026
**Infrastructure Version**: 1.0.0
**Target Scale**: 1000-5000 req/min
