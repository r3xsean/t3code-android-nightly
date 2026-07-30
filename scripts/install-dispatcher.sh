#!/usr/bin/env bash
set -euo pipefail

label="dev.r3xsean.t3code-nightly-dispatch"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_dir="$(cd -- "$script_dir/.." && pwd)"
template="$repository_dir/launchd/$label.plist"
node_path="$(command -v node)"
gh_path="$(command -v gh)"
user_home="${HOME:?}"
launch_agents_dir="$user_home/Library/LaunchAgents"
logs_dir="$user_home/Library/Logs"
target="$launch_agents_dir/$label.plist"
dispatcher="$repository_dir/scripts/dispatch-nightly.mjs"
stdout_path="$logs_dir/$label.log"
stderr_path="$logs_dir/$label.error.log"
domain="gui/$(id -u)"
temporary="$(mktemp "${TMPDIR:-/tmp}/$label.XXXXXX.plist")"
trap 'rm -f "$temporary"' EXIT

test -f "$template"
test -f "$dispatcher"
case "$target" in
  "$user_home/Library/LaunchAgents/$label.plist") ;;
  *)
    echo "Refusing unexpected LaunchAgent target: $target" >&2
    exit 1
    ;;
esac

mkdir -p "$launch_agents_dir" "$logs_dir"
cp "$template" "$temporary"
/usr/libexec/PlistBuddy -c "Set :ProgramArguments:0 $node_path" "$temporary"
/usr/libexec/PlistBuddy -c "Set :ProgramArguments:1 $dispatcher" "$temporary"
/usr/libexec/PlistBuddy -c "Set :WorkingDirectory $repository_dir" "$temporary"
/usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:HOME $user_home" "$temporary"
/usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:GH_PATH $gh_path" "$temporary"
/usr/libexec/PlistBuddy -c "Set :StandardOutPath $stdout_path" "$temporary"
/usr/libexec/PlistBuddy -c "Set :StandardErrorPath $stderr_path" "$temporary"
plutil -lint "$temporary"
if [[ "${DISPATCHER_CHECK_ONLY:-0}" == "1" ]]; then
  plutil -p "$temporary"
  exit 0
fi
install -m 600 "$temporary" "$target"

launchctl bootout "$domain/$label" 2>/dev/null || true
launchctl bootstrap "$domain" "$target"
launchctl enable "$domain/$label"
launchctl kickstart -k "$domain/$label"
launchctl print "$domain/$label"
