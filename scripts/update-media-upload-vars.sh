#!/usr/bin/env bash

set -euo pipefail

RESPONSE_FILE="http/media-upload-response.txt"
TARGET_FILE="http/media-upload-flow.http"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage:"
  echo "  ./scripts/update-media-upload-vars.sh [response.txt] [target.http]"
  echo
  echo "Examples:"
  echo "  ./scripts/update-media-upload-vars.sh"
  echo "  ./scripts/update-media-upload-vars.sh http/media-upload-response.txt"
  echo "  ./scripts/update-media-upload-vars.sh http/media-upload-response.txt http/media-upload-flow.http"
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  RESPONSE_FILE="$1"
fi

if [[ -n "${2:-}" ]]; then
  TARGET_FILE="$2"
fi

if [[ ! -f "$RESPONSE_FILE" ]]; then
  echo "Response file not found: $RESPONSE_FILE" >&2
  exit 1
fi

RESPONSE_CONTENT="$(<"$RESPONSE_FILE")"

if [[ -z "$RESPONSE_CONTENT" ]]; then
  echo "Response file is empty: $RESPONSE_FILE" >&2
  exit 1
fi

if [[ ! -f "$TARGET_FILE" ]]; then
  echo "Target file not found: $TARGET_FILE" >&2
  exit 1
fi

MEDIA_ID="$(
  printf '%s' "$RESPONSE_CONTENT" \
    | grep -oE '"mediaId"[[:space:]]*:[[:space:]]*"?[0-9]+' \
    | head -n 1 \
    | grep -oE '[0-9]+$'
)"

UPLOAD_URL="$(
  printf '%s' "$RESPONSE_CONTENT" \
    | grep -oE '"uploadUrl"[[:space:]]*:[[:space:]]*"[^"]+"' \
    | head -n 1 \
    | sed -E 's/^"uploadUrl"[[:space:]]*:[[:space:]]*"//; s/"$//; s#\\/#/#g'
)"

if [[ -z "$MEDIA_ID" || -z "$UPLOAD_URL" ]]; then
  echo "Could not extract mediaId and uploadUrl from the provided response." >&2
  exit 1
fi

TMP_FILE="$(mktemp)"

awk \
  -v media_id="$MEDIA_ID" \
  -v upload_url="$UPLOAD_URL" \
  '
  /^@mediaId = / {
    print "@mediaId = " media_id;
    next;
  }

  /^@uploadUrl = / {
    print "@uploadUrl = " upload_url;
    next;
  }

  {
    print $0;
  }
  ' \
  "$TARGET_FILE" > "$TMP_FILE"

mv "$TMP_FILE" "$TARGET_FILE"

echo "Updated $TARGET_FILE"
echo "  Response file = $RESPONSE_FILE"
echo "  @mediaId = $MEDIA_ID"
echo "  @uploadUrl = $UPLOAD_URL"
