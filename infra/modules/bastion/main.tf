# ---- Bastion Security Group ----
locals {
  ssh_ipv4 = [for c in var.ssh_allowed_cidrs : c if !can(regex(":", c))]
  ssh_ipv6 = [for c in var.ssh_allowed_cidrs : c if can(regex(":", c))]
}

resource "aws_security_group" "bastion" {
  name_prefix = "${var.project_name}-${var.environment}-bastion-"
  description = "Bastion host: SSM Session Manager port forwarding to RDS and Bull Board"
  vpc_id      = var.vpc_id

  # No inbound by default: sessions come through SSM (outbound 443). SSH only if CIDRs are given.
  dynamic "ingress" {
    for_each = length(var.ssh_allowed_cidrs) > 0 ? [1] : []
    content {
      from_port        = 22
      to_port          = 22
      protocol         = "tcp"
      cidr_blocks      = local.ssh_ipv4
      ipv6_cidr_blocks = local.ssh_ipv6
      description      = "SSH from allowed IPs"
    }
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

# ---- Allow bastion → Bull Board (API internal port; reached by port forwarding only) ----
resource "aws_security_group_rule" "bastion_to_bull_board" {
  type                     = "ingress"
  from_port                = var.bull_board_port
  to_port                  = var.bull_board_port
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.bastion.id
  security_group_id        = var.ecs_security_group_id
  description              = "Bull Board from bastion"
}

# ---- Session Manager: the instance registers with SSM; access is by IAM, per person, logged ----
resource "aws_iam_role" "bastion" {
  name = "${var.project_name}-${var.environment}-bastion"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "ec2.amazonaws.com" }
      }
    ]
  })

  tags = { Name = "${var.project_name}-${var.environment}-bastion" }
}

resource "aws_iam_role_policy_attachment" "bastion_ssm" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${var.project_name}-${var.environment}-bastion"
  role = aws_iam_role.bastion.name
}

# ---- Bastion EC2 ----
# The latest AL2023 image when the instance is created (or var.ami_id); a newer image doesn't
# replace a running bastion. Upgrade with: terraform apply -replace=module.bastion.aws_instance.bastion
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
  ami                    = coalesce(var.ami_id, data.aws_ami.amazon_linux.id)
  instance_type          = "t4g.micro"
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.bastion.id]
  iam_instance_profile   = aws_iam_instance_profile.bastion.name
  # A shared key pair only when SSH is still wanted; SSM needs none
  key_name = var.key_name

  # IMDSv2 only: a request forged through a proxy on the host can't read the instance credentials
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-bastion"
  }

  lifecycle {
    ignore_changes = [ami]
  }
}
