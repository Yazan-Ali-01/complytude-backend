# ---- SNS Topic for Alarm Notifications ----
# Sends emails when alarms fire. After creation, you must click the confirmation link in the email.
resource "aws_sns_topic" "alarms" {
  name = "${var.project_name}-${var.environment}-alarms"

  tags = {
    Name = "${var.project_name}-${var.environment}-alarms"
  }
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# ---- ECS Alarms ----
# Alert if any ECS service has 0 running tasks (service is DOWN)
# treat_missing_data = "breaching" because ECS reports NO metrics when 0 tasks (no containers to report)
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
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = each.key
  }

  tags = {
    Name = "${each.key}-no-running-tasks"
  }
}

# Alert if ECS service CPU > 80%
resource "aws_cloudwatch_metric_alarm" "ecs_high_cpu" {
  for_each = toset(var.ecs_service_names)

  alarm_name          = "${each.key}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CpuUtilized"
  namespace           = "ECS/ContainerInsights"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "${each.key} CPU utilization > 80%"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = each.key
  }

  tags = {
    Name = "${each.key}-high-cpu"
  }
}

# Alert if ECS service memory > 80%
resource "aws_cloudwatch_metric_alarm" "ecs_high_memory" {
  for_each = toset(var.ecs_service_names)

  alarm_name          = "${each.key}-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "MemoryUtilized"
  namespace           = "ECS/ContainerInsights"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "${each.key} memory utilization > 80%"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = each.key
  }

  tags = {
    Name = "${each.key}-high-memory"
  }
}

# ---- RDS Alarms ----
# Alert if database connections > threshold (db.t4g.micro max ~85)
resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-high-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.rds_connections_threshold
  alarm_description   = "RDS database connections > ${var.rds_connections_threshold}"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-rds-high-connections"
  }
}

# Alert if free storage < 2 GB
resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-low-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 2147483648 # 2 GB in bytes
  alarm_description   = "RDS free storage < 2 GB"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-rds-low-storage"
  }
}

# ---- ElastiCache (Redis) Alarms ----
# Alert if Redis freeable memory is low (cache is filling up)
resource "aws_cloudwatch_metric_alarm" "redis_low_memory" {
  count = var.redis_replication_group_id != null ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-redis-low-memory"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "FreeableMemory"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 52428800 # 50 MB in bytes
  alarm_description   = "Redis freeable memory < 50 MB - cache may be full"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    ReplicationGroupId = var.redis_replication_group_id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-redis-low-memory"
  }
}
