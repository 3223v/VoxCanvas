# 智谱AI 语音文本模型 API 文档

文档来源：<https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E8%AF%AD%E9%9F%B3%E8%BD%AC%E6%96%87%E6%9C%AC>

## 一、接口总览

本文档主要介绍**语音转文本**接口，该接口基于 GLM ASR 模型实现音频转文本能力，支持多语言识别与实时流式转录，接口请求方式为 `POST`。

## 二、语音转文本接口

### 2.1 基础请求信息

- **请求地址**：`https://open.bigmodel.cn/api/paas/v4/audio/transcriptions`
- **请求方法**：`POST`
- **请求头格式**：`multipart/form-data`

### 2.2 身份验证（Authorization）

请求头必须携带身份验证字段，规则如下：

| 参数名           | 类型     | 是否必填 | 说明                                          |
| ------------- | ------ | ---- | ------------------------------------------- |
| Authorization | string | 是    | 格式：`Bearer <token>`，`<token>` 为你的平台 API Key |

### 2.3 请求示例（Curl）

```bash
curl --request POST \
  --url https://open.bigmodel.cn/api/paas/v4/audio/transcriptions \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: multipart/form-data' \
  --form model=glm-asr \
  --form file=@example-file
```

### 2.4 请求体参数（Body）

请求体采用 `multipart/form-data` 格式，参数明细如下：

| 参数名         | 类型           | 默认值     | 是否必填 | 取值/规则说明                                                                            |
| ----------- | ------------ | ------- | ---- | ---------------------------------------------------------------------------------- |
| file        | file         | -       | 是    | 待转录音频文件支持格式：`.wav`、`.mp3`限制：文件大小 ≤ 25 MB，音频时长 ≤ 60 秒                               |
| model       | enum(string) | glm-asr | 是    | 调用模型编码，仅支持取值：`glm-asr`                                                             |
| temperature | number       | 0.95    | 否    | 采样温度，控制输出随机性取值范围：`[0.0, 1.0]`数值越大输出越随机；越小输出越稳定**注意**：不建议与 `top_p` 同时调整             |
| stream      | boolean      | false   | 否    | 流式输出开关false：同步调用，一次性返回全部结果（默认）true：流式调用，通过 Event Stream 逐块返回内容，结束返回 `data: [DONE]` |
| request\_id | string       | 平台自动生成  | 否    | 请求唯一标识，由客户端自定义，用于区分单次请求                                                            |
| user\_id    | string       | -       | 否    | 终端用户唯一ID，用于平台风控长度要求：6 \~ 128 个字符                                                   |

### 2.5 响应数据（HTTP 200）

接口请求成功后，返回 JSON 格式数据，状态码固定为 `200`，响应字段说明如下：

#### 2.5.1 响应示例

```json
{
  "id": "<string>",
  "created": 123,
  "request_id": "<string>",
  "model": "<string>",
  "segments": [
    {
      "id": 123,
      "start": 123,
      "end": 123,
      "text": "<string>"
    }
  ],
  "text": "<string>"
}
```

#### 2.5.2 响应字段详解

| 字段名            | 类型        | 说明                       |
| -------------- | --------- | ------------------------ |
| id             | string    | 任务唯一 ID                  |
| created        | integer   | 请求创建时间，Unix 时间戳（单位：秒）    |
| request\_id    | string    | 客户端传入的请求标识，未传入则为平台自动生成值  |
| model          | string    | 本次调用的模型名称                |
| segments       | object\[] | 分句识别结果数组，按音频时间轴拆分        |
| segments.id    | integer   | 单句片段 ID                  |
| segments.start | integer   | 单句开始时间戳（单位：毫秒/秒，接口原生返回值） |
| segments.end   | integer   | 单句结束时间戳                  |
| segments.text  | string    | 单句转录文本内容                 |
| text           | string    | 音频完整转录文本                 |

## 三、补充说明

1. **调用模式**
   - 同步模式（`stream=false`）：全量识别完成后统一返回结果，适用于短音频、非实时场景。
   - 流式模式（`stream=true`）：边识别边返回文本流，适用于实时语音转写场景。
2. **资源限制**：严格遵守音频文件大小、时长限制，超出限制会导致请求失败。
3. **参数使用建议**：优先单独调整 `temperature` 参数，避免同时修改多个随机性参数，防止识别效果异常。
4. **风控建议**：面向多终端用户场景时，建议主动传入 `user_id`，便于平台管控违规使用行为。

