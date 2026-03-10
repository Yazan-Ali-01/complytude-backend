terraform {
  backend "s3" {
    bucket         = "complytude-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "me-central-1"
    dynamodb_table = "complytude-terraform-locks"
    encrypt        = true
  }
}
