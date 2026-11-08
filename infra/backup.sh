#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${BACKUP_DIR:?BACKUP_DIR must be set to a dedicated backup volume}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT must be an age recipient}"
: "${S3_SOURCE:?S3_SOURCE must be an mc alias/bucket}"
: "${S3_DEST:?S3_DEST must be a separate account/region mc alias/bucket}"
: "${MC_ENCRYPTION_KEY:?MC_ENCRYPTION_KEY must be configured for object mirroring}"

case "$BACKUP_DIR" in
  ""|"."|".."|"$PWD"|"$PWD/"*)
    echo "BACKUP_DIR must not be the application working directory" >&2
    exit 2
    ;;
esac

for command in pg_dump pg_dumpall age mc; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 2; }
done

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
if [ "$(stat -c '%a' "$BACKUP_DIR")" != "700" ]; then
  echo "BACKUP_DIR permissions must be 0700" >&2
  exit 2
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
workdir="$(mktemp -d "$BACKUP_DIR/.betna-backup.XXXXXX")"
trap 'rm -rf "$workdir"' EXIT

pg_dump --format=custom --no-owner --file="$workdir/betna.dump" "$DATABASE_URL"
pg_dumpall --globals-only --file="$workdir/globals.sql" "$DATABASE_URL"
age --encrypt --recipient="$BACKUP_AGE_RECIPIENT" --output="$BACKUP_DIR/betna-$stamp.dump.age" "$workdir/betna.dump"
age --encrypt --recipient="$BACKUP_AGE_RECIPIENT" --output="$BACKUP_DIR/globals-$stamp.sql.age" "$workdir/globals.sql"
mc mirror --preserve --overwrite --enc-c "$MC_ENCRYPTION_KEY" "$S3_SOURCE" "$S3_DEST/betna-$stamp"
sha256sum "$BACKUP_DIR/betna-$stamp.dump.age" "$BACKUP_DIR/globals-$stamp.sql.age" > "$BACKUP_DIR/manifest-$stamp.sha256"
chmod 600 "$BACKUP_DIR"/*"$stamp"* "$BACKUP_DIR/manifest-$stamp.sha256"
echo "Backup complete: $stamp"
