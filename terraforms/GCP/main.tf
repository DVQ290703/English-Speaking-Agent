resource "google_container_cluster" "primary" {
  name                = var.cluster_name
  location            = var.zone
  min_master_version  = var.kubernetes_version
  deletion_protection = var.deletion_protection

  # Remove default node pool — we manage our own
  remove_default_node_pool = true
  initial_node_count       = 1

  release_channel {
    channel = var.release_channel
  }

  network_policy {
    enabled = true
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  dynamic "private_cluster_config" {
    for_each = var.enable_private_nodes ? [1] : []
    content {
      enable_private_nodes    = true
      enable_private_endpoint = false
      master_ipv4_cidr_block  = var.master_ipv4_cidr_block
    }
  }
}

# Cloud Router — required for Cloud NAT
resource "google_compute_router" "nat_router" {
  count   = var.enable_private_nodes ? 1 : 0
  name    = "${var.cluster_name}-nat-router"
  region  = var.region
  network = "default"
}

# Cloud NAT — outbound internet for private nodes (image pulls, external API calls)
resource "google_compute_router_nat" "nat" {
  count                              = var.enable_private_nodes ? 1 : 0
  name                               = "${var.cluster_name}-nat"
  router                             = google_compute_router.nat_router[0].name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

resource "google_container_node_pool" "primary_nodes" {
  name       = "${var.cluster_name}-node-pool"
  location   = var.zone
  cluster    = google_container_cluster.primary.name
  node_count = var.node_count

  node_config {
    machine_type = var.node_machine_type
    disk_size_gb = var.disk_size_gb
    disk_type    = var.disk_type

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    labels = {
      env = var.environment
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = var.node_auto_upgrade
  }
}
