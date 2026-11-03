#!/usr/bin/env bash
set -euo pipefail
audience="masseater-dev-ci-telemetry"
token="$(curl -fsS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
  "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=$audience" | jq -er .value)"
echo "::add-mask::$token"
gh api --paginate "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/attempts/$GITHUB_RUN_ATTEMPT/jobs" \
  --jq '.jobs[] | select(.completed_at != null) | {id, name, conclusion, started_at, completed_at, runner_name,
    steps: [.steps[]? | select(.started_at != null and .completed_at != null)
      | {name, number, conclusion, started_at, completed_at}]}' |
  jq -s '{jobs: .}' |
  curl -fsS -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
    --data-binary @- "https://$audience.masseater.workers.dev"
