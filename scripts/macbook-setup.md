# MacBook setup — backup pull + restore

## 1. Klucz SSH (jednorazowo)

```bash
# Wygeneruj klucz jeśli nie masz:
ssh-keygen -t ed25519 -C "macbook-backup-pull"

# Skopiuj public key na VPS (poda hasło):
ssh-copy-id ubuntu@57.128.249.245

# Test:
ssh ubuntu@57.128.249.245 'echo OK'   # bez hasła
```

## 2. Lokalny folder backup

```bash
mkdir -p ~/MyPerformance-Backups
```

## 3. Skopiuj skrypty z repo

```bash
# Z root repo (myperformance-service):
cp scripts/macbook-backup-pull.sh ~/Library/Application\ Scripts/
cp scripts/macbook-restore.sh ~/MyPerformance-Backups/restore.sh
chmod +x ~/Library/Application\ Scripts/macbook-backup-pull.sh
chmod +x ~/MyPerformance-Backups/restore.sh
```

## 4. LaunchAgent — auto-pull co 6h

```bash
cat > ~/Library/LaunchAgents/com.myperformance.backup-pull.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.myperformance.backup-pull</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>$HOME/Library/Application Scripts/macbook-backup-pull.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict><key>Hour</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>6</integer></dict>
        <dict><key>Hour</key><integer>12</integer></dict>
        <dict><key>Hour</key><integer>18</integer></dict>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/myperf-backup-pull.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/myperf-backup-pull.err</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.myperformance.backup-pull.plist
```

LaunchAgent uruchamia skrypt o 00:00, 06:00, 12:00, 18:00 + przy starcie systemu.
Kombinacja: VPS robi backup o 23:00 → MacBook pull o 00:00 → masz świeży backup.

## 5. Test ręczny

```bash
~/Library/Application\ Scripts/macbook-backup-pull.sh
ls -lh ~/MyPerformance-Backups/
```

## 6. Restore (gdy potrzebny)

```bash
# Lista dostępnych backupów:
ls -1 ~/MyPerformance-Backups/

# Restore:
~/MyPerformance-Backups/restore.sh 2026-04-25_23-00 ubuntu@<NEW_VPS_IP>
```

Skrypt prowadzi przez:
1. SSH check + Docker presence
2. Upload backup'u na nowy VPS (rsync)
3. Restore każdej bazy do odpowiadającego container'a Coolify
4. Restore /data/coolify config + Step-CA + Traefik certs
5. Restart coolify-proxy

## Uwagi bezpieczeństwa

- Backup na MacBook **nie jest szyfrowany** — to surowe dumps DB i config plików. Jeśli chcesz dodatkowy layer:
  ```bash
  # FileVault na całym dysku (Settings → Privacy → FileVault)
  # albo encrypted disk image:
  hdiutil create -encryption AES-256 -size 50g -fs APFS -volname "MyPerf-Backup" ~/MyPerformance-Backups.dmg
  ```
- SSH key bez hasła (z `ssh-keygen` bez passphrase) — pull działa bez interakcji ale klucz znaleziony = pełen dostęp do VPS. **Zalecane**: passphrase + ssh-agent.
- Folder `~/MyPerformance-Backups` ma uprawnienia z umask domyślne — sprawdzić że tylko Twój user ma read.
