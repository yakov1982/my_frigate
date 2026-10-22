#!/usr/bin/env python3
"""Minimal USB-auth demo server using challenge-response signatures."""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import secrets
import subprocess
import tempfile
import time
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def b64url_decode(encoded: str) -> bytes:
    pad = "=" * ((4 - len(encoded) % 4) % 4)
    return base64.urlsafe_b64decode((encoded + pad).encode("ascii"))


@dataclass
class Challenge:
    username: str
    nonce: bytes
    expires_at: float
    used: bool = False


class AuthState:
    def __init__(
        self,
        data_dir: Path,
        challenge_ttl_seconds: int,
        session_ttl_seconds: int,
        token_secret: str,
    ) -> None:
        self.registry_dir = data_dir / "registry"
        self.challenge_ttl_seconds = challenge_ttl_seconds
        self.session_ttl_seconds = session_ttl_seconds
        self.token_secret = token_secret.encode("utf-8")
        self.challenges: dict[str, Challenge] = {}

    def issue_challenge(self, username: str) -> dict[str, Any]:
        cert_path = self.registry_dir / f"{username}.cert.pem"
        if not cert_path.exists():
            raise KeyError(f"user '{username}' is not enrolled")

        challenge_id = secrets.token_hex(16)
        nonce = secrets.token_bytes(32)
        expires_at = time.time() + self.challenge_ttl_seconds
        self.challenges[challenge_id] = Challenge(
            username=username, nonce=nonce, expires_at=expires_at
        )
        return {
            "challenge_id": challenge_id,
            "challenge": base64.b64encode(nonce).decode("ascii"),
            "expires_in_seconds": self.challenge_ttl_seconds,
        }

    def verify_challenge(self, challenge_id: str, signature_b64: str) -> dict[str, Any]:
        challenge = self.challenges.get(challenge_id)
        if challenge is None:
            raise ValueError("unknown challenge_id")
        if challenge.used:
            raise ValueError("challenge already used")
        if time.time() > challenge.expires_at:
            raise ValueError("challenge expired")

        cert_path = self.registry_dir / f"{challenge.username}.cert.pem"
        signature = base64.b64decode(signature_b64.encode("ascii"))
        valid = self._verify_signature(cert_path, challenge.nonce, signature)
        if not valid:
            raise ValueError("signature verification failed")

        challenge.used = True
        now = int(time.time())
        exp = now + self.session_ttl_seconds
        payload = {"username": challenge.username, "iat": now, "exp": exp}
        token = self._encode_token(payload)
        return {
            "token": token,
            "token_type": "Bearer",
            "expires_in_seconds": self.session_ttl_seconds,
        }

    def verify_token(self, token: str) -> dict[str, Any]:
        payload = self._decode_token(token)
        if int(time.time()) > int(payload["exp"]):
            raise ValueError("token expired")
        return {"valid": True, "username": payload["username"], "exp": payload["exp"]}

    def _encode_token(self, payload: dict[str, Any]) -> str:
        payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode(
            "utf-8"
        )
        sig = hmac.new(self.token_secret, payload_bytes, hashlib.sha256).digest()
        return f"{b64url_encode(payload_bytes)}.{b64url_encode(sig)}"

    def _decode_token(self, token: str) -> dict[str, Any]:
        parts = token.split(".")
        if len(parts) != 2:
            raise ValueError("invalid token format")
        payload_bytes = b64url_decode(parts[0])
        expected_sig = hmac.new(self.token_secret, payload_bytes, hashlib.sha256).digest()
        provided_sig = b64url_decode(parts[1])
        if not hmac.compare_digest(expected_sig, provided_sig):
            raise ValueError("invalid token signature")
        payload = json.loads(payload_bytes.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("invalid token payload")
        if "username" not in payload or "exp" not in payload:
            raise ValueError("missing token fields")
        return payload

    @staticmethod
    def _verify_signature(cert_path: Path, message: bytes, signature: bytes) -> bool:
        if not cert_path.exists():
            return False

        with tempfile.TemporaryDirectory(prefix="usb-auth-verify-") as tmp:
            tmp_dir = Path(tmp)
            message_path = tmp_dir / "message.bin"
            signature_path = tmp_dir / "signature.bin"
            pubkey_path = tmp_dir / "pubkey.pem"

            message_path.write_bytes(message)
            signature_path.write_bytes(signature)

            extract_pubkey = subprocess.run(
                [
                    "openssl",
                    "x509",
                    "-in",
                    str(cert_path),
                    "-pubkey",
                    "-noout",
                    "-out",
                    str(pubkey_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            if extract_pubkey.returncode != 0:
                return False

            verify_cmd = subprocess.run(
                [
                    "openssl",
                    "dgst",
                    "-sha256",
                    "-verify",
                    str(pubkey_path),
                    "-signature",
                    str(signature_path),
                    str(message_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            return verify_cmd.returncode == 0


class AuthHandler(BaseHTTPRequestHandler):
    state: AuthState
    server_version = "usb-auth-mvp/0.1"

    def do_GET(self) -> None:  # noqa: N802 - part of BaseHTTPRequestHandler API
        if self.path == "/health":
            self._send_json(HTTPStatus.OK, {"status": "ok"})
            return
        self._send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802 - part of BaseHTTPRequestHandler API
        try:
            payload = self._parse_json()
        except ValueError as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return

        if self.path == "/auth/challenge":
            username = payload.get("username")
            if not isinstance(username, str) or not username.strip():
                self._send_json(
                    HTTPStatus.BAD_REQUEST, {"error": "field 'username' is required"}
                )
                return
            try:
                response = self.state.issue_challenge(username.strip())
                self._send_json(HTTPStatus.OK, response)
            except KeyError as exc:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": str(exc)})
            return

        if self.path == "/auth/verify":
            challenge_id = payload.get("challenge_id")
            signature = payload.get("signature")
            if not isinstance(challenge_id, str) or not isinstance(signature, str):
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"error": "fields 'challenge_id' and 'signature' are required"},
                )
                return
            try:
                response = self.state.verify_challenge(challenge_id, signature)
                self._send_json(HTTPStatus.OK, response)
            except ValueError as exc:
                self._send_json(HTTPStatus.UNAUTHORIZED, {"error": str(exc)})
            return

        if self.path == "/auth/token/verify":
            token = payload.get("token")
            if not isinstance(token, str):
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "field 'token' is required"})
                return
            try:
                response = self.state.verify_token(token)
                self._send_json(HTTPStatus.OK, response)
            except ValueError as exc:
                self._send_json(HTTPStatus.UNAUTHORIZED, {"error": str(exc)})
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def log_message(self, format: str, *args: Any) -> None:
        # Keep default request logs concise in demo mode.
        print(f"[{self.log_date_time_string()}] {format % args}")

    def _parse_json(self) -> dict[str, Any]:
        content_length_header = self.headers.get("Content-Length")
        if content_length_header is None:
            raise ValueError("missing Content-Length header")
        try:
            content_length = int(content_length_header)
        except ValueError as exc:
            raise ValueError("invalid Content-Length header") from exc
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("invalid JSON body") from exc
        if not isinstance(payload, dict):
            raise ValueError("JSON body must be an object")
        return payload

    def _send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="USB auth MVP server")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "demo-data",
        help="Directory containing registry and PKI data",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Bind host")
    parser.add_argument("--port", type=int, default=8085, help="Bind port")
    parser.add_argument(
        "--challenge-ttl",
        type=int,
        default=60,
        help="Challenge lifetime in seconds",
    )
    parser.add_argument(
        "--session-ttl",
        type=int,
        default=900,
        help="Session token lifetime in seconds",
    )
    parser.add_argument(
        "--token-secret",
        default="change-me-in-production",
        help="HMAC secret used to sign demo tokens",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    state = AuthState(
        data_dir=args.data_dir,
        challenge_ttl_seconds=args.challenge_ttl,
        session_ttl_seconds=args.session_ttl,
        token_secret=args.token_secret,
    )

    handler_class = AuthHandler
    handler_class.state = state

    server = ThreadingHTTPServer((args.host, args.port), handler_class)
    print(f"USB auth MVP server listening on http://{args.host}:{args.port}")
    print(f"Registry directory: {state.registry_dir}")
    server.serve_forever()


if __name__ == "__main__":
    main()
