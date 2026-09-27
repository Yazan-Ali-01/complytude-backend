# ---- Bastion Security Group ----
locals {
  ssh_ipv4 = [for c in var.ssh_allowed_cidrs : c if !can(regex(":", c))]
  ssh_ipv6 = [for c in var.ssh_allowed_cidrs : c if can(regex(":", c))]
}

resource "aws_security_group" "bastion" {
  name_prefix = "${var.project_name}-${var.environment}-bastion-"
  description = "Bastion host for SSH tunnel to RDS"
  vpc_id      = var.vpc_id

  ingress {
    from_port        = 22
    to_port          = 22
    protocol         = "tcp"
    cidr_blocks      = local.ssh_ipv4
    ipv6_cidr_blocks = local.ssh_ipv6
    description      = "SSH from allowed IPs"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound (RDS, etc.)"
  }

  tags = { Name = "${var.project_name}-${var.environment}-bastion-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

# ---- Allow bastion → RDS ----
resource "aws_security_group_rule" "bastion_to_rds" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.bastion.id
  security_group_id        = var.rds_security_group_id
  description              = "PostgreSQL from bastion"
}

# ---- Allow bastion → Bull Board (API internal port; SSH tunnel only) ----
resource "aws_security_group_rule" "bastion_to_bull_board" {
  type                     = "ingress"
  from_port                = var.bull_board_port
  to_port                  = var.bull_board_port
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.bastion.id
  security_group_id        = var.ecs_security_group_id
  description              = "Bull Board from bastion"
}

# ---- Bastion EC2 ----
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-kernel-6.1-arm64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

resource "aws_instance" "bastion" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = "t4g.micro"
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.bastion.id]
  key_name               = var.key_name

  tags = {
    Name = "${var.project_name}-${var.environment}-bastion"
  }
}
