#!/usr/bin/env bash

set -euo pipefail

CONSOLE_VERSION=${CONSOLE_VERSION:=4.14}
CONSOLE_PORT=${CONSOLE_PORT:=9000}
CONSOLE_IMAGE="quay.io/openshift/origin-console:${CONSOLE_VERSION}"

echo "Starting local OpenShift console..."

BRIDGE_BASE_ADDRESS=${BRIDGE_BASE_ADDRESS:="http://localhost:9000"}
BRIDGE_USER_AUTH=${BRIDGE_USER_AUTH:="disabled"}
BRIDGE_K8S_MODE=${BRIDGE_K8S_MODE:="off-cluster"}
BRIDGE_K8S_AUTH=${BRIDGE_K8S_AUTH:="bearer-token"}
BRIDGE_K8S_MODE_OFF_CLUSTER_SKIP_VERIFY_TLS=${BRIDGE_K8S_MODE_OFF_CLUSTER_SKIP_VERIFY_TLS:=true}
BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT=$(oc whoami --show-server)
BRIDGE_PLUGINS=${BRIDGE_PLUGINS:=odf-console="http://localhost:9001"}
BRIDGE_PLUGIN_PROXY=${BRIDGE_PLUGIN_PROXY:=""}

# The monitoring operator is not always installed (e.g. for local OpenShift). Tolerate missing config maps.
set +e
BRIDGE_K8S_MODE_OFF_CLUSTER_THANOS=$(oc -n openshift-config-managed get configmap monitoring-shared-config -o jsonpath='{.data.thanosPublicURL}' 2>/dev/null)
BRIDGE_K8S_MODE_OFF_CLUSTER_ALERTMANAGER=$(oc -n openshift-config-managed get configmap monitoring-shared-config -o jsonpath='{.data.alertmanagerPublicURL}' 2>/dev/null)
set -e
BRIDGE_K8S_AUTH_BEARER_TOKEN=$(oc whoami --show-token 2>/dev/null)
BRIDGE_USER_SETTINGS_LOCATION="localstorage"

# Don't fail if the cluster doesn't have gitops.
set +e
GITOPS_HOSTNAME=$(oc -n openshift-gitops get route cluster -o jsonpath='{.spec.host}' 2>/dev/null)
set -e
if [ -n "$GITOPS_HOSTNAME" ]; then
    BRIDGE_K8S_MODE_OFF_CLUSTER_GITOPS="https://$GITOPS_HOSTNAME"
fi

echo "API Server: $BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT"
echo "Console Image: $CONSOLE_IMAGE"
echo "Console URL: http://localhost:${CONSOLE_PORT}"
echo "$BRIDGE_PLUGIN_PROXY"

# Prefer podman if installed. Otherwise, fall back to docker.
if [ -x "$(command -v podman)" ]; then
    podman run \
      --pull always -p "$CONSOLE_PORT":9000 \
      --rm --network=host \
      --env BRIDGE_PLUGIN_PROXY="$BRIDGE_PLUGIN_PROXY" \
      --env-file <(set | grep BRIDGE) \
      $CONSOLE_IMAGE
else
    docker run \
      --pull always -p "$CONSOLE_PORT":9000 \
      --rm --network=host \
      --env BRIDGE_PLUGIN_PROXY="$BRIDGE_PLUGIN_PROXY" \
      --env-file <(set | grep BRIDGE) \
      $CONSOLE_IMAGE
fi
