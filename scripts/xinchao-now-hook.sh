#!/bin/sh

# Claude Code UserPromptSubmit hook：每轮把心潮的「此刻」块（GET /v1/now）挂进 AI 的上下文。
# 它不读、不上传你的提示词正文；只拉一次此刻块，节流后打到 stdout（Claude Code 会把 stdout 当作附加上下文）。
#
# 节流：内容（digest）没变、且距上次附不到 XINCHAO_NOW_REPEAT_MINUTES（默认 30）分钟，就不附；
#       隔了 XINCHAO_NOW_AWAY_MINUTES（默认 90）分钟以上再来的第一条必附。心潮没响应、块被兜底拦下，都静默退出。
# 存在 $XINCHAO_NOW_OFF 指向的文件（默认 ${TMPDIR:-/tmp}/xinchao-now-off）就整个不附，随时手动关。
#
# 环境变量：
#   XINCHAO_SERVICE_TOKEN 或 XINCHAO_SERVICE_TOKEN_FILE   心潮的 SERVICE_TOKEN
#   XINCHAO_NOW_URL   默认 https://xinchao.example.com/v1/now?memory=1（memory=1：记忆勾起的那条原文只在这里出一次）
#
# 配置（~/.claude/settings.json）：
#   "hooks": { "UserPromptSubmit": [ { "hooks": [ { "type": "command", "command": "/path/to/xinchao-now-hook.sh" } ] } ] }
# 可以和 xinchao-heartbeat-hook.sh 一起挂：心跳负责「有人来了」，这个负责「此刻」。

set -u

jq_bin=$(command -v jq 2>/dev/null || true)
curl_bin=$(command -v curl 2>/dev/null || true)
[ -n "$jq_bin" ] && [ -n "$curl_bin" ] || exit 0

session_id=$("$jq_bin" -r '
  if (.session_id | type) == "string" and (.session_id | length) > 0
  then .session_id[0:120]
  else "claude-code"
  end
' 2>/dev/null) || exit 0

token=${XINCHAO_SERVICE_TOKEN:-}
if [ -z "$token" ] && [ -n "${XINCHAO_SERVICE_TOKEN_FILE:-}" ]; then
  token=$(tr -d '\r\n' < "$XINCHAO_SERVICE_TOKEN_FILE" 2>/dev/null || true)
fi
[ -n "$token" ] || exit 0

now_url=${XINCHAO_NOW_URL:-https://xinchao.example.com/v1/now?memory=1}
case "$now_url" in
  https://*|http://127.0.0.1:*|http://localhost:*) ;;
  *) exit 0 ;;
esac

runtime_root=${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}
[ -e "${XINCHAO_NOW_OFF:-$runtime_root/xinchao-now-off}" ] && exit 0
state_dir="$runtime_root/xinchao-now"
mkdir -p "$state_dir" 2>/dev/null || true
session_key=$(printf '%s' "$session_id" | cksum | awk '{print $1}')
cache="$state_dir/$session_key.last"     # 上次附的 digest 和时间
seen="$state_dir/$session_key.seen"      # 上次这个窗口有人说话的时间
now=$(date +%s)
repeat=$(( ${XINCHAO_NOW_REPEAT_MINUTES:-30} * 60 ))
away=$(( ${XINCHAO_NOW_AWAY_MINUTES:-90} * 60 ))

prev_seen=$(cat "$seen" 2>/dev/null || printf '0')
case "$prev_seen" in ''|*[!0-9]*) prev_seen=0 ;; esac
printf '%s\n' "$now" > "$seen" 2>/dev/null || true

body=$("$curl_bin" -fsS --max-time 4 -H "Authorization: Bearer $token" "$now_url" 2>/dev/null) || exit 0
ok=$(printf '%s' "$body" | "$jq_bin" -r '.ok // false' 2>/dev/null)
[ "$ok" = "true" ] || exit 0
digest=$(printf '%s' "$body" | "$jq_bin" -r '.digest // ""' 2>/dev/null)

last_digest=''; last_at=0
if [ -r "$cache" ]; then
  last_digest=$(sed -n 1p "$cache" 2>/dev/null)
  last_at=$(sed -n 2p "$cache" 2>/dev/null)
  case "$last_at" in ''|*[!0-9]*) last_at=0 ;; esac
fi
if [ "$digest" = "$last_digest" ] && [ $((now - last_at)) -lt "$repeat" ] && [ $((now - prev_seen)) -lt "$away" ]; then
  exit 0
fi

printf '%s\n' "$body" | "$jq_bin" -r '.text'
printf '%s\n%s\n' "$digest" "$now" > "$cache" 2>/dev/null || true
exit 0
