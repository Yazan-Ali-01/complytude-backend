terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      # Route 53 health-check metrics exist only in us-east-1, so the uptime alarm (and the topic
      # it notifies) live there
      configuration_aliases = [aws.us_east_1]
    }
  }
}

locals {
  name      = "${var.project_name}-${var.environment}"
  namespace = "Complytude/${var.environment}"
  actions   = [aws_sns_topic.alarms.arn]
}

# ---- Notifications ----
# Every subscriber must confirm the email AWS sends after apply; an unconfirmed address receives
# nothing. Use a shared on-call address or list, not one person's inbox.
resource "aws_sns_topic" "alarms" {
  name = "${local.name}-alarms"

  tags = {
    Name = "${local.name}-alarms"
  }
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alarm_emails)
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = each.value
}

# ---- ECS services ----
# No running task: ECS reports no metrics at all then, so missing data breaches
resource "aws_cloudwatch_metric_alarm" "ecs_running_count" {
  for_each = toset(var.ecs_service_names)

  alarm_name          = "${each.key}-no-running-tasks"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_description   = "${each.key} has 0 running tasks - service is DOWN"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = each.key
  }
}

# Percent of the reserved CPU / memory (AWS/ECS), not Container Insights' absolute units
resource "aws_cloudwatch_metric_alarm" "ecs_high_cpu" {
  for_each = toset(var.ecs_service_names)

  alarm_name          = "${each.key}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "${each.key} CPU > 80% of reserved for 15 minutes"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = each.key
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_high_memory" {
  for_each = toset(var.ecs_service_names)

  alarm_name          = "${each.key}-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "${each.key} memory > 80% of reserved for 15 minutes"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = each.key
  }
}

# ---- Load balancer (API) ----
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.name}-alb-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = var.http_5xx_threshold
  treat_missing_data  = "notBreaching"
  alarm_description   = "Load balancer answered 5xx (no healthy API target, timeouts) more than ${var.http_5xx_threshold} times in 5 minutes"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.name}-api-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = var.http_5xx_threshold
  treat_missing_data  = "notBreaching"
  alarm_description   = "API answered 5xx more than ${var.http_5xx_threshold} times in 5 minutes"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.api_target_group_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "api_latency_p95" {
  alarm_name          = "${local.name}-api-latency-p95"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  extended_statistic  = "p95"
  threshold           = var.api_p95_latency_seconds
  treat_missing_data  = "notBreaching"
  alarm_description   = "API p95 response time > ${var.api_p95_latency_seconds}s for 15 minutes"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.api_target_group_arn_suffix
  }
}

# The target group checks readiness: a task that lost the database or Redis turns unhealthy
resource "aws_cloudwatch_metric_alarm" "api_unhealthy_targets" {
  alarm_name          = "${local.name}-api-unhealthy-targets"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "An API task fails readiness (database, Redis or queues unreachable)"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.api_target_group_arn_suffix
  }
}

# ---- RDS ----
resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${local.name}-rds-high-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.rds_connections_threshold
  alarm_description   = "RDS database connections > ${var.rds_connections_threshold}"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${local.name}-rds-low-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 2147483648 # 2 GB in bytes
  alarm_description   = "RDS free storage < 2 GB"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name}-rds-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS CPU > 80% for 15 minutes"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_memory" {
  alarm_name          = "${local.name}-rds-low-memory"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 104857600 # 100 MB in bytes
  alarm_description   = "RDS freeable memory < 100 MB"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }
}

# ---- Redis ----
resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  count = var.redis_replication_group_id != null ? 1 : 0

  alarm_name          = "${local.name}-redis-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Maximum"
  threshold           = 80
  alarm_description   = "Redis memory > 80% of maxmemory (with noeviction, writes fail at 100%)"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    ReplicationGroupId = var.redis_replication_group_id
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_evictions" {
  count = var.redis_replication_group_id != null ? 1 : 0

  alarm_name          = "${local.name}-redis-evictions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "Redis evicted keys: sessions or queue data lost (the policy must be noeviction)"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    ReplicationGroupId = var.redis_replication_group_id
  }
}

# ---- Application logs ----
# Error-level log lines (pino level >= 50) per app
resource "aws_cloudwatch_log_metric_filter" "errors" {
  for_each = var.log_group_names

  name           = "${local.name}-${each.key}-errors"
  log_group_name = each.value
  pattern        = "{ $.level >= 50 }"

  metric_transformation {
    name          = "ErrorLogs-${each.key}"
    namespace     = local.namespace
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "errors" {
  for_each = var.log_group_names

  alarm_name          = "${local.name}-${each.key}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ErrorLogs-${each.key}"
  namespace           = local.namespace
  period              = 300
  statistic           = "Sum"
  threshold           = var.error_log_threshold
  treat_missing_data  = "notBreaching"
  alarm_description   = "${each.key} logged more than ${var.error_log_threshold} errors in 5 minutes"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  depends_on = [aws_cloudwatch_log_metric_filter.errors]
}

# ---- Queues ----
# The API logs one line per queue every minute (queue-metrics job): { metric: "queue_depth",
# queue, waiting, oldestWaitingSeconds, failedLastInterval, ... }
locals {
  queue_metrics = {
    QueueWaiting              = "$.waiting"
    QueueOldestWaitingSeconds = "$.oldestWaitingSeconds"
    QueueFailed               = "$.failedLastInterval"
  }
}

resource "aws_cloudwatch_log_metric_filter" "queues" {
  for_each = local.queue_metrics

  name           = "${local.name}-${each.key}"
  log_group_name = var.log_group_names["api"]
  pattern        = "{ $.metric = \"queue_depth\" }"

  metric_transformation {
    name      = each.key
    namespace = local.namespace
    value     = each.value
    dimensions = {
      Queue = "$.queue"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "queue_backlog" {
  for_each = toset(var.queue_names)

  alarm_name          = "${local.name}-queue-${each.key}-backlog"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "QueueWaiting"
  namespace           = local.namespace
  period              = 300
  statistic           = "Maximum"
  threshold           = var.queue_backlog_threshold
  treat_missing_data  = "notBreaching"
  alarm_description   = "${each.key}: more than ${var.queue_backlog_threshold} jobs waiting for 15 minutes"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    Queue = each.key
  }

  depends_on = [aws_cloudwatch_log_metric_filter.queues]
}

# A job waiting this long means its consumer stopped (dead worker, lost Redis connection)
resource "aws_cloudwatch_metric_alarm" "queue_stuck" {
  for_each = toset(var.queue_names)

  alarm_name          = "${local.name}-queue-${each.key}-stuck"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "QueueOldestWaitingSeconds"
  namespace           = local.namespace
  period              = 300
  statistic           = "Maximum"
  threshold           = var.queue_oldest_waiting_seconds
  treat_missing_data  = "notBreaching"
  alarm_description   = "${each.key}: a job has waited more than ${var.queue_oldest_waiting_seconds}s"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    Queue = each.key
  }

  depends_on = [aws_cloudwatch_log_metric_filter.queues]
}

# Failed jobs (retries exhausted or permanent errors) are the dead-letter set
resource "aws_cloudwatch_metric_alarm" "queue_failed" {
  for_each = toset(var.queue_names)

  alarm_name          = "${local.name}-queue-${each.key}-failed"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "QueueFailed"
  namespace           = local.namespace
  period              = 300
  statistic           = "Sum"
  threshold           = var.queue_failed_threshold
  treat_missing_data  = "notBreaching"
  alarm_description   = "${each.key}: ${var.queue_failed_threshold}+ jobs failed for good in 5 minutes"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  dimensions = {
    Queue = each.key
  }

  depends_on = [aws_cloudwatch_log_metric_filter.queues]
}

# ---- External uptime check ----
# Route 53 probes readiness from several regions over HTTPS; it fails when the API is unreachable
# or any dependency is down.
resource "aws_route53_health_check" "api" {
  count = var.api_fqdn != null ? 1 : 0

  fqdn              = var.api_fqdn
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/health/ready"
  failure_threshold = 3
  request_interval  = 30

  tags = {
    Name = "${local.name}-api-uptime"
  }
}

resource "aws_sns_topic" "alarms_us_east_1" {
  count    = var.api_fqdn != null ? 1 : 0
  provider = aws.us_east_1
  name     = "${local.name}-alarms"
}

resource "aws_sns_topic_subscription" "email_us_east_1" {
  for_each  = var.api_fqdn != null ? toset(var.alarm_emails) : toset([])
  provider  = aws.us_east_1
  topic_arn = aws_sns_topic.alarms_us_east_1[0].arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "api_uptime" {
  count    = var.api_fqdn != null ? 1 : 0
  provider = aws.us_east_1

  alarm_name          = "${local.name}-api-uptime"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HealthCheckStatus"
  namespace           = "AWS/Route53"
  period              = 60
  statistic           = "Minimum"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_description   = "https://${var.api_fqdn}/api/health/ready failing from outside AWS"
  alarm_actions       = [aws_sns_topic.alarms_us_east_1[0].arn]
  ok_actions          = [aws_sns_topic.alarms_us_east_1[0].arn]

  dimensions = {
    HealthCheckId = aws_route53_health_check.api[0].id
  }
}
