# 部署到中國大陸環境（VPS / 自建）

> 本 repo 的 Cloudflare 版走 Pages/D1/R2；大陆网络环境下更稳的路径是 **自架 node adapter**
> （同一份代码，`ADAPTER=node`）。本文只讲差异点；通用自架见 `skills/selfhost-deploy/SKILL.md`。

## 1. 选型与现实检查

| 方案                                  | 说明                                                         |
| ------------------------------------- | ------------------------------------------------------------ |
| 大陆 VPS（阿里/腾讯/华为等）＋ Docker | 最常规。需 **ICP 备案**（见 §2）                             |
| 大陆 VPS ＋ systemd（无 Docker）      | Node ≥ 22：`pnpm i && ADAPTER=node pnpm build && node build` |
| 海外节点（HK/SG/JP，含 Fly.io `nrt`） | 无备案问题；延迟与连通性因网络而异                           |

## 2. ICP 备案

域名解析到大陆服务器并提供 Web 服务（80/443）**必须备案**；个人博客通常走「个人性质」
非经营性备案，各接入商流程约 1–3 周。未备案域名在大陆节点只能开非标端口或裸 IP——
浏览器端体验与证书签发都会受限。评论/用户生成内容类站点备案审核更严，准备好站点说明。

## 3. 镜像与网络加速

- npm/pnpm registry：`npmmirror`（`registry.npmmirror.com`，`.npmrc` 一行）。
- Docker Hub 与基础镜像（`node:22-slim`）：大陆网络拉取常失败，用你所在云厂商的
  **官方镜像加速地址**（各家控制台都有），或先在有网机器 `docker save/load` 带过去。
  本文不背书任何第三方镜像站，自行评估可信度。
- 拉本仓库失败时可用云的 Codeup/Coding 镜像仓库中转。

## 4. 出网端口与邮件

- 国内 ISP 普遍**封 25 端口出站**——自建 SMTP 基本不可行；事务邮件（评论通知/電子報）
  走国内邮件服务商（或海外 Resend，注意其 API 可达性）。
- Let's Encrypt HTTP-01 验证在备案后完全可用；Caddy 自动 HTTPS 最省事：

```caddy
blog.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

## 5. 站内容器之外的细节

- 时区：后台「設定 → 時間時區」填 `Asia/Shanghai`（排程發文、时间显示按此）。
- 数据备份：SQLite 是单档（`SELF_HOST_DB`），`sqlite3 xxx.sqlite ".backup backup.sqlite"`
  每日 cron 一份 + 异地一份；`/app/data` 整个目录打包即可完整恢复。
- 字体：本仓库字体自托管（无 Google Fonts 外链）；统计/评论也不依赖被墙的第三方。
- 微信生态：登录/支付未内建（roadmap 的 commerce 线有支付 provider 接口的位置）。

## 6. 验收清单

```bash
curl -I https://你的域/robots.txt        # 200
curl -s  https://你的域/sitemap.xml | head -3
# 后台登录 → 建一篇测试文 → /blog 分页与图片上传（落 volume）
```
