# ---- ALB Security Group ----
# The load balancer is the public entry point — it accepts traffic from the internet.
resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-${var.environment}-alb-"
  description = "Security group for the Application Load Balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP from internet (redirects to HTTPS)"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS from internet"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }

  tags = { Name = "${var.project_name}-${var.environment}-alb-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

# ---- ECS Security Group ----
# The app containers only accept traffic from the load balancer — never directly from the internet.
resource "aws_security_group" "ecs" {
  name_prefix = "${var.project_name}-${var.environment}-ecs-"
  description = "Security group for ECS Fargate tasks (API + workers)"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 3000
    to_port         = 3002
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "Traffic from ALB only"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound (RDS, Redis, S3, internet)"
  }

  tags = { Name = "${var.project_name}-${var.environment}-ecs-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

# ---- RDS Security Group ----
# The database only accepts connections from app containers and bastion — completely hidden from the internet.
# NOTE: Ingress rules are managed via separate aws_security_group_rule resources
# to avoid conflicts with rules added by other modules (e.g. bastion).
resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-${var.environment}-rds-"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project_name}-${var.environment}-rds-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "rds_from_ecs" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs.id
  security_group_id        = aws_security_group.rds.id
  description              = "PostgreSQL from ECS"
}

# ---- Redis Security Group ----
# Redis only accepts connections from app containers.
resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-${var.environment}-redis-"
  description = "Security group for ElastiCache Redis"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
    description     = "Redis from ECS only"
  }

  tags = { Name = "${var.project_name}-${var.environment}-redis-sg" }

  lifecycle {
    create_before_destroy = true
  }
}
