#!/usr/bin/env python3
"""Create production secrets once; validate configuration without printing it."""
import argparse
import ast
import ipaddress
import os
from pathlib import Path
import re
import secrets
import sys

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--domain')
parser.add_argument('--email')
parser.add_argument('--file', type=Path, default=ROOT / '.env.production')
parser.add_argument('--check', action='store_true')
parser.add_argument('--print-domain', action='store_true')
parser.add_argument('--print-admin-domain', action='store_true')
args = parser.parse_args()

def configured_google_client_id():
    value = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '').strip()
    if value:
        return value
    local_env = ROOT / '.env'
    if not local_env.exists():
        return ''
    for line in local_env.read_text(encoding='utf-8').splitlines():
        key, separator, raw_value = line.partition('=')
        if separator and key.strip() == 'GOOGLE_OAUTH_CLIENT_ID':
            raw_value = raw_value.strip()
            try:
                return str(ast.literal_eval(raw_value)) if raw_value.startswith(("'", '"')) else raw_value
            except (SyntaxError, ValueError):
                return ''
    return ''

if not args.file.exists():
    if args.check or not args.domain or not args.email:
        parser.error('Initialize with --domain YOUR_DOMAIN --email YOUR_EMAIL, then configure SMTP and backup storage.')
    values = dict(APP_DOMAIN=args.domain, ACME_EMAIL=args.email, RELEASE_TAG='local', TZ='Africa/Dar_es_Salaam')
    for key in ['POSTGRES_PASSWORD', 'DB_APP_PASSWORD', 'DB_PLATFORM_PASSWORD', 'DB_READONLY_PASSWORD', 'REDIS_PASSWORD', 'JWT_SECRET', 'SIGN_CERT_PASSWORD', 'ONSITE_SECRETS_KEY', 'FILE_SIGNING_SECRET', 'RESTIC_PASSWORD']:
        values[key] = secrets.token_hex(32)
    values.update(SMTP_HOST='', SMTP_PORT='587', SMTP_USER='', SMTP_PASS='', SMTP_FROM=f'Hudumika <noreply@{args.domain}>', BACKUP_REPOSITORY='', BACKUP_ACCESS_KEY='', BACKUP_SECRET_KEY='', SMS_WEBHOOK_SECRET='', GOOGLE_OAUTH_CLIENT_ID=configured_google_client_id())
    args.file.parent.mkdir(parents=True, exist_ok=True)
    # Generated values contain no quotes; single quotes also keep dollar
    # signs literal when administrators subsequently enter provider passwords.
    text = '# Private production configuration. Keep an offline recovery copy.\n' + ''.join(f"{key}='{value}'\n" for key, value in values.items())
    descriptor = os.open(args.file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as output:
        output.write(text)
    print(f'Created {args.file}. Secrets were not printed. Configure SMTP and off-server backup storage before deployment.')
elif not args.check and not args.print_domain and not args.print_admin_domain:
    print(f'Preserved existing {args.file}; secrets were not regenerated.')

values = {}
for line in args.file.read_text(encoding='utf-8').splitlines():
    if not line.strip() or line.lstrip().startswith('#'):
        continue
    key, separator, value = line.partition('=')
    if not separator or not re.fullmatch(r'[A-Z][A-Z0-9_]*', key) or key in values:
        parser.error('Invalid or duplicate configuration key.')
    try:
        values[key] = ast.literal_eval(value) if value.startswith(("'", '"')) else value
    except (SyntaxError, ValueError):
        parser.error(f'Invalid quoting for {key}.')

if args.check or args.print_domain or args.print_admin_domain:
    required = ['APP_DOMAIN', 'ACME_EMAIL', 'POSTGRES_PASSWORD', 'DB_APP_PASSWORD', 'DB_PLATFORM_PASSWORD', 'DB_READONLY_PASSWORD', 'REDIS_PASSWORD', 'JWT_SECRET', 'SIGN_CERT_PASSWORD', 'ONSITE_SECRETS_KEY', 'FILE_SIGNING_SECRET', 'RESTIC_PASSWORD', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'BACKUP_REPOSITORY', 'BACKUP_ACCESS_KEY', 'BACKUP_SECRET_KEY']
    missing = [key for key in required if not isinstance(values.get(key), str) or not values[key].strip()]
    if missing:
        sys.exit('Required configuration is missing: ' + ', '.join(missing))
    def public_hostname(name):
        return bool(re.fullmatch(r'(?=.{4,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,63}', name)) and not name.endswith(('.invalid', '.local', '.test', '.localhost', '.example.com')) and name != 'example.com'
    domain = values['APP_DOMAIN']
    if not public_hostname(domain):
        sys.exit('APP_DOMAIN must be your public DNS hostname, without a scheme or path.')
    # Staff console host (docs/STAFF_CONSOLE.md). Off unless ADMIN_DOMAIN is set;
    # when on, the network allow-list and the public API's surface must match it.
    admin_domain = (values.get('ADMIN_DOMAIN') or '').strip()
    surface = (values.get('API_SURFACE') or 'all').strip()
    if admin_domain:
        if not public_hostname(admin_domain) or admin_domain == domain:
            sys.exit('ADMIN_DOMAIN must be its own public DNS hostname, different from APP_DOMAIN.')
        cidrs = (values.get('ADMIN_ALLOWED_CIDRS') or '').split()
        if not cidrs:
            sys.exit('ADMIN_ALLOWED_CIDRS must list the staff networks allowed to reach ADMIN_DOMAIN, separated by spaces.')
        for cidr in cidrs:
            try:
                network = ipaddress.ip_network(cidr, strict=False)
            except ValueError:
                sys.exit(f'ADMIN_ALLOWED_CIDRS contains an invalid network: {cidr}')
            if network.prefixlen == 0:
                sys.exit('ADMIN_ALLOWED_CIDRS must not allow every address.')
        if surface != 'customer':
            sys.exit("API_SURFACE must be 'customer' when ADMIN_DOMAIN is set, so the public API refuses staff routes.")
    elif surface != 'all':
        sys.exit("API_SURFACE must stay 'all' (or unset) until ADMIN_DOMAIN is configured; otherwise staff lose the console.")
    for key in ['POSTGRES_PASSWORD', 'DB_APP_PASSWORD', 'DB_PLATFORM_PASSWORD', 'DB_READONLY_PASSWORD', 'REDIS_PASSWORD', 'ONSITE_SECRETS_KEY']:
        if not re.fullmatch('[a-fA-F0-9]{64}', values[key]):
            sys.exit(f'{key} must retain a generated 32-byte hexadecimal secret.')
    if not values['BACKUP_REPOSITORY'].startswith('s3:https://'):
        sys.exit('BACKUP_REPOSITORY must point to your HTTPS S3-compatible off-server repository.')
    for key in ['JWT_SECRET', 'SIGN_CERT_PASSWORD', 'FILE_SIGNING_SECRET', 'RESTIC_PASSWORD']:
        if len(values[key]) < 32:
            sys.exit(f'{key} must contain at least 32 characters.')
    if os.name != 'nt' and args.file.stat().st_mode & 0o077:
        sys.exit('The production configuration must have mode 600: chmod 600 .env.production')
    print(domain if args.print_domain else admin_domain if args.print_admin_domain else 'Production configuration passed validation; no secrets printed.')
