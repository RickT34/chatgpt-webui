import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
KEYS = ['http_proxy', 'https_proxy', 'all_proxy', 'no_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
        'CHATGPT_WEB_PROXY', 'npm_config_proxy', 'npm_config_https_proxy', 'npm_config_noproxy']


class ProxyTests(unittest.TestCase):
    def normalized(self, values, kde=None, gnome=False):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            if kde:
                (folder / 'kioslaverc').write_text(kde)
            # Deterministic desktop provider; no real desktop state is consulted.
            script = '''#!/bin/sh
case "$*" in
"get org.gnome.system.proxy mode") echo "'manual'" ;;
"get org.gnome.system.proxy.http host") echo "'127.0.0.1'" ;;
"get org.gnome.system.proxy.http port") echo 7890 ;;
"get org.gnome.system.proxy ignore-hosts") echo "['localhost', '127.0.0.1']" ;;
*host) echo "''" ;;
*port) echo 0 ;;
esac
''' if gnome else '#!/bin/sh\necho "\047none\047"\n'
            (folder / 'gsettings').write_text(script)
            (folder / 'gsettings').chmod(0o755)
            env = {k: v for k, v in os.environ.items() if k not in KEYS}
            env.update(values, XDG_CONFIG_HOME=str(folder), PATH=str(folder) + os.pathsep + env['PATH'])
            result = subprocess.run(['/bin/sh', '-c', '. "$1"; env -0', 'proxy-test', str(ROOT / 'scripts/proxy.sh')],
                                    env=env, capture_output=True, check=True)
            output = dict(item.decode().split('=', 1) for item in result.stdout.split(b'\0') if item)
            return output, result.stderr.decode()

    def test_uppercase_and_all_proxy(self):
        for values in [{'HTTP_PROXY': 'http://localhost:7890'}, {'ALL_PROXY': 'socks5h://localhost:7891'}]:
            env, _ = self.normalized(values)
            expected = next(iter(values.values()))
            for key in ['http_proxy', 'HTTPS_PROXY', 'https_proxy', 'npm_config_https_proxy']:
                self.assertEqual(env[key], expected)

    def test_case_precedence_and_no_proxy(self):
        env, _ = self.normalized({'https_proxy': 'http://preferred:1', 'HTTPS_PROXY': 'http://ignored:2', 'NO_PROXY': 'localhost,.example.org'})
        self.assertEqual(env['HTTPS_PROXY'], 'http://preferred:1')
        self.assertEqual(env['no_proxy'], 'localhost,.example.org')
        self.assertEqual(env['npm_config_noproxy'], env['no_proxy'])

    def test_override_and_secret_redaction(self):
        proxy = 'http://user:private-test-password@localhost:7890'
        env, log = self.normalized({'CHATGPT_WEB_PROXY': proxy, 'ALL_PROXY': 'http://ignored:1'})
        self.assertEqual(env['HTTPS_PROXY'], proxy)
        self.assertNotIn('private-test-password', log)
        self.assertNotIn('user:', log)
        env, _ = self.normalized({'CHATGPT_WEB_PROXY': '', 'ALL_PROXY': proxy})
        self.assertEqual(env['https_proxy'], '')

    def test_kde_manual_and_env_precedence(self):
        config = '[Proxy Settings]\nProxyType=1\nhttpProxy=http://localhost 7890\nNoProxyFor=localhost,127.0.0.1\n'
        env, _ = self.normalized({}, kde=config)
        self.assertEqual(env['https_proxy'], 'http://localhost:7890')
        env, _ = self.normalized({'HTTPS_PROXY': 'http://custom:1'}, kde=config)
        self.assertEqual(env['https_proxy'], 'http://custom:1')

    def test_gnome_manual(self):
        env, _ = self.normalized({}, gnome=True)
        self.assertEqual(env['https_proxy'], 'http://127.0.0.1:7890')
        self.assertEqual(env['NO_PROXY'], 'localhost,127.0.0.1')


if __name__ == '__main__':
    unittest.main()
