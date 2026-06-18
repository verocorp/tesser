terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  # Local state by design — disposable verification boxes. No remote backend.
  # See ../README.md ("State"). The tfstate is the teardown record; don't lose it.
}

provider "google" {
  project = var.project_id
  region  = var.region
  # Auth via Application Default Credentials (gcloud auth application-default login).
  # No credentials in the repo.
}

# --- Infrastructure ONLY (provision-only boundary; see README) ---

resource "google_compute_instance" "repro" {
  name         = var.instance_name
  machine_type = var.machine_type # n2-* = Intel/amd64; never t2a-* (arm)
  zone         = var.zone
  tags         = ["tesser-repro-ssh"]

  boot_disk {
    initialize_params {
      image = var.image # ubuntu-2204-lts = amd64; never a -arm64 family
      size  = var.disk_size_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    network = var.network
    access_config {} # ephemeral public IP for SSH
  }

  metadata = {
    ssh-keys = "${var.ssh_user}:${file(var.ssh_pubkey_path)}"
    # Base config ONLY (docker + git). The repro itself is repro.sh over SSH.
    user-data = file(var.cloud_init_path)
  }

  deletion_protection = false # disposable — never block teardown

  labels = {
    purpose = "tesser-verification"
  }
}

resource "google_compute_firewall" "ssh" {
  name    = "${var.instance_name}-allow-ssh"
  network = var.network

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = [var.allowed_ssh_cidr] # lock to your IP/32
  target_tags   = ["tesser-repro-ssh"]
}
