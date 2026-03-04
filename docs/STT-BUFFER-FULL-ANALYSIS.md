# STT 模型测试失败：bufio buffer full 分析与解决方案

## 一、项目模型测试原理

### 1.1 调用链

```
POST /api/models/{model_id}/test
  → api.routers.models.test_model()
  → open_notebook.ai.connection_tester.test_individual_model(model)
  → esp_model.atranscribe(audio_file=_generate_test_wav(), language="en")
  → Esperanto 库向 OpenAI 兼容 STT 端点发送 multipart/form-data 请求
```

### 1.2 关键代码位置

| 组件 | 路径 | 作用 |
|------|------|------|
| 模型测试 API | `api/routers/models.py:265` | `POST /models/{model_id}/test` |
| 测试逻辑 | `open_notebook/ai/connection_tester.py:368` | `test_individual_model()` |
| 测试音频 | `connection_tester.py:313` | `_generate_test_wav()` 生成静音 WAV |
| 转写调用 | `connection_tester.py:423` | `esp_model.atranscribe()` 通过 Esperanto |

### 1.3 STT 测试流程

1. 根据 `model_id` 加载 Model 和 Credential
2. 通过 `ModelManager.get_model()` 创建 Esperanto STT 实例
3. 生成 0.1s 静音 WAV（16kHz, 16-bit mono）
4. 调用 `atranscribe(audio_file, language="en")`
5. Esperanto 以 `multipart/form-data` 发送到 `base_url` + `/v1/audio/transcriptions`（或配置的 `endpoint_stt`）

---

## 二、失败原因分析

### 2.1 错误信息

```
模型测试失败
gemini-3.1-pro-preview

Failed to transcribe audio: OpenAI-compatible STT endpoint error: 
error parsing multipart form: multipart: NextPart: bufio: buffer full 
(request id: 20260303074001251924550S1MPdRcS)
```

### 2.2 根因

错误发生在 **STT 端点（服务端）**，而非 open-notebook 或 Esperanto 客户端。

| 项目 | 说明 |
|------|------|
| 出错组件 | OpenAI 兼容 STT 网关（如 Dify、自建 Go 网关） |
| 错误来源 | Go 标准库 `mime/multipart` + `bufio` |
| 直接原因 | 解析 multipart 时，`ReadMimeHeader` / `NextPart` 使用的 **peek 缓冲区（约 4KB）** 被填满 |
| 触发条件 | multipart 中单段体或 headers 超过 4KB 时，Go 解析器需要 peek 更多数据导致 `ErrBufferFull` |

### 2.3 技术细节

- Go `mime/multipart.Reader` 使用固定 **peek buffer 4096 字节**
- 参考：[golang/go#33666](https://github.com/golang/go/issues/33666) — "unable to process bigger parts"
- `bufio.ErrBufferFull` 在 peek 超出缓冲 capacity 时触发

### 2.4 为何 LLM 正常而 STT 失败？

- LLM：请求为 JSON，无 multipart，不受此缓冲区限制
- STT：音频以 multipart/form-data 上传，服务端解析 multipart 时可能超出 4KB 缓冲区

---

## 三、解决方案

### 方案 A：减小测试音频（已实现）

**修改**：将 `_generate_test_wav()` 从 0.5s 改为 0.1s。

- 原：约 16KB
- 现：约 3.2KB，低于 4KB 缓冲区
- 文件：`open_notebook/ai/connection_tester.py`

**风险**：部分 STT 服务对极短音频有最小时长要求；若仍失败，可尝试 0.05s 或更小。

---

### 方案 B：使用原生 STT 提供商（推荐）

尽量绕过 Go 网关，直接用原生 API：

| 提供商 | 模型示例 | 说明 |
|--------|----------|------|
| **OpenAI** | `whisper-1`, `gpt-4o-transcribe` | 成本低、质量好，约 $0.006/min |
| **Google** | `gemini-2.0-flash`、Vertex 等 | 若当前用的是 Gemini，可考虑 Google 官方接口 |
| **Deepgram** | Nova-2 | 实时转写、延迟低 |
| **Azure Speech** | `whisper` 等 | 企业级、合规 |
| **Groq** | Whisper | 推理快，适合大批量 |

**配置方式**：在 open-notebook 中新增或切换为对应 STT 模型，使用 `openai` / `google` / `azure` / `groq` 等 provider，而不是 `openai_compatible`。

---

### 方案 C：调整 STT 网关（若有控制权）

如 STT 由 Dify、自建网关等提供：

1. 升级网关，确认是否已修复 multipart 解析问题
2. 若有 Go 源码，可增大 `bufio.Reader` 的 buffer
3. Nginx 反向代理：关闭 `proxy_buffering`，避免额外缓冲导致异常

---

### 方案 D：开发者常用 STT 方案（2024–2025）

| 方案 | 优势 | 适用场景 |
|------|------|----------|
| OpenAI Whisper / gpt-4o-transcribe | 价格低、效果稳定 | 通用转录 |
| Deepgram Nova-2 | 实时、低延迟 | 流式、会议记录 |
| Rev.ai | 低 WER、多语言 | 高精度场景 |
| Google Cloud STT | 125+ 语言 | 多语言、与 GCP 集成 |
| VocaFuse | 基础设施完善 | 生产部署 |

---

## 四、错误提示优化（已实现）

在 `_normalize_error_message()` 中增加对 `bufio` + `buffer full` 的识别，返回更明确的提示，引导用户：

1. 优先使用原生 STT 提供商（OpenAI、Google 等）
2. 或向网关维护方反馈，请求增大 multipart 解析缓冲

---

## 五、验证步骤

1. 重新执行 STT 模型测试，确认 0.1s 测试音频是否通过
2. 若仍失败：尝试 `openai` provider + `whisper-1` 或 `gpt-4o-transcribe`
3. 若使用 Dify 等网关：检查版本、Nginx 与 gateway 配置

---

## 参考

- [Go mime/multipart package](https://pkg.go.dev/mime/multipart)
- [golang/go#33666 - unable to process bigger parts](https://github.com/golang/go/issues/33666)
- [OpenAI Speech to Text API](https://platform.openai.com/docs/guides/speech-to-text)
- [Dify Speech-to-Text](https://docs.dify.ai/api-reference/tts/speech-to-text)
- [Best Speech to Text APIs 2025 (VocaFuse)](https://vocafuse.com/blog/best-speech-to-text-api-comparison-2025)
