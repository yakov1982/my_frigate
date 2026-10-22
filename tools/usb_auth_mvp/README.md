# USB Auth MVP (challenge-response over personal USB key material)

This folder contains a standalone MVP that demonstrates how a personal USB drive can be used to authenticate a specific user in your own apps.

## Important security note

This MVP stores a private key as a file on a USB drive path, which is useful for prototyping only.

For production, replace this with hardware-backed storage (smart card, PIV token, FIDO2 key, TPM-backed cert, or at least encrypted key container + PIN + device attestation).

## What this demo does

1. Enrolls a user and creates:
   - private key + cert in `demo-data/usb/<username>/` (simulated personal USB content)
   - trusted user cert in `demo-data/registry/<username>.cert.pem` (server-side)
2. Auth server issues one-time challenges.
3. Client signs challenge with the user private key from USB path.
4. Server verifies signature and returns a signed session token.

## Folder layout

- `enroll_user.sh` - creates CA, user cert, and USB payload
- `server.py` - minimal HTTP auth service
- `client.py` - demo client that signs challenge with OpenSSL
- `demo-data/` - generated keys/certs/state (created at runtime)

## Prerequisites

- Linux/macOS shell
- Python 3.10+
- OpenSSL CLI available in PATH

## Quick start

Run from this directory:

```bash
cd tools/usb_auth_mvp
./enroll_user.sh alice
python3 server.py --data-dir ./demo-data --host 127.0.0.1 --port 8085
```

In another terminal:

```bash
cd tools/usb_auth_mvp
python3 client.py --username alice --usb-dir ./demo-data/usb/alice --server-url http://127.0.0.1:8085
```

You should receive a token response.

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

## How this maps to your target systems

- **Domain network (AD)**: use certificate-based login (smart card/PIV style) and map cert identities to domain users.
- **Website**: use this challenge-response service as an identity provider and issue short-lived access tokens.
- **Your applications**: verify the same issued token, or call this auth service centrally.

## Next production-hardening steps

1. Move private keys to hardware tokens (non-exportable keys).
2. Add second factor: PIN/passphrase or biometric.
3. Add revocation (CRL/OCSP), certificate rotation, and audit logging.
4. Serve over TLS with mTLS for sensitive environments.
5. Bind token issuance to device fingerprint + risk policy.
