# 从零启动 Open Notebook（其他电脑部署）

本文档说明如何在**新电脑**上从零启动 Open Notebook，适用于团队内多台机器部署、分享给他人使用等场景。

---

## 是否需要安装 Docker？

**是的，需要安装 Docker。**

Open Notebook 推荐通过 Docker 部署，原因是：
- 环境一致，避免 Python/Node 版本问题
- 包含 SurrealDB、API、前端，一次启动全部就绪
- 跨平台（Windows / Mac / Linux）

**唯一依赖**：安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)（Windows/Mac）或 [Docker Engine](https://docs.docker.com/engine/install/)（Linux）

---

## 从 0 到 1 启用流程

### 方案 A：一键启动（推荐）

1. **安装 Docker**，并确保 Docker 已启动  
2. **获取项目**：克隆仓库或拷贝整个 `open-notebook` 目录  
3. **运行启动脚本**：

   **Windows (PowerShell)：**
   ```powershell
   cd open-notebook
   .\scripts\start-open-notebook.ps1
   ```
   
   **Linux / Mac：**
   ```bash
   cd open-notebook
   chmod +x scripts/start-open-notebook.sh
   ./scripts/start-open-notebook.sh
   ```

4. 等待约 20 秒，打开浏览器访问：**http://localhost:8502**
5. 进入 **Settings → API Keys** 配置 AI 提供商

---

### 方案 B：手动步骤（无脚本）

1. 安装并启动 Docker  
2. 进入项目目录，创建 `.env` 文件：
   ```
   OPEN_NOTEBOOK_ENCRYPTION_KEY=your-random-secret-string
   ```
3. 启动服务：
   ```bash
   docker compose -f docker-compose.standalone.yml up -d
   ```
4. 等待 15–20 秒，访问 http://localhost:8502

---

## 启动脚本说明

| 脚本 | 适用系统 | 说明 |
|------|----------|------|
| `scripts/start-open-notebook.ps1` | Windows | 检查 Docker、生成密钥、启动服务、等待健康 |
| `scripts/start-open-notebook.sh`  | Linux/Mac | 同上 |

### PowerShell 可选参数

```powershell
# 默认：使用 Docker Hub 预构建镜像
.\scripts\start-open-notebook.ps1

# 从本地源码构建镜像（适用于修改过代码的场景）
.\scripts\start-open-notebook.ps1 -BuildFromSource

# 启动完成后自动打开浏览器
.\scripts\start-open-notebook.ps1 -OpenBrowser
```

### Shell 可选参数

```bash
# 从本地源码构建
./scripts/start-open-notebook.sh --build

# 启动完成后自动打开浏览器
./scripts/start-open-notebook.sh --open
```

---

## 项目内已有的启动相关脚本

| 脚本 | 用途 |
|------|------|
| `scripts/start-open-notebook.ps1` | **新建**：新电脑从零启动（Docker） |
| `scripts/start-open-notebook.sh`  | **新建**：同上，Linux/Mac |
| `quick-start.ps1` | 开发模式：SurrealDB Docker + 本地 API + 前端 |
| `sync-and-test-ports.ps1` | 开发：构建 Docker 镜像并同步 3000 → 8502 测试 |
| `start-dev.ps1` / `start-development-mode.ps1` | 开发：启动开发环境 |
| `restart-with-fixes.ps1` | 开发：重启并应用修复 |

---

## 端口与访问地址

| 端口 | 服务 | 地址 |
|------|------|------|
| 8502 | 前端 Web UI | http://localhost:8502 |
| 5055 | REST API | http://localhost:5055 |
| 5055/docs | API 文档 | http://localhost:5055/docs |
| 8000 | SurrealDB | 内部使用，无需直接访问 |

---

## 其他电脑访问本机服务

若要在局域网内其他电脑访问，需：

1. 在运行 Open Notebook 的电脑上确认防火墙放行 8502、5055  
2. 将 `localhost` 换成本机 IP，例如：http://192.168.1.100:8502  
3. 若使用 `docker-compose.standalone.yml`，端口已绑定到 `0.0.0.0`，可直接通过 IP 访问  
4. 若通过 Web UI 调用 API，需在 Settings 中配置 `API_URL` 为该机器的 IP（如 http://192.168.1.100:5055）

---

## 故障排查

- **Docker 未运行**：先启动 Docker Desktop / Docker 服务  
- **端口被占用**：修改 `docker-compose.standalone.yml` 中的端口映射  
- **镜像拉取失败**：检查网络，或使用 `-BuildFromSource` 从源码构建
