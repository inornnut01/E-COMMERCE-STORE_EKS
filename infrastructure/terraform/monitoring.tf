resource "aws_sns_topic" "alarm" {
  name = "${var.cluster_name}-alarms"

  tags = {
    Name        = "${var.cluster_name}-alarms"
    Environment = var.environment
  }
}

resource "aws_sns_topic_subscription" "alarm_email" {
  topic_arn = aws_sns_topic.alarm.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

data "aws_lb" "ingress_alb" {
  count = var.enable_alb_monitoring ? 1 : 0

  tags = {
    "elbv2.k8s.aws/cluster"    = var.cluster_name
    "ingress.k8s.aws/resource" = "LoadBalancer"
  }

  depends_on = [module.eks]
}

data "aws_lb_target_group" "backend_tg" {
  count = var.enable_alb_monitoring ? 1 : 0

  tags = {
    "elbv2.k8s.aws/cluster" = var.cluster_name
  }

  depends_on = [module.eks]
}

# High CPU Alarm
resource "aws_cloudwatch_metric_alarm" "high_cpu_alarm" {
  alarm_name          = "${var.cluster_name}-high-cpu-alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "node_cpu_utilization"
  namespace           = "ContainerInsights"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors EKS CPU utilization"
  alarm_actions       = [aws_sns_topic.alarm.arn]
  dimensions = {
    ClusterName = var.cluster_name
  }
  tags = {
    Name = "${var.cluster_name}-high-cpu-alarm"
  }
}

# High Memory Alarms
resource "aws_cloudwatch_metric_alarm" "high_memory_alarm" {
  alarm_name          = "${var.cluster_name}-high-memory-alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "node_memory_utilization"
  namespace           = "ContainerInsights"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors EKS memory utilization"
  alarm_actions       = [aws_sns_topic.alarm.arn]
  dimensions = {
    ClusterName = var.cluster_name
  }
  tags = {
    Name = "${var.cluster_name}-high-memory-alarm"
  }
}

# Node Count Alarm
resource "aws_cloudwatch_metric_alarm" "low_node_count" {
  alarm_name          = "${var.cluster_name}-low-node-count"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "cluster_node_count"
  namespace           = "ContainerInsights"
  period              = "300"
  statistic           = "Average"
  threshold           = "2" # Minimum number of nodes
  alarm_description   = "This metric monitors EKS node count"
  alarm_actions       = [aws_sns_topic.alarm.arn]
  dimensions = {
    ClusterName = var.cluster_name
  }
  tags = {
    Name = "${var.cluster_name}-low-node-count"
  }
}

# Failed Pods Alarm
resource "aws_cloudwatch_metric_alarm" "pod_failures" {
  alarm_name          = "${var.cluster_name}-pod-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "pod_number_of_container_restarts"
  namespace           = "ContainerInsights"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "Alert when pods are restarting frequently"
  alarm_actions       = [aws_sns_topic.alarm.arn]
  dimensions = {
    ClusterName = var.cluster_name
  }
  tags = {
    Name = "${var.cluster_name}-pod-failures"
  }
}

# Backend API Response Time
resource "aws_cloudwatch_metric_alarm" "backend_api_high_latency" {
  count = var.enable_alb_monitoring ? 1 : 0

  alarm_name          = "${var.cluster_name}-backend-api-high-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Average"
  threshold           = "2"
  alarm_description   = "Alert when backend API response time is high"
  alarm_actions       = [aws_sns_topic.alarm.arn]
  dimensions = {
    LoadBalancer = data.aws_lb.ingress_alb[0].arn_suffix
  }
  tags = {
    Name = "${var.cluster_name}-backend-api-high-latency"
  }
}

# Target Health Check Failures
resource "aws_cloudwatch_metric_alarm" "unhealthy_targets" {
  count = var.enable_alb_monitoring ? 1 : 0

  alarm_name          = "${var.cluster_name}-unhealthy-targets"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = "0"
  alarm_description   = "One or more targets are unhealthy"
  alarm_actions       = [aws_sns_topic.alarm.arn]

  dimensions = {
    TargetGroup  = data.aws_lb_target_group.backend_tg[0].arn_suffix
    LoadBalancer = data.aws_lb.ingress_alb[0].arn_suffix
  }
  tags = {
    Name = "${var.cluster_name}-unhealthy-targets"
  }
}

# HTTP 5xx Errors
resource "aws_cloudwatch_metric_alarm" "high_5xx_errors" {
  count = var.enable_alb_monitoring ? 1 : 0

  alarm_name          = "${var.cluster_name}-high-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "High number of 5xx errors"
  alarm_actions       = [aws_sns_topic.alarm.arn]

  dimensions = {
    LoadBalancer = data.aws_lb.ingress_alb[0].arn_suffix
  }
  tags = {
    Name = "${var.cluster_name}-high-5xx-errors"
  }
}

# Disk Utilization
resource "aws_cloudwatch_metric_alarm" "high_disk_usage" {
  alarm_name          = "${var.cluster_name}-high-disk-usage"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "node_filesystem_utilization"
  namespace           = "ContainerInsights"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Node disk usage is high"
  alarm_actions       = [aws_sns_topic.alarm.arn]

  dimensions = {
    ClusterName = var.cluster_name
  }

  tags = {
    Name = "${var.cluster_name}-high-disk-usage"
  }
}

