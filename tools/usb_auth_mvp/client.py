#!/usr/bin/env python3
"""Demo client for token-backed USB auth MVP (PKCS#11 signing)."""

from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
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


def resolve_pkcs11_module(module_arg: str | None) -> str:
    if module_arg:
        return module_arg

    default_candidates = (
        "/usr/lib/softhsm/libsofthsm2.so",
        "/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so",
    )
    for path in default_candidates:
        if Path(path).exists():
            return path
    raise RuntimeError(
        "Could not resolve PKCS#11 module path. Pass --pkcs11-module explicitly."
    )


def sign_challenge_via_pkcs11(
    *,
    challenge: bytes,
    pkcs11_module: str,
    token_label: str,
    token_pin: str,
    token_key_id: str,
    softhsm_conf: Path | None,
) -> bytes:
    with tempfile.TemporaryDirectory(prefix="usb-auth-sign-") as tmp:
        tmp_dir = Path(tmp)
        challenge_path = tmp_dir / "challenge.bin"
        signature_path = tmp_dir / "signature.bin"
        challenge_path.write_bytes(challenge)

        cmd = [
            "pkcs11-tool",
            "--module",
            pkcs11_module,
            "--token-label",
            token_label,
            "--login",
            "--pin",
            token_pin,
            "--id",
            token_key_id,
            "--mechanism",
            "SHA256-RSA-PKCS",
            "--sign",
            "--input-file",
            str(challenge_path),
            "--output-file",
            str(signature_path),
        ]
        env = os.environ.copy()
        if softhsm_conf is not None:
            env["SOFTHSM2_CONF"] = str(softhsm_conf)

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )
        if result.returncode != 0:
            raise RuntimeError(
                "PKCS#11 signing failed: "
                + (result.stderr.strip() or result.stdout.strip() or "unknown error")
            )
        return signature_path.read_bytes()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="USB auth MVP token client")
    parser.add_argument("--username", required=True, help="Enrolled username")
    parser.add_argument(
        "--token-label",
        required=True,
        help="PKCS#11 token label (for example: usb-auth-token-alice)",
    )
    parser.add_argument(
        "--token-key-id",
        default="01",
        help="Hex key id inside token (default: 01)",
    )
    parser.add_argument(
        "--token-pin",
        help="Token user PIN. If omitted, uses USB_AUTH_TOKEN_PIN env or interactive prompt.",
    )
    parser.add_argument(
        "--pkcs11-module",
        help="Path to PKCS#11 module. Defaults to common SoftHSM paths.",
    )
    parser.add_argument(
        "--softhsm-conf",
        type=Path,
        help="Path to softhsm2.conf (for demo SoftHSM tokens)",
    )
    parser.add_argument(
        "--server-url",
        default="http://127.0.0.1:8085",
        help="Base URL of auth server",
    )
    parser.add_argument(
        "--token-file",
        type=Path,
        help="Optional file path where issued session token will be saved",
    )
    return parser.parse_args()


def resolve_pin(pin_arg: str | None) -> str:
    if pin_arg:
        return pin_arg
    env_pin = os.getenv("USB_AUTH_TOKEN_PIN")
    if env_pin:
        return env_pin
    return getpass.getpass("Enter token PIN: ")


def main() -> None:
    args = parse_args()
    token_pin = resolve_pin(args.token_pin)
    pkcs11_module = resolve_pkcs11_module(args.pkcs11_module)

    challenge_response = post_json(
        f"{args.server_url.rstrip('/')}/auth/challenge", {"username": args.username}
    )
    challenge_id = challenge_response.get("challenge_id")
    challenge_b64 = challenge_response.get("challenge")
    if not isinstance(challenge_id, str) or not isinstance(challenge_b64, str):
        raise SystemExit(f"Unexpected challenge response: {challenge_response}")

    challenge_bytes = base64.b64decode(challenge_b64.encode("ascii"))
    signature = sign_challenge_via_pkcs11(
        challenge=challenge_bytes,
        pkcs11_module=pkcs11_module,
        token_label=args.token_label,
        token_pin=token_pin,
        token_key_id=args.token_key_id,
        softhsm_conf=args.softhsm_conf,
    )
    signature_b64 = base64.b64encode(signature).decode("ascii")

    verify_response = post_json(
        f"{args.server_url.rstrip('/')}/auth/verify",
        {"challenge_id": challenge_id, "signature": signature_b64},
    )

    token = verify_response.get("token")
    if not isinstance(token, str):
        raise SystemExit(f"Unexpected verify response: {verify_response}")

    print("Authentication successful (token-backed signing).")
    print(f"Token: {token}")
    print(f"Expires in: {verify_response.get('expires_in_seconds')} seconds")

    if args.token_file is not None:
        args.token_file.write_text(token, encoding="utf-8")
        print(f"Session token saved to: {args.token_file}")


if __name__ == "__main__":
    main()
