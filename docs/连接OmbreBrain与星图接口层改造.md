# 连接 Ombre Brain 记忆库 · 星图接口层改造

这份文档解决一个问题：你已经在跑一套 **Ombre Brain(OB)** 记忆库，想把它接到独立版心潮上，并**点亮小屋时光页里的记忆星图**。

前提：你已经有一个能跑起来的 OB 实例（能自己构建镜像、能改它的源码）。如果你还没接过小屋，先看《接入小屋网页》（`docs/接入小屋网页.md`）。

> ⚠️ 记住独立版心潮**本身不带 OB**。星图数据全部来自你这套自己跑的 OB。没有这一步，时光页永远是「未接入 OB / 星图不可用」—— 那是正常的，不是故障。

整件事分三步：**(1) 心潮连上 OB → (2) 给 OB 打星图补丁 → (3) 重建两边**。下面按顺序来。

---

## 1. 心潮 `.env` 连接 OB

在心潮的 `.env` 里填：

```env
OMBRE_MCP_URL=<你的 OB 地址>
OMBRE_MCP_TOKEN=<和 OB 的 OMBRE_MCP_SERVICE_TOKEN 完全相同的值>
OMBRE_READ_ENABLED=true
```

说明：

- `OMBRE_MCP_URL`：你的 OB 的 Streamable HTTP MCP 地址。
- `OMBRE_READ_ENABLED=true`：打开只读接入。这一项开了，`/dashboard/api/memory-map` 和 `/dashboard/api/memory-bucket` 才会真正去问 OB，而不是直接返回 `{available:false}`。
- ⚠️ **坑（最常踩）**：`OMBRE_MCP_TOKEN`（心潮侧）**必须和 OB 侧的 `OMBRE_MCP_SERVICE_TOKEN` 一模一样**，一个字节都不能差。两边不一致 → 心潮请求 OB 时被拒 → **401**，星图起不来。填之前把两处的值原样比对一遍。
- ⚠️ **坑**：只要打开了任一 `OMBRE_*` 接入开关，`OMBRE_MCP_URL` 和 `OMBRE_MCP_TOKEN` 就都必须填；缺任一项，心潮会**拒绝启动**（这是故意的，免得后台一直刷 401）。
- `OMBRE_MCP_TOKEN` 是服务端 Bearer 凭据，只放在心潮服务端 `.env`，**不要**写进前端、URL 或 Git。

---

## 2. 给 OB 打 `/api/bucket-map` 补丁（关键的「接口层改造」）

### 为什么要打这个补丁

OB 原生的 `pulse` 返回的是**给人看的文字摘要**。桶（bucket）一多，这份摘要就**不再逐桶列出结构化数据**，星图去解析它只能解析出 **0 颗星** —— 你会看到心潮连上了、OB 也连上了，但星图空空如也。

所以需要在 OB 上加一条**专门返回结构化星表**的路由：只吐**元数据**（桶的名字、类型、维度坐标、评分等），**不含任何正文**，隐私上是安全的。心潮的 memory-map 接口层优先读这条路由，读到就能画出满天星；读不到才退回去解析 `pulse`（也就是上面那个会解析出 0 颗星的旧路径）。

### 补丁位置

在 OB 源码的 `src/web/buckets.py` 里，找到现有的 `/api/bucket-preview` 路由，**在同一区域**（同一个函数 / 闭包作用域内）新增下面这段路由。

- 先确认该文件顶部已经 `import os`、`import hmac`；`JSONResponse` 来自 `starlette.responses`（补丁里也就地 import 了一次，保险）。
- `sh`（shared handles）、`sh.bucket_mgr`、`sh.decay_engine`、`mcp`、`Request`、`Response` 都是这个作用域里 OB **原本就有**的对象，你只是在旁边多挂一条路由，不新造任何东西。

### 补丁内容（照抄）

```python
    @mcp.custom_route("/api/bucket-map", methods=["GET"])
    async def api_bucket_map(request: Request) -> Response:
        """Trusted-sidecar-only structured star map (metadata only, no content)."""
        from starlette.responses import JSONResponse
        configured = os.environ.get("OMBRE_MCP_SERVICE_TOKEN", "").strip()
        auth = request.headers.get("Authorization", "")
        supplied = auth[7:].strip() if auth.startswith("Bearer ") else ""
        if len(configured) < 32 or len(supplied) != len(configured) or not hmac.compare_digest(supplied, configured):
            return JSONResponse({"error": "Unauthorized"}, status_code=401)
        try:
            all_buckets = await sh.bucket_mgr.list_all(include_archive=True)
            stars = []
            stats = {"pinned": 0, "dynamic": 0, "archived": 0}
            for b in all_buckets:
                meta = b.get("metadata", {})
                if meta.get("deleted_at"):
                    continue
                btype = meta.get("type", "dynamic")
                if meta.get("pinned") or btype == "permanent":
                    stats["pinned"] += 1
                elif btype == "archive":
                    stats["archived"] += 1
                else:
                    stats["dynamic"] += 1
                stars.append({
                    "id": b["id"],
                    "name": meta.get("name", b["id"]),
                    "type": btype,
                    "domain": meta.get("domain", []),
                    "tags": meta.get("tags", []),
                    "valence": meta.get("valence", 0.5),
                    "arousal": meta.get("arousal", 0.3),
                    "importance": meta.get("importance", 5),
                    "resolved": meta.get("resolved", False),
                    "pinned": meta.get("pinned", False),
                    "created_at": meta.get("created", ""),
                    "last_active": meta.get("last_active", ""),
                    "activation_count": meta.get("activation_count", 0),
                    "score": sh.decay_engine.calculate_score(meta),
                })
            stars.sort(key=lambda x: x["score"], reverse=True)
            return JSONResponse({"stats": stats, "total": len(stars), "stars": stars[:800]})
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)
```

### 关于这个补丁的边界

- 它和 `/api/bucket-preview` **共用同一道 Bearer 边界**：认的就是 OB 的 `OMBRE_MCP_SERVICE_TOKEN`。这也是为什么第 1 步里心潮的 `OMBRE_MCP_TOKEN` 必须和它完全相同 —— 心潮就是拿着这个 token 来敲 `/api/bucket-map` 的。
- 它**只给可信 sidecar（心潮）用，不对浏览器开放**：没有 CORS、没有 Cookie，只认服务端 Bearer。
- 只返回元数据（坐标、评分、计数），**不返回桶里的正文**，所以即便被读也不泄露记忆内容。
- ⚠️ **坑**：如果你的 OB 版本里这些对象名字不一样（比如 shared handles 不叫 `sh`、衰减引擎不叫 `decay_engine`），**自行对应改名**即可，逻辑不变。补丁本身不假设你的目录结构，只假设这些对象在同作用域可见。

---

## 3. 重建两边

补丁改的是 OB 源码，而 OB 镜像是**从源码构建**的，所以 OB 要 `--build`：

```bash
# 在 OB 的 compose 目录
docker compose up -d --build
```

心潮这边改的是 `.env`（`OMBRE_READ_ENABLED` 等），要 `--force-recreate` 才会把新环境变量读进去：

```bash
# 在心潮的 compose 目录
docker compose up -d --force-recreate
```

- ⚠️ **坑**：OB 只 `up -d` 不加 `--build`，改的源码不会进镜像，补丁等于没打。
- ⚠️ **坑**：心潮只 `up -d` 不加 `--force-recreate`，`OMBRE_READ_ENABLED=true` 可能没生效，接口层还在返回 `{available:false}`。

两边都重建完，回小屋时光页刷新，星图应当开始出现。

---

## 4. 排障表

| 现象 | 原因 / 排查 |
| --- | --- |
| 星图空 / 卡在「构建中」很久 | **首次**后台建图约 1 分钟属正常；建好后 10 分钟内再看基本是秒开。若一直卡，查心潮 `docker logs` 里 `[ombre] memory map` 附近的报错 |
| **401** | 两个 token 没对齐 —— 心潮的 `OMBRE_MCP_TOKEN` 和 OB 的 `OMBRE_MCP_SERVICE_TOKEN` 必须完全相同（含长度 ≥ 32）。逐字节比对 |
| 连上了但**一直 0 颗星** | OB **没打 `/api/bucket-map` 补丁**（或补丁没 `--build` 进镜像）。这时心潮退回去解析 `pulse`，桶一多就解析不出星。确认补丁已生效：直接带 Bearer 打一下 OB 的 `/api/bucket-map` 看是否返回 `stars` |
| 时光页仍显示「未接入 OB」 | 心潮侧 `OMBRE_READ_ENABLED` 没打开，或没 `--force-recreate`；也可能 `OMBRE_MCP_URL` 填错 |
| 心潮**起不来** | 开了 `OMBRE_*` 开关却漏填 `OMBRE_MCP_URL` 或 `OMBRE_MCP_TOKEN`，心潮会拒绝启动（预期行为），补全即可 |

自测 `/api/bucket-map` 是否通（在能访问 OB 的机器上，把地址和 token 换成你的）：

```bash
curl -H "Authorization: Bearer <你的 OMBRE_MCP_SERVICE_TOKEN>" \
  https://你的OB地址/api/bucket-map
```

返回带 `stats`、`total`、`stars` 就说明补丁生效了；返回 401 就是 token 不对；404 就是补丁没进镜像。

---

## 想省事：直接用融合仓库

如果你要的其实是**完整融合体验** —— 星图 + 星核 + 小屋 + 留言板一键部署，免得自己拼 OB、打补丁、对齐 token —— 可以直接用 **心潮·念**（xinchao-nian）融合仓库，那边把这些都装好了。

本文是给「已经有独立 OB、只想手动接上独立版心潮」的人准备的。
