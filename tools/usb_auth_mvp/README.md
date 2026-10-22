# USB Auth MVP (token-backed, no USB mass-storage dependency)

This folder contains a standalone MVP that authenticates users through a token-style cryptographic device interface (PKCS#11), not a USB flash drive filesystem.

## Why this fixes domain USB storage policy issues

In many enterprise domains, Group Policy blocks USB Mass Storage class devices (flash drives) but allows:

- smart cards / PIV tokens (CCID class),
- security keys over HID/WebAuthn,
- TPM-backed virtual smart cards,
- or explicit allow-listed token classes.

This MVP uses PKCS#11 token operations (`login + sign`) and does not read a private key from a mounted USB disk path. That maps to "security token" behavior rather than "flash drive file copy" behavior.

## What this demo does

1. Enrolls a user and creates:
   - a PKCS#11 token (SoftHSM in this MVP) with private key generated inside the token slot,
   - server trust record in `demo-data/registry/<username>.pub.pem`,
   - client token metadata in `demo-data/token-meta/<username>.env`.
2. Auth server issues one-time challenges.
3. Client signs challenge via `pkcs11-tool` using token label + key id + PIN.
4. Server verifies signature with enrolled public key and returns short-lived session token.

## Folder layout

- `enroll_user.sh` - creates demo CA, initializes PKCS#11 token, generates token keypair, exports public key for server trust
- `server.py` - minimal HTTP auth service (challenge + verify + token)
- `client.py` - demo client that signs challenge through PKCS#11 token interface
- `demo-data/` - generated runtime state (ignored by git)

## Prerequisites

- Linux shell (for this local MVP flow)
- Python 3.10+
- OpenSSL CLI
- SoftHSM2 (`softhsm2-util`)
- OpenSC (`pkcs11-tool`)

Install on Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y softhsm2 opensc
```

## Quick start

Run from this directory:

```bash
cd tools/usb_auth_mvp
TOKEN_PIN=123456 ./enroll_user.sh alice
python3 server.py --data-dir ./demo-data --host 127.0.0.1 --port 8085
```

In another terminal:

```bash
cd tools/usb_auth_mvp
python3 client.py \
  --username alice \
  --token-label usb-auth-token-alice \
  --token-key-id 01 \
  --token-pin 123456 \
  --pkcs11-module /usr/lib/softhsm/libsofthsm2.so \
  --softhsm-conf ./demo-data/softhsm/softhsm2.conf \
  --server-url http://127.0.0.1:8085
```

You should receive an auth token response.

## API overview

### `POST /auth/challenge`

Request:

```json
{ "username": "alice" }
```

Response:

```json
{
  "challenge_id": "abc123...",
  "challenge": "base64-nonce",
  "expires_in_seconds": 60
}
```

### `POST /auth/verify`

Request:

```json
{
  "challenge_id": "abc123...",
  "signature": "base64-signature"
}
```

Response:

```json
{
  "token": "<signed-token>",
  "token_type": "Bearer",
  "expires_in_seconds": 900
}
```

### `POST /auth/token/verify`

Request:

```json
{ "token": "<signed-token>" }
```

Response:

```json
{
  "valid": true,
  "username": "alice",
  "exp": 1761111111
}
```

## Linux/Windows token integration options (research summary)

Use this MVP flow as the application layer, then replace SoftHSM with real token transport:

1. **Native hardware token (preferred)**
   - Linux: PC/SC + PKCS#11 (OpenSC/YubiKey PIV/Nitrokey)
   - Windows: Smart Card Minidriver or vendor CSP/KSP + CNG
2. **USB gadget mode (Linux device acting as token)**
   - Present CCID/HID gadget class from SBC/embedded Linux
   - Host sees token class, not mass storage class
3. **VM/remote pass-through**
   - USB redirection (usbip, hypervisor USB passthrough, or vendor remote token proxy)
   - Keep token semantics across virtual boundary
4. **HID/WebAuthn proxy**
   - Device appears as FIDO2/HID security key
   - Browser/app uses WebAuthn or CTAP instead of disk files

## Domain policy alignment notes

- Storage-blocking policy usually targets `USBSTOR` / mass storage class.
- Smart card / HID token classes are controlled by separate policy buckets.
- Therefore, auth via token sign operation can remain allowed where flash drives are denied.

Coordinate exact allow-lists with your AD/GPO team (VID/PID, class GUID, driver policy).

## Next production-hardening steps

1. Replace SoftHSM with physical non-exportable token keys.
2. Enforce PIN entry policy and retry lockout.
3. Add revocation lifecycle (CRL/OCSP), rotation, and audit.
4. Terminate TLS and optionally require mTLS between app tiers.
5. Bind issued sessions to device attestation and risk rules.
