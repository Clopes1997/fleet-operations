import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from ipaddress import ip_address
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

parser=argparse.ArgumentParser()
parser.add_argument("output")
args=parser.parse_args()
directory=Path(args.output)
key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,"Disposable Fleet rehearsal")])
now=datetime.now(timezone.utc)
cert=(x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
      .serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(minutes=1))
      .not_valid_after(now+timedelta(days=1))
      .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ip_address("127.0.0.1"))]),critical=False)
      .sign(key,hashes.SHA256()))
with (directory/"tls.key").open("xb") as handle:
    handle.write(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
with (directory/"tls.crt").open("xb") as handle:
    handle.write(cert.public_bytes(serialization.Encoding.PEM))

