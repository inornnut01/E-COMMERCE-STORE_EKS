# Makefile
.PHONY: help terraform-init terraform-plan terraform-apply terraform-destroy k8s-setup alb-controller deploy-all

# Variables
TERRAFORM_DIR := infrastructure/terraform
K8S_DIR := infrastructure/kubernetes

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ==================== Terraform Commands ====================
terraform-init: ## Initialize Terraform
	cd $(TERRAFORM_DIR) && terraform init

terraform-plan: ## Plan Terraform changes
	cd $(TERRAFORM_DIR) && terraform plan

terraform-apply: ## Apply Terraform changes
	cd $(TERRAFORM_DIR) && terraform apply -auto-approve

terraform-destroy: ## Destroy Terraform infrastructure
	cd $(TERRAFORM_DIR) && terraform destroy

terraform-output: ## Show Terraform outputs
	cd $(TERRAFORM_DIR) && terraform output

# ==================== Kubernetes Setup ====================
k8s-config: ## Configure kubectl for EKS
	@echo "Configuring kubectl for EKS..."
	@CLUSTER_NAME=$$(cd $(TERRAFORM_DIR) && terraform output -raw eks_cluster_name); \
	REGION=$$(cd $(TERRAFORM_DIR) && terraform output -raw region); \
	aws eks update-kubeconfig --region $$REGION --name $$CLUSTER_NAME
	@echo "✓ kubectl configured"

k8s-setup: k8s-config ## Setup Kubernetes resources (namespace, secrets, etc.)
	@echo "Creating namespace..."
	kubectl apply -f $(K8S_DIR)/namespace.yaml
	@echo "Creating ServiceAccount for ALB Controller..."
	kubectl apply -f $(K8S_DIR)/aws-load-balancer-controller-sa.yaml
	@echo "✓ Kubernetes basic setup complete"

# ==================== ALB Controller ====================
alb-controller: ## Install AWS Load Balancer Controller via Helm
	@echo "Installing AWS Load Balancer Controller..."
	@VPC_ID=$$(cd $(TERRAFORM_DIR) && terraform output -raw vpc_id); \
	CLUSTER_NAME=$$(cd $(TERRAFORM_DIR) && terraform output -raw eks_cluster_name); \
	REGION=$$(cd $(TERRAFORM_DIR) && terraform output -raw region); \
	helm repo add eks https://aws.github.io/eks-charts || true; \
	helm repo update; \
	helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
		-n kube-system \
		--set clusterName=$$CLUSTER_NAME \
		--set serviceAccount.create=false \
		--set serviceAccount.name=aws-load-balancer-controller \
		--set region=$$REGION \
		--set vpcId=$$VPC_ID \
		--wait
	@echo "✓ ALB Controller installed"

alb-controller-status: ## Check ALB Controller status
	kubectl get deployment -n kube-system aws-load-balancer-controller
	kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller --tail=50

# ==================== Application Deployment ====================
deploy-redis: k8s-config ## Deploy Redis
	kubectl apply -f $(K8S_DIR)/redis-statefulset.yaml
	kubectl apply -f $(K8S_DIR)/redis-cip-service.yaml

deploy-backend: k8s-config ## Deploy Backend
	@echo "⚠️  Make sure to create backend-secrets.yaml first!"
	kubectl apply -f $(K8S_DIR)/backend-secrets.yaml
	kubectl apply -f $(K8S_DIR)/backend-config.yaml
	kubectl apply -f $(K8S_DIR)/backend-dep.yaml
	kubectl apply -f $(K8S_DIR)/backend-service.yaml
	kubectl apply -f $(K8S_DIR)/backend-hpq.yaml

deploy-frontend: k8s-config ## Deploy Frontend
	kubectl apply -f $(K8S_DIR)/frontend-dep.yaml
	kubectl apply -f $(K8S_DIR)/frontend-service.yaml

deploy-order-processor: k8s-config ## Deploy Order Processor
	kubectl apply -f $(K8S_DIR)/order-processor-dep.yaml

deploy-ingress: k8s-config ## Deploy Ingress
	kubectl apply -f $(K8S_DIR)/ingress.yaml

# ==================== Complete Workflows ====================
deploy-all: terraform-apply k8s-setup alb-controller deploy-redis deploy-backend deploy-frontend deploy-order-processor deploy-ingress ## Deploy everything (Terraform + K8s + Apps)
	@echo "✓ Complete deployment finished!"
	@echo "Run 'make get-url' to get the application URL"

get-url: ## Get application URL
	@echo "Waiting for Load Balancer..."
	@kubectl get ingress -n e-commerce-store -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}'
	@echo ""

# ==================== Utilities ====================
status: ## Show status of all resources
	@echo "=== Kubernetes Nodes ==="
	kubectl get nodes
	@echo "\n=== Namespaces ==="
	kubectl get namespaces
	@echo "\n=== Pods in e-commerce-store namespace ==="
	kubectl get pods -n e-commerce-store
	@echo "\n=== Services in e-commerce-store namespace ==="
	kubectl get svc -n e-commerce-store
	@echo "\n=== Ingress ==="
	kubectl get ingress -n e-commerce-store

logs-backend: ## Show backend logs
	kubectl logs -n e-commerce-store -l app=backend --tail=100 -f

logs-frontend: ## Show frontend logs
	kubectl logs -n e-commerce-store -l app=frontend --tail=100 -f

logs-order-processor: ## Show order processor logs
	kubectl logs -n e-commerce-store -l app=order-processor --tail=100 -f

# ==================== Cleanup ====================
clean-k8s: ## Delete all Kubernetes resources
	kubectl delete namespace e-commerce-store || true
	helm uninstall aws-load-balancer-controller -n kube-system || true

clean-all: clean-k8s terraform-destroy ## Destroy everything
	@echo "✓ All resources destroyed"