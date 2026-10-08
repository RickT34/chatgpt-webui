#!/usr/bin/env python3
"""Local CONNECT-proxy integration test; uses a temporary CA, no external traffic."""
import hashlib
import http.server
import importlib.util
import io
import os
from pathlib import Path
import select
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = b'proxy download verification\n'
wheel = io.BytesIO()
with zipfile.ZipFile(wheel, 'w') as archive:
    archive.writestr('proxy_smoke/__init__.py', '')
    archive.writestr('proxy_smoke-0.0.1.dist-info/METADATA', 'Metadata-Version: 2.1\nName: proxy-smoke\nVersion: 0.0.1\n')
    archive.writestr('proxy_smoke-0.0.1.dist-info/WHEEL', 'Wheel-Version: 1.0\nGenerator: smoke\nRoot-Is-Purelib: true\nTag: py3-none-any\n')
    archive.writestr('proxy_smoke-0.0.1.dist-info/RECORD', '')


class Target(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        data = wheel.getvalue() if self.path.endswith('.whl') else b'{"ok":true}' if self.path.startswith('/-/ping') else PAYLOAD
        self.send_response(200)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def do_HEAD(self):
        self.do_GET()


class Proxy(http.server.BaseHTTPRequestHandler):
    hits = 0
    target_port = 0

    def log_message(self, *args):
        pass

    def do_CONNECT(self):
        if self.path != f'localhost:{self.target_port}':
            self.send_error(403)
            return
        type(self).hits += 1
        with socket.create_connection(('127.0.0.1', self.target_port)) as target:
            self.send_response(200)
            self.end_headers()
            peers = [self.connection, target]
            while True:
                readable, _, _ = select.select(peers, [], [], 10)
                if not readable:
                    return
                for source in readable:
                    try:
                        data = source.recv(65536)
                        if not data:
                            return
                        (target if source is self.connection else self.connection).sendall(data)
                    except OSError:
                        return


def main():
    with tempfile.TemporaryDirectory(prefix='webui-proxy-test-') as directory:
        tmp = Path(directory)
        cert, key = tmp / 'cert.pem', tmp / 'key.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                        '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
                        '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'extendedKeyUsage=serverAuth',
                        '-keyout', str(key), '-out', str(cert)], check=True, capture_output=True)
        target = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Target)
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(cert, key)
        target.socket = tls.wrap_socket(target.socket, server_side=True)
        Proxy.target_port = target.server_port
        proxy = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Proxy)
        for server in (target, proxy):
            threading.Thread(target=server.serve_forever, daemon=True).start()
        saved = os.environ.copy()
        try:
            clean = {k: v for k, v in saved.items() if 'proxy' not in k.lower()}
            clean.update(ALL_PROXY=f'http://127.0.0.1:{proxy.server_port}', NO_PROXY='', CURL_CA_BUNDLE=str(cert),
                         SSL_CERT_FILE=str(cert), npm_config_cafile=str(cert), npm_config_cache=str(tmp / 'npm'),
                         UV_CACHE_DIR=str(tmp / 'uv'))
            result = subprocess.run(['/bin/sh', '-c', '. "$1"; env -0', 'proxy-test', str(ROOT / 'scripts/proxy.sh')],
                                    env=clean, capture_output=True, check=True)
            env = dict(item.decode().split('=', 1) for item in result.stdout.split(b'\0') if item)
            os.environ.clear()
            os.environ.update(env)
            spec = importlib.util.spec_from_file_location('bootstrap', ROOT / 'scripts/bootstrap.py')
            bootstrap = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(bootstrap)
            bootstrap.ROOT = tmp
            url = f'https://localhost:{target.server_port}'
            bootstrap.download(url + '/download', tmp / 'download', hashlib.sha256(PAYLOAD).hexdigest())
            assert (tmp / 'download').read_bytes() == PAYLOAD and Proxy.hits > 0
            print('PASS: bootstrap download uses ALL_PROXY via CONNECT with TLS and checksum verification')
            before = Proxy.hits
            subprocess.run(['npm', 'ping', '--registry', url], env=env, check=True, capture_output=True)
            assert Proxy.hits > before
            print('PASS: npm uses the same proxy and validates the temporary CA')
            uv = shutil.which('uv') or str(ROOT / '.deps/uv/uv')
            before = Proxy.hits
            uv_result = subprocess.run([uv, '--no-config', 'pip', 'install', '--dry-run', '--target', str(tmp / 'site-packages'),
                            url + '/proxy_smoke-0.0.1-py3-none-any.whl'], env=env, capture_output=True)
            if uv_result.returncode:
                raise RuntimeError(uv_result.stderr.decode())
            assert Proxy.hits > before
            print('PASS: uv fetches a wheel through the same proxy (dry run only)')
            before = Proxy.hits
            os.environ.update(no_proxy='localhost', NO_PROXY='localhost')
            bootstrap.download(url + '/bypass', tmp / 'bypass', hashlib.sha256(PAYLOAD).hexdigest())
            assert Proxy.hits == before
            print('PASS: NO_PROXY bypass is preserved')
        finally:
            os.environ.clear()
            os.environ.update(saved)
            for server in (proxy, target):
                server.shutdown()
                server.server_close()


if __name__ == '__main__':
    main()
