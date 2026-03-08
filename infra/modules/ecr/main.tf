# Create one ECR repository per app
resource "aws_ecr_repository" "main" {
  for_each = toset(var.repository_names)

  name                 = "${var.project_name}/${each.key}"
  image_tag_mutability = "MUTABLE" # Allows overwriting tags (e.g., 'latest')

  # Scan images for vulnerabilities on push
  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "${var.project_name}-${each.key}"
    Environment = var.environment
  }
}

# Lifecycle policy: keep only the last 10 images (prevents storage bloat)
resource "aws_ecr_lifecycle_policy" "main" {
  for_each   = aws_ecr_repository.main
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = {
        type = "expire"
      }
    }]
  })
}
