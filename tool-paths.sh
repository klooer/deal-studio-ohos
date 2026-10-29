#!/usr/bin/env bash
# Where the toolchain lives, without naming anybody's home directory.
#
# Every script here had a path baked into it from whichever machine it was last
# edited on -- and not the same machine, so build-hap.sh pointed at one home
# directory and sign-system.sh at another, and neither pair worked at once.
#
# The environment variable still wins, so nothing that already sets KIT_ROOT,
# HDC_DIR or HAPSIGNER changes behaviour. What changed is the fallback: it looks
# for the thing instead of asserting where it is, and says which variable to set
# when it cannot find it, rather than failing later with "no such file".
#
# Every candidate below is relative to $HOME. No absolute home directory belongs
# in a shared repository: it names one person, means nothing to anyone else, and
# the $HOME form already covers that person -- a kit sitting directly in
# someone's home is $HOME/ArkTS_Agent_Kit when that someone runs the script.
#
# One layout detail worth knowing: the kit's executables are not always in the
# same place. An unpacked kit puts them in tools/, a pip install in .venv/bin.
# These look for the binary, not the directory.

# An explicitly set KIT_ROOT is an instruction, not a hint: if the kit is named
# and the binary is not in it, say so rather than quietly using a different kit,
# which would turn a typo into a mysterious build against the wrong toolchain.
vera_kit_roots() {
  if [ -n "${KIT_ROOT:-}" ]; then
    printf '%s\n' "$KIT_ROOT"
    return 0
  fi
  printf '%s\n' \
    "$HOME/work/arkts_agent_kit" \
    "$HOME/arkts_agent_kit" \
    "$HOME/ArkTS_Agent_Kit" \
    "$HOME/tools/arkts-kit"
}

# vera_kit_bin <executable>  ->  prints an absolute path, or fails with a note
vera_kit_bin() {
  local exe="$1" root sub
  while IFS= read -r root; do
    [ -n "$root" ] || continue
    for sub in tools .venv/bin bin; do
      if [ -x "$root/$sub/$exe" ]; then
        printf '%s\n' "$root/$sub/$exe"
        return 0
      fi
    done
  done < <(vera_kit_roots)
  if [ -z "${KIT_ROOT:-}" ] && command -v "$exe" >/dev/null 2>&1; then
    command -v "$exe"
    return 0
  fi
  # One line per error, so a caller that keeps only the last line still sees
  # the word ERROR and the name of the variable to set.
  if [ -n "${KIT_ROOT:-}" ]; then
    echo "ERROR: KIT_ROOT is $KIT_ROOT but $exe is not in it (looked in tools/, .venv/bin/, bin/)." >&2
  else
    echo "ERROR: cannot find $exe. Set KIT_ROOT to the ArkTS Agent Kit, or put $exe on PATH." >&2
  fi
  return 1
}

# The directory holding hdc, for scripts that add it to PATH.
vera_hdc_dir() {
  local d
  if [ -n "${HDC_DIR:-}" ]; then
    [ -x "$HDC_DIR/hdc" ] && { printf '%s\n' "$HDC_DIR"; return 0; }
    echo "ERROR: HDC_DIR is set to $HDC_DIR but there is no hdc in it." >&2
    return 1
  fi
  for d in "$HOME/Desktop/hdc" "$HOME/hdc" "$HOME/tools/26.0.0/toolchains"; do
    [ -x "$d/hdc" ] && { printf '%s\n' "$d"; return 0; }
  done
  if command -v hdc >/dev/null 2>&1; then
    dirname "$(command -v hdc)"
    return 0
  fi
  echo "ERROR: cannot find hdc. Set HDC_DIR to the directory holding it." >&2
  return 1
}

# The hapsigner directory, the one with dist/ inside it.
vera_hapsigner() {
  local d
  if [ -n "${HAPSIGNER:-}" ]; then
    [ -d "$HAPSIGNER/dist" ] && { printf '%s\n' "$HAPSIGNER"; return 0; }
    echo "ERROR: HAPSIGNER is set to $HAPSIGNER but it has no dist/." >&2
    return 1
  fi
  for d in "$HOME/agent-kit-sdk/hapsigner" "$HOME/hapsigner" "$HOME/tools/hapsigner"; do
    [ -d "$d/dist" ] && { printf '%s\n' "$d"; return 0; }
  done
  echo "ERROR: cannot find hapsigner. Set HAPSIGNER to the directory holding dist/." >&2
  return 1
}

# The OpenHarmony toolchains, if they can be found. Not fatal: hdc is often
# already on PATH, and only some of these scripts need the rest of the SDK.
vera_add_toolchains_to_path() {
  local d
  for d in ${OHOS_TOOLCHAINS:+"$OHOS_TOOLCHAINS"} \
           "$HOME/agent-kit-sdk/ohos_sdk"/*/toolchains \
           "$HOME/agentsdk/ohos_sdk"/*/toolchains; do
    if [ -d "$d" ]; then
      export PATH="$d:$PATH"
      return 0
    fi
  done
  return 0
}
