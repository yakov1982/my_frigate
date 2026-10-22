#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <username> [data_dir]"
  exit 1
fi

USERNAME="$1"
DATA_DIR="${2:-$(pwd)/demo-data}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: openssl command not found in PATH."
  exit 1
fi

PKI_DIR="$DATA_DIR/pki"
USB_DIR="$DATA_DIR/usb/$USERNAME"
REGISTRY_DIR="$DATA_DIR/registry"

CA_KEY="$PKI_DIR/ca.key.pem"
CA_CERT="$PKI_DIR/ca.cert.pem"
CA_SERIAL="$PKI_DIR/ca.srl"

USER_KEY="$USB_DIR/user.key.pem"
USER_CSR="$USB_DIR/user.csr.pem"
USER_CERT="$USB_DIR/user.cert.pem"
REGISTRY_CERT="$REGISTRY_DIR/$USERNAME.cert.pem"

mkdir -p "$PKI_DIR" "$USB_DIR" "$REGISTRY_DIR"

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

echo "[*] Creating key for user '$USERNAME'..."
openssl genrsa -out "$USER_KEY" 3072 >/dev/null 2>&1

echo "[*] Creating CSR for user '$USERNAME'..."
openssl req \
  -new \
  -key "$USER_KEY" \
  -out "$USER_CSR" \
  -subj "/CN=$USERNAME" >/dev/null 2>&1

echo "[*] Signing user certificate..."
openssl x509 \
  -req \
  -in "$USER_CSR" \
  -CA "$CA_CERT" \
  -CAkey "$CA_KEY" \
  -CAserial "$CA_SERIAL" \
  -CAcreateserial \
  -out "$USER_CERT" \
  -days 825 \
  -sha256 >/dev/null 2>&1

cp "$USER_CERT" "$REGISTRY_CERT"
chmod 600 "$USER_KEY"
chmod 644 "$USER_CERT" "$REGISTRY_CERT" "$CA_CERT"

cat <<EOF

Enrollment complete.

User: $USERNAME
USB payload: $USB_DIR
  - user.key.pem
  - user.cert.pem

Server trust registry entry:
  - $REGISTRY_CERT

Demo CA cert:
  - $CA_CERT

EOF
