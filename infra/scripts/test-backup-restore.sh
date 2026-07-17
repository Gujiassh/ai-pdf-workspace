#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

make_fixture() {
  FIXTURE=$(mktemp -d)
  mkdir -p "$FIXTURE/bin" "$FIXTURE/backup/minio"
  cat > "$FIXTURE/env" <<'EOF'
POSTGRES_DB=ai_pdf_workspace
POSTGRES_USER=ai_pdf
MINIO_ROOT_USER=minio-user
MINIO_ROOT_PASSWORD=minio-password
MINIO_BUCKET=ai-pdf-workspace
EOF
  printf 'not-a-real-dump' > "$FIXTURE/backup/postgres.dump"
  cat > "$FIXTURE/backup/manifest.env" <<'EOF'
FORMAT_VERSION=1
COMPOSE_PROJECT=restore-test
POSTGRES_DB=ai_pdf_workspace
MINIO_BUCKET=ai-pdf-workspace
EOF
  printf 'pdf-bytes' > "$FIXTURE/backup/minio/document.pdf"
  (
    cd "$FIXTURE/backup"
    sha256sum manifest.env postgres.dump minio/document.pdf > SHA256SUMS
  )
  cat > "$FIXTURE/bin/docker-compose" <<'EOF'
#!/usr/bin/env sh
printf 'docker-compose sentinel called\n' >&2
exit 99
EOF
  cat > "$FIXTURE/bin/docker" <<'EOF'
#!/usr/bin/env sh
printf 'docker sentinel called\n' >&2
exit 98
EOF
  chmod +x "$FIXTURE/bin/docker-compose" "$FIXTURE/bin/docker"
}

cleanup_fixture() {
  chmod -R u+w "$FIXTURE" 2>/dev/null || true
  rm -rf "$FIXTURE"
}

prepare_empty_runtime_fixture() {
  local redis_key_count=${1:-0}
  local database_object_count=${2:-0}
  rm "$FIXTURE/backup/minio/document.pdf"
  (
    cd "$FIXTURE/backup"
    sha256sum manifest.env postgres.dump > SHA256SUMS
  )
  cat > "$FIXTURE/bin/docker-compose" <<EOF
#!/usr/bin/env sh
printf 'compose %s\\n' "\$*" >> "\$CALL_LOG"
case "\$*" in
  *" ps -q postgres") printf 'restore-test-postgres\\n' ;;
  *" ps -q minio") printf 'restore-test-minio\\n' ;;
  *" ps -q redis") printf 'restore-test-redis\\n' ;;
  *" ps -q api") printf 'restore-test-api\\n' ;;
  *" ps -q worker") printf 'restore-test-worker\\n' ;;
  *" ps -q web") printf 'restore-test-web\\n' ;;
  *" ps -q caddy") printf 'restore-test-caddy\\n' ;;
  *" exec -T postgres psql "*) printf '${database_object_count}\\n' ;;
  *" exec -T redis redis-cli DBSIZE") printf '${redis_key_count}\\n' ;;
esac
EOF
  cat > "$FIXTURE/bin/docker" <<'EOF'
#!/usr/bin/env sh
printf 'docker %s\n' "$*" >> "$CALL_LOG"
case "$*" in
  *"inspect --format"*"yes"*) printf 'yes\n' ;;
  *"inspect --format"*) printf 'healthy\n' ;;
  *"mc find"*)
    if [ "${FAIL_MINIO_FIND:-0}" = "1" ]; then
      printf 'injected_minio_find_failure\n' >&2
      exit 42
    fi
    printf '0\n'
    ;;
esac
EOF
  chmod +x "$FIXTURE/bin/docker-compose" "$FIXTURE/bin/docker"
}

run_restore_expect_preflight_failure() {
  local expected=$1
  shift
  set +e
  PATH="$FIXTURE/bin:$PATH" "$SCRIPT_DIR/restore-deployment.sh" \
    --env-file "$FIXTURE/env" --project restore-test \
    --backup-dir "$FIXTURE/backup" --confirm "$@" \
    >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  status=$?
  set -e
  [[ $status -ne 0 ]]
  grep -q "$expected" "$FIXTURE/stderr"
  ! grep -Eq 'docker(-compose)? sentinel called' "$FIXTURE/stderr"
}

test_confirmation_gate() {
  make_fixture
  set +e
  PATH="$FIXTURE/bin:$PATH" "$SCRIPT_DIR/restore-deployment.sh" \
    --env-file "$FIXTURE/env" --project restore-test --backup-dir "$FIXTURE/backup" \
    >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  status=$?
  set -e
  [[ $status -eq 2 ]]
  grep -q 'restore_confirmation_required flag=--confirm' "$FIXTURE/stderr"
  ! grep -Eq 'docker(-compose)? sentinel called' "$FIXTURE/stderr"
  cleanup_fixture
}

test_closed_checksum_set() {
  make_fixture
  printf 'unlisted' > "$FIXTURE/backup/minio/unlisted.pdf"
  run_restore_expect_preflight_failure backup_file_set_mismatch
  cleanup_fixture
}

test_symlink_rejected() {
  make_fixture
  ln -s /etc/passwd "$FIXTURE/backup/minio/leak.pdf"
  run_restore_expect_preflight_failure backup_symlink_rejected
  cleanup_fixture
}

test_manifest_project_and_version() {
  make_fixture
  sed -i 's/COMPOSE_PROJECT=restore-test/COMPOSE_PROJECT=another-project/' "$FIXTURE/backup/manifest.env"
  run_restore_expect_preflight_failure backup_project_mismatch
  cleanup_fixture

  make_fixture
  sed -i 's/FORMAT_VERSION=1/FORMAT_VERSION=2/' "$FIXTURE/backup/manifest.env"
  run_restore_expect_preflight_failure backup_format_unsupported
  cleanup_fixture
}

test_invalid_archive_before_docker() {
  make_fixture
  set +e
  PATH="$FIXTURE/bin:$PATH" "$SCRIPT_DIR/restore-deployment.sh" \
    --env-file "$FIXTURE/env" --project restore-test \
    --backup-dir "$FIXTURE/backup" --confirm \
    >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  status=$?
  set -e
  [[ $status -eq 98 ]]
  grep -q 'docker sentinel called' "$FIXTURE/stderr"
  ! grep -q 'docker-compose sentinel called' "$FIXTURE/stderr"
  cleanup_fixture
}

test_readonly_backup_preflight() {
  make_fixture
  chmod -R a-w "$FIXTURE/backup"
  set +e
  PATH="$FIXTURE/bin:$PATH" "$SCRIPT_DIR/restore-deployment.sh" \
    --env-file "$FIXTURE/env" --project restore-test \
    --backup-dir "$FIXTURE/backup" --confirm \
    >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  status=$?
  set -e

  [[ $status -eq 98 ]]
  grep -q 'docker sentinel called' "$FIXTURE/stderr"
  ! find "$FIXTURE/backup" -name '.listed-files' -o -name '.actual-files' | grep -q .
  cleanup_fixture
}

test_success_starts_healthy_redis() {
  make_fixture
  prepare_empty_runtime_fixture 0

  CALL_LOG="$FIXTURE/calls" PATH="$FIXTURE/bin:$PATH" \
    "$SCRIPT_DIR/restore-deployment.sh" \
    --env-file "$FIXTURE/env" --project restore-test \
    --backup-dir "$FIXTURE/backup" --confirm \
    >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"

  grep -q 'restore_complete project=restore-test' "$FIXTURE/stdout"
  grep -q ' up -d postgres minio redis$' "$FIXTURE/calls"
  grep -q ' up -d api worker web caddy$' "$FIXTURE/calls"
  for service in postgres minio redis api worker web caddy; do
    grep -q "docker inspect .* restore-test-$service$" "$FIXTURE/calls"
  done
  cleanup_fixture
}

test_nonempty_redis_rejected_before_application_start() {
  make_fixture
  prepare_empty_runtime_fixture 1
  set +e
  CALL_LOG="$FIXTURE/calls" PATH="$FIXTURE/bin:$PATH" \
    "$SCRIPT_DIR/restore-deployment.sh" \
    --env-file "$FIXTURE/env" --project restore-test \
    --backup-dir "$FIXTURE/backup" --confirm \
    >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  status=$?
  set -e

  [[ $status -ne 0 ]]
  grep -q 'restore_redis_not_empty keys=1' "$FIXTURE/stderr"
  ! grep -q ' up -d api worker web caddy$' "$FIXTURE/calls"
  ! grep -q 'restore_complete' "$FIXTURE/stdout"
  cleanup_fixture
}

test_nonempty_database_rejected_before_restore() {
  make_fixture
  prepare_empty_runtime_fixture 0 1
  set +e
  CALL_LOG="$FIXTURE/calls" PATH="$FIXTURE/bin:$PATH" \
    "$SCRIPT_DIR/restore-deployment.sh" \
    --env-file "$FIXTURE/env" --project restore-test \
    --backup-dir "$FIXTURE/backup" --confirm \
    >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  status=$?
  set -e

  [[ $status -ne 0 ]]
  grep -q 'restore_database_not_empty objects=1' "$FIXTURE/stderr"
  ! grep -q ' exec -T postgres pg_restore ' "$FIXTURE/calls"
  ! grep -q 'restore_complete' "$FIXTURE/stdout"
  cleanup_fixture
}

test_minio_find_failure_rejected_before_restore() {
  make_fixture
  prepare_empty_runtime_fixture 0
  set +e
  FAIL_MINIO_FIND=1 CALL_LOG="$FIXTURE/calls" PATH="$FIXTURE/bin:$PATH" \
    "$SCRIPT_DIR/restore-deployment.sh" \
    --env-file "$FIXTURE/env" --project restore-test \
    --backup-dir "$FIXTURE/backup" --confirm \
    >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  status=$?
  set -e

  [[ $status -eq 42 ]]
  grep -q 'injected_minio_find_failure' "$FIXTURE/stderr"
  ! grep -q ' exec -T postgres pg_restore ' "$FIXTURE/calls"
  ! grep -q ' up -d api worker web caddy$' "$FIXTURE/calls"
  ! grep -q 'restore_complete' "$FIXTURE/stdout"
  cleanup_fixture
}

test_confirmation_gate
test_closed_checksum_set
test_symlink_rejected
test_manifest_project_and_version
test_invalid_archive_before_docker
test_readonly_backup_preflight
test_nonempty_database_rejected_before_restore
test_nonempty_redis_rejected_before_application_start
test_minio_find_failure_rejected_before_restore
test_success_starts_healthy_redis
printf 'backup_restore_unit_tests_passed\n'
