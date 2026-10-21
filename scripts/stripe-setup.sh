#!/bin/sh
# scripts/stripe-setup.sh — one-time per-environment Stripe catalog + webhook setup.
#
# Creates the Plus product, its three recurring prices, the billing webhook and
# the customer portal configuration in the Stripe account behind
# STRIPE_SECRET_KEY, then:
#   - prints the price and portal configuration IDs to paste into
#     apps/seating-backend/wrangler.jsonc
#   - writes the new webhook signing secret into the env file
# Idempotent: the product has a fixed ID, prices are found by lookup key, the
# webhook endpoint by URL and the portal configuration by metadata, so
# re-running skips what already exists.
#
# Usage:
#   scripts/stripe-setup.sh staging|production
#
# Reads STRIPE_SECRET_KEY from .env.<env> (or the shell). Production refuses a
# test key and staging refuses a live key. A restricted key needs write access
# to Products, Prices, Webhook Endpoints and Customer Portal. Requires curl and jq.

set -eu

ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in
  production)
    PRODUCT_NAME="Bellvel Plus"
    APP_URL="https://bellvel.com"
    KEY_MODE="live"
    ;;
  staging)
    PRODUCT_NAME="ClassPrints Plus"
    APP_URL="https://classprints-web.icianojn.workers.dev"
    KEY_MODE="test"
    ;;
  *)
    echo "usage: scripts/stripe-setup.sh staging|production" >&2
    exit 1
    ;;
esac
WEBHOOK_URL="$APP_URL/api/v1/billing/webhook"

REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.$ENVIRONMENT}"
if [ -f "$ENV_FILE" ] && [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  STRIPE_SECRET_KEY=$(sed -n 's/^STRIPE_SECRET_KEY=//p' "$ENV_FILE" | sed "s/^[\"']//; s/[\"']\$//")
fi
: "${STRIPE_SECRET_KEY:?STRIPE_SECRET_KEY must be set (in $ENV_FILE or the shell)}"
# Secret (sk_) and restricted (rk_) keys both work; the mode must match the env.
case "$STRIPE_SECRET_KEY" in
  "sk_${KEY_MODE}_"* | "rk_${KEY_MODE}_"*) ;;
  *)
    echo "error: $ENVIRONMENT needs an sk_${KEY_MODE}_... or rk_${KEY_MODE}_... key" >&2
    exit 1
    ;;
esac

for tool in curl jq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "error: $tool not found" >&2; exit 1; }
done

stripe() {
  # stripe <METHOD> <PATH> [curl -d args...]
  method=$1
  path=$2
  shift 2
  response=$(curl -gsS -X "$method" "https://api.stripe.com/v1$path" -u "$STRIPE_SECRET_KEY:" "$@")
  if [ "$(printf '%s' "$response" | jq -r 'has("error")')" = "true" ]; then
    echo "error: Stripe $method $path: $(printf '%s' "$response" | jq -r '.error.message')" >&2
    exit 1
  fi
  printf '%s' "$response"
}

echo "==> Stripe setup for: $ENVIRONMENT"
echo

# ---------------------------------------------------------------------------
# Product (fixed ID so re-runs find it).
# ---------------------------------------------------------------------------
PRODUCT_ID="plus"
if curl -sS "https://api.stripe.com/v1/products/$PRODUCT_ID" -u "$STRIPE_SECRET_KEY:" | jq -e '.id' >/dev/null 2>&1; then
  echo "product     : $PRODUCT_ID (exists, skipped)"
else
  stripe POST /products -d id="$PRODUCT_ID" -d name="$PRODUCT_NAME" >/dev/null
  echo "product     : $PRODUCT_ID \"$PRODUCT_NAME\" (created)"
fi

# ---------------------------------------------------------------------------
# Prices. Amounts (USD cents) must match getAvailablePlans() in
# packages/server/src/billing/billing-service.ts.
# ---------------------------------------------------------------------------
ensure_price() {
  # ensure_price <lookup_key> <unit_amount> <interval> <interval_count>
  lookup_key=$1
  existing=$(stripe GET "/prices?lookup_keys[]=$lookup_key&active=true" -G | jq -r '.data[0].id // empty')
  if [ -n "$existing" ]; then
    echo "price       : $lookup_key $existing (exists, skipped)" >&2
    printf '%s' "$existing"
    return
  fi
  created=$(stripe POST /prices \
    -d product="$PRODUCT_ID" \
    -d currency=usd \
    -d unit_amount="$2" \
    -d "recurring[interval]=$3" \
    -d "recurring[interval_count]=$4" \
    -d lookup_key="$lookup_key" | jq -r '.id')
  echo "price       : $lookup_key $created (created)" >&2
  printf '%s' "$created"
}

PRICE_MONTHLY=$(ensure_price plus_monthly 300 month 1)
PRICE_QUARTERLY=$(ensure_price plus_quarterly 700 month 3)
PRICE_ANNUAL=$(ensure_price plus_annual 2100 year 1)
echo

# ---------------------------------------------------------------------------
# Webhook. Events must match handleWebhookEvent() in billing-service.ts, and
# api_version must match the apiVersion BillingService pins in its Stripe client.
# Stripe only reveals the signing secret at creation, so it is written straight
# into the env file and never printed.
# ---------------------------------------------------------------------------
existing_webhook=$(stripe GET "/webhook_endpoints?limit=100" -G \
  | jq -r --arg url "$WEBHOOK_URL" '.data[] | select(.url == $url) | .id' | head -n 1)
if [ -n "$existing_webhook" ]; then
  echo "webhook     : $WEBHOOK_URL ($existing_webhook exists, skipped)"
  echo "              its secret is only shown at creation; if STRIPE_WEBHOOK_SECRET is"
  echo "              missing, roll it in the dashboard (Developers > Webhooks)."
else
  secret=$(stripe POST /webhook_endpoints \
    -d url="$WEBHOOK_URL" \
    -d api_version=2023-10-16 \
    -d "enabled_events[]=checkout.session.completed" \
    -d "enabled_events[]=customer.subscription.created" \
    -d "enabled_events[]=customer.subscription.updated" \
    -d "enabled_events[]=customer.subscription.deleted" \
    -d "enabled_events[]=invoice.payment_succeeded" \
    -d "enabled_events[]=invoice.payment_failed" | jq -r '.secret')
  if [ -f "$ENV_FILE" ] && grep -q '^STRIPE_WEBHOOK_SECRET=' "$ENV_FILE"; then
    tmp=$(mktemp)
    sed "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=$secret|" "$ENV_FILE" >"$tmp"
    cat "$tmp" >"$ENV_FILE"
    rm -f "$tmp"
    echo "webhook     : $WEBHOOK_URL (created; secret written to $ENV_FILE)"
  else
    echo "webhook     : $WEBHOOK_URL (created)"
    echo "error: no STRIPE_WEBHOOK_SECRET= line in $ENV_FILE to write the secret to;" >&2
    echo "       roll the secret in the dashboard and add it by hand." >&2
  fi
fi

# ---------------------------------------------------------------------------
# Customer portal. API-created configurations are never the account default,
# so the backend passes this ID (STRIPE_PORTAL_CONFIGURATION_ID) per session.
# Found again by metadata; an existing one is left as is, so edit it in the
# dashboard (Settings > Billing > Customer portal) or archive it to recreate.
# ---------------------------------------------------------------------------
PORTAL_CONFIG=$(stripe GET "/billing_portal/configurations?active=true&limit=100" -G \
  | jq -r '.data[] | select(.metadata.managed_by == "stripe-setup") | .id' | head -n 1)
if [ -n "$PORTAL_CONFIG" ]; then
  echo "portal      : $PORTAL_CONFIG (exists, skipped)"
else
  PORTAL_CONFIG=$(stripe POST /billing_portal/configurations \
    -d name="$PRODUCT_NAME" \
    -d "metadata[managed_by]=stripe-setup" \
    -d default_return_url="$APP_URL/settings" \
    -d "business_profile[privacy_policy_url]=$APP_URL/privacy-policy" \
    -d "business_profile[terms_of_service_url]=$APP_URL/terms-of-service" \
    -d "features[payment_method_update][enabled]=true" \
    -d "features[invoice_history][enabled]=true" \
    -d "features[subscription_cancel][enabled]=true" \
    -d "features[subscription_cancel][mode]=at_period_end" \
    -d "features[subscription_update][enabled]=true" \
    -d "features[subscription_update][default_allowed_updates][]=price" \
    -d "features[subscription_update][proration_behavior]=create_prorations" \
    -d "features[subscription_update][products][0][product]=$PRODUCT_ID" \
    -d "features[subscription_update][products][0][prices][]=$PRICE_MONTHLY" \
    -d "features[subscription_update][products][0][prices][]=$PRICE_QUARTERLY" \
    -d "features[subscription_update][products][0][prices][]=$PRICE_ANNUAL" | jq -r '.id')
  echo "portal      : $PORTAL_CONFIG (created)"
fi

if [ "$ENVIRONMENT" = "production" ]; then
  section="env.production.vars"
else
  section="top-level vars"
fi
cat <<EOF

==> Paste into apps/seating-backend/wrangler.jsonc ($section):
      "STRIPE_PRICE_PLUS_MONTHLY": "$PRICE_MONTHLY",
      "STRIPE_PRICE_PLUS_QUARTERLY": "$PRICE_QUARTERLY",
      "STRIPE_PRICE_PLUS_ANNUAL": "$PRICE_ANNUAL",
      "STRIPE_PORTAL_CONFIGURATION_ID": "$PORTAL_CONFIG",

Then push the secrets:
      scripts/set-env-secrets.sh $ENVIRONMENT
      scripts/sync-secrets.sh $ENVIRONMENT
EOF
