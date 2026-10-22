#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <username> [data_dir]"
  exit 1
fi

USERNAME="$1"
DATA_DIR="${2:-$(pwd)/demo-data}"

for cmd in openssl softhsm2-util pkcs11-tool; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command not found in PATH: $cmd"
    exit 1
  fi
done

PKI_DIR="$DATA_DIR/pki"
REGISTRY_DIR="$DATA_DIR/registry"
SOFTHSM_DIR="$DATA_DIR/softhsm"
TOKEN_META_DIR="$DATA_DIR/token-meta"

CA_KEY="$PKI_DIR/ca.key.pem"
CA_CERT="$PKI_DIR/ca.cert.pem"
CA_SERIAL="$PKI_DIR/ca.srl"

REGISTRY_PUBKEY="$REGISTRY_DIR/$USERNAME.pub.pem"
TOKEN_META_FILE="$TOKEN_META_DIR/$USERNAME.env"
SOFTHSM_CONF="$SOFTHSM_DIR/softhsm2.conf"

TOKEN_LABEL_PREFIX="${TOKEN_LABEL_PREFIX:-usb-auth-token}"
TOKEN_LABEL="$TOKEN_LABEL_PREFIX-$USERNAME"
TOKEN_KEY_LABEL="${TOKEN_KEY_LABEL:-auth-key}"
TOKEN_KEY_ID="${TOKEN_KEY_ID:-01}"
TOKEN_PIN="${TOKEN_PIN:-123456}"
TOKEN_SO_PIN="${TOKEN_SO_PIN:-12345678}"
PKCS11_MODULE="${PKCS11_MODULE:-/usr/lib/softhsm/libsofthsm2.so}"

if [[ ! -f "$PKCS11_MODULE" ]]; then
  if [[ -f "/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so" ]]; then
    PKCS11_MODULE="/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so"
  else
    echo "Error: SoftHSM module not found. Set PKCS11_MODULE explicitly."
    exit 1
  fi
fi

mkdir -p "$PKI_DIR" "$REGISTRY_DIR" "$SOFTHSM_DIR/tokens" "$TOKEN_META_DIR"

cat >"$SOFTHSM_CONF" <<EOF
directories.tokendir = $SOFTHSM_DIR/tokens
objectstore.backend = file
log.level = ERROR
EOF
chmod 600 "$SOFTHSM_CONF"
export SOFTHSM2_CONF="$SOFTHSM_CONF"

if [[ ! -f "$CA_KEY" || ! -f "$CA_CERT" ]]; then
  echo "[*] Creating demo CA..."
  openssl genrsa -out "$CA_KEY" 4096 >/dev/null 2>&1
  openssl req \
    -x509 \
    -new \
    -key "$CA_KEY" \
    -sha256 \
    -days 3650 \
    -out "$CA_CERT" \
    -subj "/CN=USB Auth Demo Root CA" >/dev/null 2>&1
fi

if softhsm2-util --show-slots | grep -F "Label:            $TOKEN_LABEL" >/dev/null 2>&1; then
  echo "Error: token label '$TOKEN_LABEL' already exists."
  echo "Choose another username or TOKEN_LABEL_PREFIX, or remove existing token data in $SOFTHSM_DIR."
  exit 1
fi

echo "[*] Initializing software token '$TOKEN_LABEL'..."
softhsm2-util \
  --init-token \
  --free \
  --label "$TOKEN_LABEL" \
  --so-pin "$TOKEN_SO_PIN" \
  --pin "$TOKEN_PIN" >/dev/null

echo "[*] Generating non-exportable private key inside token..."
pkcs11-tool \
  --module "$PKCS11_MODULE" \
  --token-label "$TOKEN_LABEL" \
  --login \
  --pin "$TOKEN_PIN" \
  --keypairgen \
  --key-type rsa:3072 \
  --id "$TOKEN_KEY_ID" \
  --label "$TOKEN_KEY_LABEL" \
  --usage-sign >/dev/null

echo "[*] Exporting user public key from token..."
tmp_pub_der="$(mktemp)"
trap 'rm -f "$tmp_pub_der"' EXIT

pkcs11-tool \
  --module "$PKCS11_MODULE" \
  --token-label "$TOKEN_LABEL" \
  --login \
  --pin "$TOKEN_PIN" \
  --read-object \
  --type pubkey \
  --id "$TOKEN_KEY_ID" \
  --output-file "$tmp_pub_der" >/dev/null

openssl pkey \
  -pubin \
  -inform DER \
  -in "$tmp_pub_der" \
  -out "$REGISTRY_PUBKEY" >/dev/null 2>&1

chmod 644 "$REGISTRY_PUBKEY" "$CA_CERT"

cat >"$TOKEN_META_FILE" <<EOF
USERNAME=$USERNAME
TOKEN_LABEL=$TOKEN_LABEL
TOKEN_KEY_ID=$TOKEN_KEY_ID
TOKEN_KEY_LABEL=$TOKEN_KEY_LABEL
PKCS11_MODULE=$PKCS11_MODULE
SOFTHSM2_CONF=$SOFTHSM_CONF
EOF
chmod 600 "$TOKEN_META_FILE"

cat <<EOF

Enrollment complete.

User: $USERNAME
Token type: PKCS#11 software token (smart-card style)
Token label: $TOKEN_LABEL
Key id: $TOKEN_KEY_ID
Key label: $TOKEN_KEY_LABEL

Token runtime metadata (for client):
  - $TOKEN_META_FILE

Server trust registry entry:
  - $REGISTRY_PUBKEY

Demo CA cert:
  - $CA_CERT

Important:
- This flow does NOT use USB mass-storage.
- In production replace SoftHSM with hardware token (PIV/FIDO2/smart card).
- Keep TOKEN_PIN secret. You can override it by exporting TOKEN_PIN before running.

EOF
