#!/bin/bash
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run this installer with sudo.' >&2; exit 1; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ "$root" != *' '* ]] || { echo 'Use a deployment path without spaces.' >&2; exit 1; }
cat > /etc/systemd/system/hudumika-backup.service <<EOF
[Unit]
Description=Encrypted Hudumika database and upload backup
After=docker.service network-online.target
Requires=docker.service
[Service]
Type=oneshot
WorkingDirectory=$root
ExecStart=/bin/bash $root/deploy/contabo/backup.sh
EOF
cat > /etc/systemd/system/hudumika-backup.timer <<'EOF'
[Unit]
Description=Daily Hudumika backup
[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
RandomizedDelaySec=300
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now hudumika-backup.timer
systemctl list-timers hudumika-backup.timer --no-pager
