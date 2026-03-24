"""Self-signed TLS certificate generation."""

from __future__ import annotations

import datetime
import ipaddress
import logging
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

logger = logging.getLogger(__name__)

_PRIMARY_CERT_DIR = "/run/tls"
_FALLBACK_CERT_DIR = "/tmp/codebox-tls"


def _resolve_cert_dir(cert_dir: str) -> Path:
    """Return a writable cert directory, falling back if needed."""
    path = Path(cert_dir)
    try:
        path.mkdir(parents=True, exist_ok=True)
        # Test write access
        test_file = path / ".write-test"
        test_file.write_text("ok")
        test_file.unlink()
        return path
    except OSError:
        fallback = Path(_FALLBACK_CERT_DIR)
        fallback.mkdir(parents=True, exist_ok=True)
        logger.info("Cannot write to %s, falling back to %s", cert_dir, fallback)
        return fallback


def ensure_tls_certs(cert_dir: str = _PRIMARY_CERT_DIR) -> tuple[str, str]:
    """Ensure self-signed TLS certificates exist and return their paths.

    If certificates already exist at the resolved directory they are reused.
    Otherwise a new RSA key and self-signed certificate are generated.

    Args:
        cert_dir: Preferred directory for storing certs.

    Returns:
        A (cert_path, key_path) tuple of absolute path strings.
    """
    resolved = _resolve_cert_dir(cert_dir)
    cert_path = resolved / "cert.pem"
    key_path = resolved / "key.pem"

    if cert_path.exists() and key_path.exists():
        logger.info("Reusing existing TLS certs at %s", resolved)
        return str(cert_path), str(key_path)

    logger.info("Generating self-signed TLS certificate in %s", resolved)

    # Generate private key
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    # Build certificate
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "codebox-daemon"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "codebox"),
    ])

    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=365))
        .add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
            ]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )

    # Write key
    key_path.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    key_path.chmod(0o600)

    # Write cert
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))

    logger.info("TLS certificate generated: %s", cert_path)
    return str(cert_path), str(key_path)
