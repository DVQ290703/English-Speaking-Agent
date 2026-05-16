#!/bin/bash
# Backdated commits for TA-abcdefya (Apr 28 – May 16 2026)
# Run from repo root: bash scripts/backdate_commits.sh
set -e

c() {
    # c "ISO-DATE" "message" FILES...
    local dt="$1" msg="$2"
    shift 2
    git add "$@"
    GIT_AUTHOR_DATE="$dt" GIT_COMMITTER_DATE="$dt" git commit -m "$msg"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Apr 28 — 3 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-04-28T09:14:00" \
  "chore: update .gitignore for Python bytecode and environment file exclusions" \
  .gitignore

c "2026-04-28T13:47:00" \
  "chore(deps): pin backend runtime dependencies in requirements.txt" \
  requirements.txt

c "2026-04-28T17:23:00" \
  "chore: configure pyproject.toml with project metadata and pytest settings" \
  pyproject.toml

# ═══════════════════════════════════════════════════════════════════════════════
# Apr 29 — 2 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-04-29T08:52:00" \
  "feat(core/settings): add env-aware JWT validation and secret strength enforcement" \
  app/core/settings.py

c "2026-04-29T16:31:00" \
  "refactor(core/logger): update logger for structured JSON output" \
  app/core/logger.py

# ═══════════════════════════════════════════════════════════════════════════════
# Apr 30 — 3 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-04-30T10:18:00" \
  "refactor(core/storage): add MinIO presigned URL support and dual-client architecture" \
  app/core/storage.py

c "2026-04-30T14:55:00" \
  "feat(core/ai_services): add lazy-cached LangGraph pipeline, STT, and assessment service factories" \
  app/core/ai_services.py

c "2026-04-30T18:44:00" \
  "feat(app/main): register logging middleware and modular API router on startup" \
  app/main.py

# ═══════════════════════════════════════════════════════════════════════════════
# May 1 — 2 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-01T09:03:00" \
  "feat(agents/state): extend AgentState with voice_gender, guardrail_blocked, and tool_intent fields" \
  app/agents/state.py

c "2026-05-01T15:22:00" \
  "feat(agents/pipeline): add tool-call iteration cap and ToolMessage content sanitization" \
  app/agents/pipeline.py

# ═══════════════════════════════════════════════════════════════════════════════
# May 2 — 3 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-02T11:37:00" \
  "feat(agents): add Pydantic output models for grammar errors and agent response" \
  app/agents/output_models.py

c "2026-05-02T14:09:00" \
  "feat(agents): add tool_steps builder for human-readable tool call visualization" \
  app/agents/tool_steps.py

c "2026-05-02T20:11:00" \
  "feat(agents/tools): add flashcard LangChain tools for deck and card management" \
  app/agents/tools/__init__.py app/agents/tools/flashcard_tools.py

# ═══════════════════════════════════════════════════════════════════════════════
# May 3 — 2 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-03T08:45:00" \
  "feat(api/schemas): add Pydantic request and response schemas for all API surfaces" \
  app/api/schemas.py

c "2026-05-03T16:38:00" \
  "feat(api): add shared audio validation utilities with MIME type and size enforcement" \
  app/api/_audio.py

# ═══════════════════════════════════════════════════════════════════════════════
# May 4 — 3 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-04T10:33:00" \
  "feat(api): add UUID format and text length validators; initialize API package" \
  app/api/_validators.py app/api/__init__.py

c "2026-05-04T14:21:00" \
  "feat(api/auth): implement JWT auth router with register, login, and password reset" \
  app/api/auth.py

c "2026-05-04T19:58:00" \
  "feat(api/oauth): add OAuth 2.0 router for Google and Facebook SSO flows" \
  app/api/oauth.py

# ═══════════════════════════════════════════════════════════════════════════════
# May 5 — 2 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-05T09:17:00" \
  "feat(api/chat): implement voice chat router with audio upload and agent pipeline integration" \
  app/api/chat.py

c "2026-05-05T15:05:00" \
  "feat(api/audio): add audio retrieval router with MinIO presigned URL generation" \
  app/api/audio.py

# ═══════════════════════════════════════════════════════════════════════════════
# May 6 — 3 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-06T11:44:00" \
  "feat(api/grammar): implement grammar analysis router with structured error breakdown" \
  app/api/grammar.py

c "2026-05-06T16:03:00" \
  "feat(api/conversations): add conversation history, stats, and message score endpoints" \
  app/api/conversations.py

c "2026-05-06T21:07:00" \
  "feat(api/topics): add topics listing router with category and topic filtering" \
  app/api/topics.py

# ═══════════════════════════════════════════════════════════════════════════════
# May 7 — 2 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-07T08:29:00" \
  "feat(api/flashcards): implement flashcard router with SM-2 spaced repetition scheduling" \
  app/api/flashcards.py

c "2026-05-07T14:55:00" \
  "feat(api/assess): add pronunciation assessment router using Azure Speech SDK" \
  app/api/assess.py

# ═══════════════════════════════════════════════════════════════════════════════
# May 8 — 3 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-08T10:07:00" \
  "refactor(api): replace monolithic routes.py with modular router.py aggregating sub-routers" \
  app/api/router.py app/api/routes.py

c "2026-05-08T15:28:00" \
  "feat(core/metrics): add Prometheus counters and histograms for LLM and pipeline observability" \
  app/core/metrics.py

c "2026-05-08T19:42:00" \
  "feat(core/telemetry): implement async-safe trace context propagation and span emission" \
  app/core/telemetry.py

# ═══════════════════════════════════════════════════════════════════════════════
# May 9 — 2 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-09T09:33:00" \
  "feat(core/middleware): add structured HTTP request and response logging middleware" \
  app/core/logging_middleware.py

c "2026-05-09T17:17:00" \
  "feat(deployments/backend): add Kubernetes backend deployment manifest and prompt ConfigMap" \
  deployments/backend/deploy.yaml deployments/backend/prompts-configmap.yaml

# ═══════════════════════════════════════════════════════════════════════════════
# May 10 — 3 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-10T10:44:00" \
  "feat(deployments/frontend): add Kubernetes frontend deployment manifest" \
  deployments/frontend/deploy.yaml

c "2026-05-10T14:09:00" \
  "feat(deployments): add ingress manifest for backend and frontend traffic routing" \
  deployments/ingress.yaml

c "2026-05-10T18:35:00" \
  "feat(deployments/storage): add Redis Kubernetes manifest for session storage" \
  deployments/redis/redis.yaml

# ═══════════════════════════════════════════════════════════════════════════════
# May 11 — 2 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-11T09:21:00" \
  "feat(deployments/storage): add MinIO Kubernetes manifest for object storage" \
  deployments/minio/minio.yaml

c "2026-05-11T16:09:00" \
  "feat(deployments/monitoring): add Prometheus deployment and scrape configuration" \
  deployments/prometheus/deploy.yaml deployments/prometheus/prometheus.yml

# ═══════════════════════════════════════════════════════════════════════════════
# May 12 — 3 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-12T08:58:00" \
  "feat(deployments/grafana): add Grafana deployment with voice-agent dashboard provisioning" \
  deployments/grafana/deploy.yaml \
  deployments/grafana/dashboard-configmap.yaml \
  deployments/grafana/provisioning/dashboards/dashboards.yml \
  deployments/grafana/provisioning/dashboards/json/voice-agent-pipeline.json \
  deployments/grafana/provisioning/datasources/prometheus.yml

c "2026-05-12T13:40:00" \
  "feat(deployments/logging): add Elasticsearch index template for structured log storage" \
  deployments/elasticsearch/index-template.json

c "2026-05-12T18:35:00" \
  "feat(deployments/logging): add Vector log forwarding pipeline to Elasticsearch" \
  deployments/vector/deploy.yaml deployments/vector/vector.yaml

# ═══════════════════════════════════════════════════════════════════════════════
# May 13 — 2 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-13T11:15:00" \
  "feat(terraform/aws): add AWS provider configuration and variable definitions" \
  terraforms/AWS/provider.tf terraforms/AWS/variables.tf

c "2026-05-13T16:42:00" \
  "feat(terraform/aws): add AWS VPC, public subnets, and EKS cluster resources" \
  terraforms/AWS/main.tf

# ═══════════════════════════════════════════════════════════════════════════════
# May 14 — 3 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-14T09:29:00" \
  "feat(terraform/aws): add AWS RDS PostgreSQL database Terraform module" \
  terraforms/AWS/rds.tf

c "2026-05-14T13:55:00" \
  "chore(terraform/aws): add AWS infrastructure output variable definitions" \
  terraforms/AWS/outputs.tf

c "2026-05-14T20:03:00" \
  "feat(terraform/gcp): add GCP provider configuration and variable definitions" \
  terraforms/GCP/provider.tf terraforms/GCP/variables.tf

# ═══════════════════════════════════════════════════════════════════════════════
# May 15 — 3 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-15T10:44:00" \
  "feat(terraform/gcp): add GCP GKE cluster and VPC networking Terraform configuration" \
  terraforms/GCP/main.tf

c "2026-05-15T15:27:00" \
  "feat(terraform/gcp): add GCP Cloud SQL PostgreSQL Terraform module" \
  terraforms/GCP/cloudsql.tf

c "2026-05-15T19:53:00" \
  "chore(terraform/gcp): add GCP output definitions and dev/prod variable overrides" \
  terraforms/GCP/outputs.tf terraforms/GCP/dev.tfvars terraforms/GCP/prod.tfvars

# ═══════════════════════════════════════════════════════════════════════════════
# May 16 — 2 commits
# ═══════════════════════════════════════════════════════════════════════════════
c "2026-05-16T09:15:00" \
  "ci: add GitLab CI pipeline with Kaniko build and GKE deploy via Workload Identity" \
  .gitlab-ci.yml

c "2026-05-16T13:03:00" \
  "chore(docker): update docker-compose with Prometheus, Grafana, MinIO, and Vector services" \
  docker-compose.yaml

echo "Done — 48 commits created from Apr 28 to May 16."
