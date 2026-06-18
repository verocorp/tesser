variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "zone" {
  type    = string
  default = "us-central1-a"
}

variable "instance_name" {
  type    = string
  default = "tesser-repro"
}

variable "machine_type" {
  type        = string
  default     = "n2-standard-4" # 4 vCPU / 16 GB, Intel/amd64
  description = "Use n2-*/e2-* for amd64. Never t2a-* (Ampere/arm)."
}

variable "image" {
  type        = string
  default     = "ubuntu-os-cloud/ubuntu-2204-lts" # amd64
  description = "For full determinism pin a specific image (e.g. ubuntu-2204-jammy-vYYYYMMDD), not the floating -lts family."
}

variable "disk_size_gb" {
  type    = number
  default = 50
}

variable "network" {
  type    = string
  default = "default"
}

variable "ssh_user" {
  type    = string
  default = "ubuntu"
}

variable "ssh_pubkey_path" {
  type        = string
  description = "Absolute path to the SSH public key (terraform file() does NOT expand ~)."
}

variable "allowed_ssh_cidr" {
  type        = string
  description = "CIDR allowed to SSH (lock to your IP/32)."
}

variable "cloud_init_path" {
  type        = string
  description = "Path to the base cloud-init #cloud-config (docker + git only)."
}
