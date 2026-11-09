# Contabo launch

This is a single-VPS deployment of the existing Hudumika applications: compiled Node API, built React frontend, PostgreSQL, Redis, ClamAV and Caddy. Database/Redis/scanner/API ports are private. The API runs as a non-root user and uses the restricted database role. Uploads, signing identities, database state and TLS certificates survive container replacement.

## One-time setup

Use a Linux VPS with Docker Engine, the Compose plugin, Python 3, curl and systemd. Install Docker using its [Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Provide sufficient memory and disk for the build, scanner and production workload; measure the intended workload on the chosen VPS before accepting traffic.

1. Clone the repository into a path without spaces, for example `/opt/hudumika`.
2. Point the application domain's A record to the VPS. Add an AAAA record only when IPv6 works on this server. Allow inbound HTTP/HTTPS (80 and 443) and your configured SSH port through both host and Contabo firewalls. Do not expose PostgreSQL, Redis, the API or ClamAV ports.
3. Generate the private configuration:

   ```bash
   python3 deploy/contabo/init.py --domain hudumika.tz --email YOUR_CERTIFICATE_EMAIL
   ```

   This creates `.env.production` with independent random secrets and restrictive permissions. Re-running it preserves existing secrets. Keep a secure offline recovery copy: changing encryption/signing keys after launch can make existing data or identities unusable.

4. Edit `.env.production` and enter real SMTP credentials and an off-server S3-compatible backup repository. Quote values with single quotes, especially passwords containing dollar signs. Never commit this file.

   To keep Ondi's Google sign-in working on a fresh cloud database, `init.py` copies `GOOGLE_OAUTH_CLIENT_ID` from the process environment or the local root `.env` into `.env.production`. If initializing directly on the VPS, set the variable there or copy the client ID from local Platform Settings → Ondi SSO before deploying. The API uses the database setting when present and this environment value as the deployment fallback. This flow uses no Google client secret. In Google Cloud Console, add `https://hudumika.tz` as an authorized JavaScript origin for the same OAuth client before switching DNS; otherwise Google rejects sign-in from the VPS domain.

   Required provider settings: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `BACKUP_REPOSITORY`, `BACKUP_ACCESS_KEY`, `BACKUP_SECRET_KEY`. `BACKUP_REGION` is optional and defaults to `us-east-1`.

   The backup repository format is `s3:https://YOUR_S3_ENDPOINT/YOUR_BUCKET/hudumika`. Obtain the endpoint and credentials from your storage provider. Contabo publishes its regional endpoints and credential location in its [connection settings](https://help.contabo.com/en/support/solutions/articles/103000411092-object-storage-s3-compatibility-protocols-and-connection-settings). Restic documents the [S3-compatible repository format](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#s3-compatible-storage).

## Launch and subsequent updates

```bash
sudo bash deploy/contabo/deploy.sh
```

The command validates settings, builds images, waits for dependencies, initializes upload permissions, makes an encrypted off-server backup, runs migrations, replaces published database role passwords, checks database privileges and SMTP TLS/authentication, makes a new backup and restores its database into an isolated temporary database. It then starts the application, verifies public HTTPS and installs a daily backup timer. SMTP verification does not send an email.

Initial builds can take many minutes for this repository and need substantially more memory than an idle API process. Measure the build on the selected host before scheduling a launch window. Deployment and scheduled backups share a lock, so they cannot run concurrently.

The script does **not** run demo seeds or create accounts with published passwords. Use the application's onboarding flow to establish the first real workspace and administrators.

Caddy [obtains and renews HTTPS certificates](https://caddyserver.com/docs/automatic-https) once DNS and inbound connectivity are correct. App, database and queue containers restart automatically after failures/reboots when Docker starts at boot. ClamAV must be healthy; upload scanning is required. Only the proxy is trusted to supply the visitor's IP (`TRUST_PROXY=1`). Do not publish the API port directly.

## Backups and rollback

- The systemd timer runs at 03:15 in the **host's timezone**, with a short randomized delay; missed runs execute after reboot. Check it with `systemctl list-timers hudumika-backup.timer` and inspect failures with `journalctl -u hudumika-backup.service`.
- Backups contain a PostgreSQL custom-format dump, database role definitions, uploads/signing identities and the private configuration. Restic encrypts them before transmission. Retention is 14 daily, eight weekly and 12 monthly snapshots.
- Each deployment downloads the latest encrypted database dump and restores it into a uniquely named test database, then drops only that temporary database. It never restores over the live database automatically.
- Live database and upload backups are separate snapshots. For a strictly consistent application recovery point, stop application writes during the backup and validate uploaded-file references during the recovery drill. A VPS snapshot alone is not an off-server recovery copy.
- Previous application images are tagged `hudumika-api:rollback` and `hudumika-web:rollback`. A failed application rollout attempts to restore them. To perform the same rollback manually:

  ```bash
  sudo docker compose --env-file .env.production -f deploy/contabo/compose.yaml -f deploy/contabo/rollback.yaml up -d --no-build api gateway
  ```

  Schema migrations are retained. Image rollback requires schema compatibility; database recovery is an explicit maintenance operation using the verified snapshot, never an automatic overwrite.

## Launch acceptance

Confirm real onboarding/email delivery, external provider callbacks, employee/manager role boundaries, payroll approval/payment and financial reconciliation on staging. Test the expected concurrency and a sustained run on the actual VPS. Optional providers (SMS, WhatsApp, bank/tax integrations, OAuth and document conversion) require their real credentials/configuration; this deployment does not fabricate them.

Read `docs/audits/NEXUSHR_RELEASE_READINESS_2026-10-27.md` for application verification and remaining platform failures. Deployment automation is not a blanket production certification.

Local verification performed: Compose configuration parsed, shell scripts passed syntax checks, secret generation/validation worked, compiled API/browser checks passed, and all 655 migrations succeeded on a disposable empty database. A Linux Docker image build and the real S3/TLS/SMTP/restore steps still require a running Docker engine and configured hosting credentials. The local Docker Desktop Linux engine was unavailable during preparation.
