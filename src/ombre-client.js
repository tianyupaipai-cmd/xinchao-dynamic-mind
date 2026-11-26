export class OmbreClient {
  constructor(config) {
    this.config = config;
    this.sessionId = null;
    this.initializePromise = null;
    this._memoryMapCache = null;      // { at, value }：星图构建结果缓存
    this._memoryMapBuilding = false;  // 单飞锁：同时只跑一个后台建图
  }

  async post(payload, expectBody = true, timeoutMs = 15000) {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-Ombre-Caller': 'dynamic-mind',
    };
    if (this.config.token) headers.Authorization = `Bearer ${this.config.token}`;
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    const response = await fetch(this.config.url, {
      method: 'POST', headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw new Error(`Ombre MCP failed: HTTP ${response.status}`);
    this.sessionId = response.headers.get('mcp-session-id') ?? this.sessionId;
    if (!expectBody) return null;
    const text = await response.text();
    return text ? parseMcp(text) : null;
  }

  async initialize() {
    if (this.sessionId) return;
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await this.post({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'xinchao-dynamic-mind', version: '3.0.0' },
          },
        });
        if (!this.sessionId) throw new Error('Ombre MCP did not return a session id');
        await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, false);
      })().finally(() => { this.initializePromise = null; });
    }
    return this.initializePromise;
  }

  async call(name, args = {}, timeoutMs = 15000) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.initialize();
      try {
        return await this.post({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } }, true, timeoutMs);
      } catch (error) {
        if (attempt || !/HTTP (400|404)/.test(error.message)) throw error;
        this.sessionId = null;
      }
    }
    throw new Error('Ombre MCP call failed after session refresh');
  }

  async recentMaterial(drives = []) {
    const result = await this.call('breath', {
      query: withDriveHint('近期重要记忆、情绪、关系变化和未完成事项', drives),
      max_results: this.config.breathMaxResults,
      max_tokens: this.config.breathMaxTokens
    });
    return extractText(result).slice(0, 10000);
  }

  async daytimeMaterial(drives = []) {
    const result = await this.call('breath', {
      query: withDriveHint('白天自然浮现的近期记忆、具体细节、未说完的话和当下牵挂；不要返回系统配置或技术信息', drives),
      max_results: this.config.breathMaxResults,
      max_tokens: this.config.breathMaxTokens
    });
    return extractText(result).slice(0, 10000);
  }

  // 自主念头用的材料：比日间浮现更短，只要能让念头落到具体的事上。
  async thoughtMaterial(drives = []) {
    const result = await this.call('breath', {
      query: withDriveHint('此刻自然想起的一件具体的事：最近的共同经历、说过的话或还惦记着的东西；不要返回系统配置、部署或技术信息', drives),
      max_results: Math.max(1, Math.min(3, Number(this.config.breathMaxResults) || 2)),
      max_tokens: Math.max(200, Math.min(600, Number(this.config.breathMaxTokens) || 400))
    });
    return extractText(result).slice(0, 4000);
  }

  async recentContinuityMaterial(maxTokens = this.config.breathMaxTokens) {
    const result = await this.call('breath', {
      query: [
        '新窗口近期连续性：只返回最近发生了什么，以及仍直接影响现在的人物与关系变化、生活重点和未完成约定。',
        '不要返回核心准则、自我基岩或长期画像；这些由客户端从自己的核心指令和长期记忆单独完整读取。',
        '不要返回部署、代码、接口、密钥、系统日志或已经过期的技术待办。',
      ].join(''),
      max_results: Math.max(3, Math.min(8, Number(this.config.breathMaxResults) || 3)),
      max_tokens: Math.max(200, Math.min(3000, Number(maxTokens) || 1600)),
    });
    return extractText(result).slice(0, 16000);
  }

  // Compatibility alias for older callers.  It intentionally returns only
  // recent continuity; it is not a replacement for repository bedrock.
  async handoffMaterial(maxTokens = this.config.breathMaxTokens) {
    return this.recentContinuityMaterial(maxTokens);
  }

  async storeDream(dream) {
    if (!this.config.writeEnabled) return null;
    const content = [
      `梦境：${dream.dream}`,
      `梦境余韵：${dream.residue}`,
      `醒后意识：${dream.awareness}`,
      '说明：这是睡眠结算产生的梦境，不是现实事件；调用外部记忆服务不等于醒来。'
    ].join('\n');
    const result = await this.call('hold', {
      content,
      tags: 'dream',
      importance: 7,
      auto: true,
      source: 'xinchao-dream',
    });
    const text = extractText(result);
    return text.match(/[a-f0-9]{12,}/i)?.[0] ?? null;
  }

  // 记忆星图（网页「时光」页）。独立版本身不带 OB：没配 OMBRE_READ_ENABLED / 没接 OB 时
  // 返回 available:false，网页据此显示「未接入 OB」而不是报故障。接了 OB 才真正点亮。
  async memoryMap() {
    if (!this.config.readEnabled) return emptyMemoryMap('not_configured');
    // 绝不在请求里同步等 OB pulse（几百个桶要几十秒，必然超时 502）：
    // 有缓存就秒回（过期了顺手后台刷新）；没缓存就后台开建、本次立刻回「构建中」。
    if (this._memoryMapCache) {
      if (Date.now() - this._memoryMapCache.at >= 600_000) this._triggerMemoryMapBuild();
      return this._memoryMapCache.value;
    }
    this._triggerMemoryMapBuild();
    return buildingMemoryMap();
  }

  _triggerMemoryMapBuild() {
    if (this._memoryMapBuilding) return; // 同时只跑一个构建，避免并发抢 OB
    this._memoryMapBuilding = true;
    (async () => {
      try {
        // 优先走 OB 的结构化星表路由（/api/bucket-map，sidecar token）；
        // 老版 OB 没有这条路由时退回 pulse 文本解析（pulse 是人类摘要，
        // 桶多时不含逐桶行，解析出 0 颗星——所以结构化路由才是正路，
        // 见《连接OmbreBrain与星图接口层改造.md》里的补丁）。
        let map = await this.fetchBucketMapStructured();
        if (!map) {
          const result = await this.call('pulse', {}, 60000);
          map = parseMemoryMapText(extractText(result));
        }
        if (map.available && map.stars.length) {
          this._memoryMapCache = { at: Date.now(), value: map };
        } else {
          console.error('[ombre] memory map build yielded no stars', { reason: map.reason ?? null, total: map.total });
        }
      } catch (error) {
        // 失败不缓存，下次请求会再次触发重试；必须留痕，不许静默。
        console.error('[ombre] memory map build failed:', error.message);
      } finally {
        this._memoryMapBuilding = false;
      }
    })();
  }

  // OB 结构化星表（元数据，无正文）。404 = 老版 OB 没有该路由，返回 null 让调用方退回 pulse。
  async fetchBucketMapStructured() {
    const url = new URL(this.config.url);
    url.pathname = '/api/bucket-map';
    url.search = '';
    const headers = { Accept: 'application/json', 'X-Ombre-Caller': 'dynamic-mind' };
    if (this.config.token) headers.Authorization = `Bearer ${this.config.token}`;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Ombre bucket-map failed: HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.stars)) return null;
    const map = parseMemoryMapText(JSON.stringify({ stars: data.stars, stats: data.stats ?? {} }));
    if (Number.isFinite(Number(data.total))) map.total = Number(data.total);
    return map;
  }

  async memoryBucketPreview(bucketId, maxLines = 7) {
    if (!this.config.readEnabled) return emptyMemoryPreview(bucketId, 'not_configured');
    const id = String(bucketId ?? '').trim();
    if (!/^[A-Za-z0-9._-]{1,160}$/.test(id)) return emptyMemoryPreview(id, 'invalid_id');
    const url = new URL(this.config.url);
    url.pathname = `/api/bucket-preview/${encodeURIComponent(id)}`;
    url.search = '';
    const headers = { Accept: 'application/json', 'X-Ombre-Caller': 'dynamic-mind' };
    if (this.config.token) headers.Authorization = `Bearer ${this.config.token}`;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (response.status === 404) return emptyMemoryPreview(id, 'not_found');
    if (!response.ok) throw new Error(`Ombre preview failed: HTTP ${response.status}`);
    return parseMemoryPreviewText(JSON.stringify({ ok: true, ...(await response.json()) }), id, maxLines);
  }

  async memoryBucketPreviews(bucketIds = [], maxLines = 7) {
    const ids = [...new Set((Array.isArray(bucketIds) ? bucketIds : [])
      .map(String).map((id) => id.trim()).filter(Boolean))].slice(0, 8);
    const previews = [];
    for (const id of ids) {
      const item = await this.memoryBucketPreview(id, maxLines);
      if (item.available && item.preview) previews.push(item);
    }
    return previews;
  }
}

// 把当前最强的几个驱动力拼进 breath 的 query，让"此刻想什么"影响"想起什么"。
//
// 这里只改排序，不改准入：能不能返回仍然由 Ombre 的 admission gate 判定
// （要有原句、词锚或高语义证据）。所以驱动力高不会凭空造出记忆，只会让
// 本来就有证据的那几条里，跟当下状态相关的先浮上来。末尾那句兜底很重要，
// 没有它的话强驱动力会把召回卡死成空。
function withDriveHint(base, drives) {
  const labels = (Array.isArray(drives) ? drives : [])
    .filter((item) => Number(item?.value) >= DRIVE_HINT_MIN)
    .slice(0, DRIVE_HINT_MAX_LABELS)
    .map((item) => String(item?.label ?? '').trim())
    .filter(Boolean);
  if (!labels.length) return base;
  return `${base}。此刻最强的内在状态是${labels.join('、')}，优先浮现与之真正相关的具体记忆；没有直接相关的就照常返回近期重要的`;
}

const DRIVE_HINT_MIN = 0.5;
const DRIVE_HINT_MAX_LABELS = 3;

function parseMcp(text) {
  const data = text.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim() ?? text;
  return JSON.parse(data);
}

function extractText(result) {
  const content = result?.result?.content ?? result?.content ?? [];
  return content.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
}

// ── 记忆星图（memory-map）解析与整形 ──────────────────────────────────
// 独立版不带 OB，星图靠外接 OB 的 /api/bucket-map（结构化元数据）点亮；
// 老版 OB 无此路由时退回 pulse 文本解析。下面这套函数与融合版「心潮·念」保持一致。

function emptyMemoryMap(reason = 'empty') {
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    available: false,
    reason,
    total: 0,
    stats: {},
    stars: [],
    edges: [],
    capabilities: {
      explicitRelations: false,
      driveSnapshots: false,
      driveAffinity: false,
      timestamps: false,
    },
  };
}

// 首次还没缓存、正在后台构建时的即时占位：available:false + reason:'building'，网页据此提示并稍后自动重试。
function buildingMemoryMap() {
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    available: false,
    reason: 'building',
    total: 0,
    stats: {},
    stars: [],
    edges: [],
    capabilities: {
      explicitRelations: false,
      driveSnapshots: false,
      driveAffinity: false,
      timestamps: false,
    },
  };
}

function emptyMemoryPreview(id, reason = 'empty') {
  return { schemaVersion: 1, available: false, reason, id: String(id ?? ''), preview: '', lineCount: 0, truncated: false };
}

export function parseMemoryPreviewText(raw, expectedId = '', maxLines = 7) {
  const text = String(raw ?? '').trim();
  if (!text) return emptyMemoryPreview(expectedId, 'empty');
  try {
    const parsed = JSON.parse(text);
    if (!parsed?.ok) return emptyMemoryPreview(expectedId, String(parsed?.error || 'not_found'));
    const id = String(parsed.id ?? expectedId).trim();
    if (expectedId && id !== expectedId) return emptyMemoryPreview(expectedId, 'id_mismatch');
    const lineLimit = Math.max(1, Math.min(7, Number(maxLines) || 7));
    const preview = String(parsed.preview ?? '').split(/\r?\n/).slice(0, lineLimit).join('\n').slice(0, 1400);
    return {
      schemaVersion: 1,
      available: Boolean(preview),
      reason: preview ? undefined : 'empty',
      id,
      preview,
      lineCount: preview ? preview.split(/\r?\n/).length : 0,
      truncated: Boolean(parsed.truncated),
    };
  } catch {
    return emptyMemoryPreview(expectedId, 'invalid_response');
  }
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStar(star = {}) {
  const id = String(star.id ?? star.bucketId ?? star.bucket_id ?? '').trim();
  if (!id) return null;
  const pinned = Boolean(star.pinned || star.bucketType === 'permanent' || star.type === 'permanent');
  const driveSnapshot = star.driveSnapshot ?? star.drive_snapshot ?? null;
  const driveAffinity = star.driveAffinity ?? star.drive_affinity ?? null;
  return {
    id,
    title: String(star.title ?? star.name ?? '（无题）').trim() || '（无题）',
    pinned,
    bucketType: String(star.bucketType ?? star.type ?? (pinned ? 'permanent' : 'dynamic')),
    domains: Array.isArray(star.domains) ? star.domains.map(String).filter(Boolean)
      : Array.isArray(star.domain) ? star.domain.map(String).filter(Boolean)
        : String(star.domain ?? '').split(/[,，]/).map((item) => item.trim()).filter(Boolean),
    valence: numberOrNull(star.valence),
    arousal: numberOrNull(star.arousal),
    importance: numberOrNull(star.importance),
    weight: numberOrNull(star.weight ?? star.score),
    tags: Array.isArray(star.tags) ? star.tags.map(String).filter(Boolean)
      : String(star.tags ?? '').split(/[,，]/).map((item) => item.trim()).filter(Boolean),
    createdAt: star.createdAt ?? star.created_at ?? null,
    updatedAt: star.updatedAt ?? star.updated_at ?? null,
    lastActiveAt: star.lastActiveAt ?? star.last_active ?? null,
    activationCount: numberOrNull(star.activationCount ?? star.activation_count),
    anchored: Boolean(star.anchored),
    resolved: Boolean(star.resolved),
    historical: star.historical == null ? !driveSnapshot : Boolean(star.historical),
    meaningCount: Array.isArray(star.meaning) ? star.meaning.length : Number(star.meaningCount ?? 0) || 0,
    driveSnapshot: driveSnapshot && typeof driveSnapshot === 'object' ? driveSnapshot : null,
    driveAffinity: driveAffinity && typeof driveAffinity === 'object' ? driveAffinity : null,
  };
}

// 星图是可视化不是全量导出：桶越多，建边(O(pairs))和 payload 越炸。只保留最重的一批
// ——固化(pinned)优先，其余按权重降序——把负载和总桶数脱钩。total 仍报真实数，网页显示不变。
const MAX_MAP_STARS = 400;
function capMapStars(stars, max = MAX_MAP_STARS) {
  if (!Array.isArray(stars) || stars.length <= max) return stars;
  return stars
    .map((star, index) => ({ star, index, rank: (star.pinned ? 1e9 : 0) + (Number(star.weight) || 0) }))
    .sort((a, b) => (b.rank - a.rank) || (a.index - b.index))
    .slice(0, max)
    .map((item) => item.star);
}

function buildMapEdges(stars, minShared = 3, maxPerNode = 6) {
  const byTag = new Map();
  stars.forEach((star, index) => star.tags.forEach((tag) => {
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(index);
  }));
  const pairs = new Map();
  for (const indexes of byTag.values()) {
    if (indexes.length > stars.length * .5) continue;
    for (let left = 0; left < indexes.length; left += 1) {
      for (let right = left + 1; right < indexes.length; right += 1) {
        const key = `${indexes[left]}|${indexes[right]}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }
  const candidates = [];
  for (const [key, shared] of pairs) {
    if (shared < minShared) continue;
    const [left, right] = key.split('|').map(Number);
    const denominator = Math.min(stars[left].tags.length, stars[right].tags.length) || 1;
    candidates.push({ left, right, shared, similarity: Math.min(1, shared / denominator) });
  }
  candidates.sort((a, b) => b.similarity - a.similarity || b.shared - a.shared);
  const degree = new Array(stars.length).fill(0);
  const edges = [];
  for (const candidate of candidates) {
    if (degree[candidate.left] >= maxPerNode || degree[candidate.right] >= maxPerNode) continue;
    degree[candidate.left] += 1;
    degree[candidate.right] += 1;
    edges.push({
      source: stars[candidate.left].id,
      target: stars[candidate.right].id,
      similarity: Number(candidate.similarity.toFixed(2)),
      kind: 'tag-derived',
      label: `${candidate.shared} 个共同标签`,
    });
  }
  return edges;
}

function normalizeEdges(edges, stars) {
  const ids = new Set(stars.map((star) => star.id));
  return (Array.isArray(edges) ? edges : []).flatMap((edge) => {
    const source = String(edge?.source ?? '').trim();
    const target = String(edge?.target ?? '').trim();
    if (!source || !target || source === target || !ids.has(source) || !ids.has(target)) return [];
    return [{
      source,
      target,
      similarity: Math.max(0, Math.min(1, Number(edge.similarity ?? edge.weight ?? 0) || 0)),
      kind: edge.kind === 'semantic' || edge.kind === 'tag-derived' ? edge.kind : 'explicit',
      label: String(edge.label ?? '').slice(0, 120),
    }];
  });
}

export function parseMemoryMapText(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return emptyMemoryMap('empty');

  // 结构化输出优先（/api/bucket-map）；老版 pulse 走下方无损文本适配。
  try {
    const parsed = JSON.parse(text);
    const sourceStars = parsed.stars ?? parsed.nodes;
    if (Array.isArray(sourceStars)) {
      const allStars = sourceStars.map(normalizeStar).filter(Boolean);
      const stars = capMapStars(allStars);
      const explicitEdges = normalizeEdges(parsed.edges ?? parsed.links, stars);
      const capabilities = {
        explicitRelations: explicitEdges.length > 0,
        driveSnapshots: stars.some((star) => star.driveSnapshot),
        driveAffinity: stars.some((star) => star.driveAffinity),
        timestamps: stars.some((star) => star.createdAt || star.updatedAt),
      };
      return {
        schemaVersion: Number(parsed.schemaVersion ?? 2),
        generatedAt: String(parsed.generatedAt ?? new Date().toISOString()),
        available: true,
        total: allStars.length,
        stats: parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : {},
        stars,
        edges: explicitEdges.length ? explicitEdges : buildMapEdges(stars),
        capabilities,
      };
    }
  } catch {
    // 人类可读 pulse 不是 JSON，继续解析；不把解析失败当服务故障。
  }

  const stats = {};
  for (const [key, label] of [['pinned', '固化桶'], ['dynamic', '动态桶'], ['archived', '归档桶']]) {
    const match = text.match(new RegExp(`${label}[:：]\\s*(\\d+)`));
    if (match) stats[key] = Number(match[1]);
  }
  const size = text.match(/总占用[:：]\s*([\d.]+\s*\w+)/);
  if (size) stats.size = size[1];

  const stars = [];
  const line = /((?:📌)?)\s*\[([0-9a-f]+)\]\s*《([^》]*)》([^\n]*)/gi;
  let match;
  while ((match = line.exec(text)) !== null) {
    const [, pin, id, title, tail] = match;
    const domain = (tail.match(/主题[:：]\s*([^\s]+)/) || [])[1] || '';
    const emotion = tail.match(/情感[:：]\s*V(-?[\d.]+)\/A(-?[\d.]+)/);
    const importance = (tail.match(/重要[:：]\s*([\d.]+)/) || [])[1];
    const weight = (tail.match(/权重[:：]\s*([\d.]+)/) || [])[1];
    const tags = (tail.match(/标签[:：]\s*(.+)$/) || [])[1] || '';
    stars.push(normalizeStar({
      id,
      title,
      pinned: pin.length > 0,
      bucketType: pin.length > 0 ? 'permanent' : 'dynamic',
      domains: domain.split(/[,，]/).filter(Boolean),
      valence: emotion ? Number(emotion[1]) : null,
      arousal: emotion ? Number(emotion[2]) : null,
      importance: importance ? Number(importance) : null,
      weight: weight ? Number(weight) : null,
      tags: tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      historical: true,
    }));
  }
  const allStars = stars.filter(Boolean);
  const cappedStars = capMapStars(allStars);
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    available: true,
    total: allStars.length,
    stats,
    stars: cappedStars,
    edges: buildMapEdges(cappedStars),
    capabilities: {
      explicitRelations: false,
      driveSnapshots: false,
      driveAffinity: false,
      timestamps: false,
    },
  };
}
