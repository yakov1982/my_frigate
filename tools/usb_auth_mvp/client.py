#!/usr/bin/env python3
"""Demo client for USB auth MVP server."""

from __future__ import annotations

import argparse
import base64
import json
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url=url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {raw}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Request to {url} failed: {exc}") from exc

    try:
        parsed = json.loads(response_body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON response from {url}: {response_body}") from exc

    if not isinstance(parsed, dict):
        raise RuntimeError(f"Unexpected response shape from {url}: {parsed!r}")
    return parsed


def sign_challenge(private_key_path: Path, challenge: bytes) -> bytes:
    with tempfile.TemporaryDirectory(prefix="usb-auth-sign-") as tmp:
        tmp_dir = Path(tmp)
        challenge_path = tmp_dir / "challenge.bin"
        signature_path = tmp_dir / "signature.bin"
        challenge_path.write_bytes(challenge)

        cmd = [
            "openssl",
            "dgst",
            "-sha256",
            "-sign",
            str(private_key_path),
            "-out",
            str(signature_path),
            str(challenge_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise RuntimeError(
                "OpenSSL signing failed: "
                + (result.stderr.strip() or result.stdout.strip() or "unknown error")
            )
        return signature_path.read_bytes()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="USB auth MVP demo client")
    parser.add_argument("--username", required=True, help="Enrolled username")
    parser.add_argument(
        "--usb-dir",
        type=Path,
        required=True,
        help="Path to user USB payload directory (contains user.key.pem)",
    )
    parser.add_argument(
        "--server-url",
        default="http://127.0.0.1:8085",
        help="Base URL of auth server",
    )
    parser.add_argument(
        "--token-file",
        type=Path,
        help="Optional file path where token will be saved",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    private_key_path = args.usb_dir / "user.key.pem"
    if not private_key_path.exists():
        raise SystemExit(f"Private key not found: {private_key_path}")

    challenge_response = post_json(
        f"{args.server_url.rstrip('/')}/auth/challenge", {"username": args.username}
    )
    challenge_id = challenge_response.get("challenge_id")
    challenge_b64 = challenge_response.get("challenge")
    if not isinstance(challenge_id, str) or not isinstance(challenge_b64, str):
        raise SystemExit(f"Unexpected challenge response: {challenge_response}")

    challenge_bytes = base64.b64decode(challenge_b64.encode("ascii"))
    signature = sign_challenge(private_key_path, challenge_bytes)
    signature_b64 = base64.b64encode(signature).decode("ascii")

    verify_response = post_json(
        f"{args.server_url.rstrip('/')}/auth/verify",
        {"challenge_id": challenge_id, "signature": signature_b64},
    )

    token = verify_response.get("token")
    if not isinstance(token, str):
        raise SystemExit(f"Unexpected verify response: {verify_response}")

    print("Authentication successful.")
    print(f"Token: {token}")
    print(f"Expires in: {verify_response.get('expires_in_seconds')} seconds")

    if args.token_file is not None:
        args.token_file.write_text(token, encoding="utf-8")
        print(f"Token saved to: {args.token_file}")


if __name__ == "__main__":
    main()
