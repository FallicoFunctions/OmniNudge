extract_boot_asset_paths() {
  local html_file="$1"

  LC_ALL=C perl -ne '
    while (/<script\b[^>]*\bsrc="(\/assets\/[^"]+\.(?:js|mjs))"[^>]*>/g) {
      print "$1\n" unless $seen{$1}++;
    }
    while (/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="(\/assets\/[^"]+\.(?:js|mjs))"[^>]*>/g) {
      print "$1\n" unless $seen{$1}++;
    }
    while (/<link\b[^>]*\bhref="(\/assets\/[^"]+\.(?:js|mjs))"[^>]*\brel="modulepreload"[^>]*>/g) {
      print "$1\n" unless $seen{$1}++;
    }
    while (/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="(\/assets\/[^"]+\.css)"[^>]*>/g) {
      print "$1\n" unless $seen{$1}++;
    }
    while (/<link\b[^>]*\bhref="(\/assets\/[^"]+\.css)"[^>]*\brel="stylesheet"[^>]*>/g) {
      print "$1\n" unless $seen{$1}++;
    }
  ' "$html_file"
}

collect_boot_asset_paths() {
  local html_file="$1"
  local output_file="$2"
  local source_label="$3"
  local raw_file

  raw_file=$(mktemp "${TMPDIR:-/tmp}/omninudge-boot-assets.XXXXXX")
  if ! extract_boot_asset_paths "$html_file" > "$raw_file"; then
    rm -f "$raw_file" "$output_file"
    echo -e "${RED}✗ Failed to extract boot asset paths from ${source_label}${NC}"
    return 1
  fi

  LC_ALL=C sort -u "$raw_file" > "$output_file"
  rm -f "$raw_file"

  if [ ! -s "$output_file" ]; then
    echo -e "${RED}✗ No boot-critical /assets/*.{js,mjs,css} references were found in ${source_label}${NC}"
    rm -f "$output_file"
    return 1
  fi
}

compare_boot_asset_sets() {
  local local_html="$1"
  local public_html="$2"
  local local_asset_file public_asset_file asset_path

  local_asset_file=$(mktemp "${TMPDIR:-/tmp}/omninudge-local-assets.XXXXXX")
  public_asset_file=$(mktemp "${TMPDIR:-/tmp}/omninudge-public-assets.XXXXXX")

  if ! collect_boot_asset_paths "$local_html" "$local_asset_file" "local build HTML (${local_html})"; then
    rm -f "$local_asset_file" "$public_asset_file"
    return 1
  fi

  if ! collect_boot_asset_paths "$public_html" "$public_asset_file" "public HTML (${public_html})"; then
    rm -f "$local_asset_file" "$public_asset_file"
    return 1
  fi

  if ! cmp -s "$local_asset_file" "$public_asset_file"; then
    echo -e "${RED}✗ Live public index.html boot asset set does not match the local build${NC}"
    echo "  - local build boot assets:"
    sed 's/^/    /' "$local_asset_file"
    echo "  - public HTML boot assets:"
    sed 's/^/    /' "$public_asset_file"
    rm -f "$local_asset_file" "$public_asset_file"
    return 1
  fi

  BOOT_ASSET_PATHS=()
  while IFS= read -r asset_path; do
    BOOT_ASSET_PATHS+=("$asset_path")
  done < "$local_asset_file"

  echo -e "${GREEN}✓ Live public index.html boot asset set matches the local build${NC}"
  rm -f "$local_asset_file" "$public_asset_file"
}

verify_public_boot_assets() {
  local base_url="$1"
  shift
  local asset_path asset_status

  if [ "$#" -eq 0 ]; then
    echo -e "${RED}✗ No boot asset paths are available for public verification${NC}"
    return 1
  fi

  echo "  - public boot assets from live index.html and local build:"
  for asset_path in "$@"; do
    asset_status=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "${base_url}${asset_path}" 2>/dev/null || true)
    if [ "${asset_status:-0}" != "200" ]; then
      if [ -z "$asset_status" ] || [ "$asset_status" = "000" ]; then
        echo -e "${RED}✗ Public asset check failed: ${base_url}${asset_path} was unreachable${NC}"
      else
        echo -e "${RED}✗ Public asset check failed: ${base_url}${asset_path} returned HTTP $asset_status${NC}"
      fi
      return 1
    fi
    echo -e "${GREEN}✓ Public asset returned HTTP 200 (${asset_path})${NC}"
  done
}

verify_public_boot_asset_contract() {
  local local_html="$1"
  local public_page_url="$2"
  local public_asset_base_url="$3"
  local public_html_file http_status

  public_html_file=$(mktemp "${TMPDIR:-/tmp}/omninudge-public-index.XXXXXX")
  http_status=$(curl -sS -m 15 -o "$public_html_file" -w "%{http_code}" "$public_page_url" 2>/dev/null || true)

  if [ "${http_status:-0}" != "200" ]; then
    rm -f "$public_html_file"
    if [ -z "$http_status" ] || [ "$http_status" = "000" ]; then
      echo -e "${RED}✗ Public site check failed: ${public_page_url} was unreachable${NC}"
    else
      echo -e "${RED}✗ Public site check failed: ${public_page_url} returned HTTP $http_status${NC}"
    fi
    return 1
  fi
  echo -e "${GREEN}✓ Public site returned HTTP 200${NC}"

  if ! compare_boot_asset_sets "$local_html" "$public_html_file"; then
    rm -f "$public_html_file"
    return 1
  fi

  if ! verify_public_boot_assets "$public_asset_base_url" "${BOOT_ASSET_PATHS[@]}"; then
    rm -f "$public_html_file"
    return 1
  fi

  rm -f "$public_html_file"
}
