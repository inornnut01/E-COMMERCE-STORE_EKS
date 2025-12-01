# Metrics Server for HPA (Horizontal Pod Autoscaler)
# This is required for HPA to read CPU/Memory metrics from pods

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  namespace  = "kube-system"
  version    = "3.12.2"

  # Wait for EKS cluster and node groups to be ready
  depends_on = [module.eks]

  # Wait for the metrics-server to be ready
  wait    = true
  timeout = 300

  # Recommended settings for EKS
  values = [
    <<-EOT
    args:
      - --kubelet-preferred-address-types=InternalIP
      - --kubelet-use-node-status-port
      - --metric-resolution=15s
    EOT
  ]
}

