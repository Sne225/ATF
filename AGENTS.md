# AGENTS.md — Mvula 项目说明

本文件面向在此仓库中工作的 AI 代理，说明如何运行、构建和维护 Mvula。
面向人类的简介见 `README.md`。

## 项目简介

Mvula 是一款面向手机端的单田块种植决策辅助应用。它对比近期与预报降雨量，
结合示例作物规则，输出种植建议、原因、交互式预报、田块状况估算、20 年
季节历史以及可分享的文本。它仅作决策支持，不保证收成。

## 运行方式

### 前置条件

- UI：Node.js 20.19+ 或 22.12+
- 后端：Python 3.10+

### 1. 配置环境变量

需要 DeepSeek API key（仅 `/api/advice` 端点需要；天气、历史、地点端点无需）。

```sh
# .env
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek/deepseek-v4-pro   # 可选，此为默认值
```

### 2. 安装并启动后端

```sh
python3 -m venv .venv && source .venv/bin/activate   # 可选但推荐
pip install -r server/requirements.txt
uvicorn server.main:app --reload --port 8000
```

后端在 `http://127.0.0.1:8000` 提供 API；若 `dist/` 已构建，也在根路径托管前端。

### 3. 安装并启动前端

在第二个终端：

```sh
npm install
npm run dev
```

打开 Vite 打印的地址（如 `http://localhost:5173`）。开发服务器将 `/api` 代理到
8000 端口后端，因此无需额外配置 CORS。

### 4. 生产构建

```sh
npm run typecheck
npm test
npm run build
```

构建后访问 `http://127.0.0.1:8000/`（后端托管 `dist/`）。也可用
`npm run preview` 预览构建产物。

### 排障

- 若 `5173` 被占用，Vite 会自动改用其他端口（如 `5174`），以它打印的端口为准。
- 若后端端口被占用，改用其他 `--port`，并在启动 UI 时设置
  `VITE_API_BASE=http://127.0.0.1:<port>/api`。
- 定位功能需要 HTTPS 或 localhost；否则请搜索地点或点击地图设置田块。

## 架构

前端是 Vite/React/TypeScript 应用；后端是 FastAPI（`server/`）。前端所有数据
读取都经过 `src/lib/api` 单一客户端，默认以 **server** 模式调用后端，后端再代理
Open-Meteo/Nominatim，并新增 DeepSeek 种植建议端点。

数据源切换通过 `VITE_API_MODE` 控制（定义在 `src/lib/api/config.ts`）：

```sh
VITE_API_MODE=mock npm run dev   # 确定性内置数据，无需网络（离线演示）
VITE_API_MODE=live npm run dev   # 浏览器直接调用 Open-Meteo/Nominatim
npm run dev                       # 默认 server 模式，经由 FastAPI 后端
```

后端基础地址可用 `VITE_API_BASE` 覆盖（默认 `/api`）。模拟实现位于
`src/lib/api/mock/`。

## API 端点

| 端点 | 说明 |
| --- | --- |
| `GET /api/crops` | 南非作物目录（`sa_crops.json`） |
| `GET /api/weather?lat=&lon=` | Open-Meteo 预报，已规范化 |
| `GET /api/history?lat=&lon=` | Open-Meteo ERA5 季节降雨 |
| `GET /api/places/search?query=` | 地理编码（名称 → 经纬度） |
| `GET /api/places/reverse?lat=&lon=` | 反向地理编码（经纬度 → 名称） |
| `GET /api/advice?crop=&lat=&lon=` | DeepSeek 作物适宜性判定（LLM） |

## 建议逻辑（advice 如何工作）

存在两套独立的判定逻辑：

1. **前端确定性规则引擎**（`src/lib/advisor/rules.ts`）：使用 Open-Meteo 的田块
   本地预报日期（今天为 `past_days=14` 的第 14 项）。它检查三日降雨量是否达到
   作物 onset 阈值、后续最长干旱期是否在作物耐受范围内，以及模型估算的平均
   土壤温度是否达到最低要求。依次检查：土壤偏冷 → 今日可种 → 假性开局 →
   未来八天内有可种日 → 否则建议三天后再查。预报证据不确定或虽有播种雨但
   表土偏干时，置信度会降低。

2. **后端 LLM 判定**（`server/main.py` 的 `/api/advice`）：读取 `sa_crops.json`
   的作物农艺参数，用 `crop_suitability.py` 拉取历史每日气温/降水并计算 GDD、
   霜冻天数、最优温区外天数、年降雨量（见 `grow_advisor.summarize`），再经
   litellm 调用 DeepSeek 生成结构化判定（SUITABLE / MARGINAL / NOT SUITABLE）。

作物目录（前端 `crops.ts`）有 31 种作物；`sa_crops.json` 含 20 种南非作物的
农艺参数（base_temp、gdd_required、t_min、t_opt 区间、frost_tolerant、
precip_mm_per_month 等）。暖度/干旱分类提供的土壤温度、高温、onset 雨量、
干旱期阈值均为示例值，需当地农艺师复核。

## 数据来源

- 预报：Open-Meteo Forecast API（逐日降水、降水概率、参考蒸散、气温；逐小时
  土壤湿度与土壤温度）。
- 季节历史：Open-Meteo Historical Weather API（ERA5 再分析逐日降水），请求最近
  20 个完整 7 月–6 月季节，前端在 localStorage 缓存 7 天，刷新失败时展示缓存。
- 搜索：Open-Meteo Geocoding API。
- 地图瓦片：OpenStreetMap。
- 图钉标签：Nominatim 反向地理编码（限速每秒不超过 1 次请求）。
- 预报在前端 localStorage 缓存 1 小时；同一四舍五入坐标在断网后可能显示旧数据。

## 关键文件

- `server/main.py`：FastAPI 后端（代理 + `/api/advice`）。
- `server/requirements.txt`：后端依赖。
- `src/lib/api/index.ts` / `config.ts` / `server.ts`：前端数据客户端与模式切换。
- `src/lib/advisor/crops.ts` / `rules.ts` / `metrics.ts` / `history.ts`：作物定义与
  确定性建议逻辑。
- `src/lib/openMeteo.ts` / `openMeteoHistory.ts` / `geo.ts`：实况数据源客户端。
- `src/components/`：Outlook、MetricsGrid、HistoryPanel 等 UI 组件。
- `sa_crops.json`：南非作物农艺参数。
- `crop_suitability.py` / `grow_advisor.py`：独立 CLI 脚本（拉取 Open-Meteo 数据并
  计算/询问 DeepSeek 判定）。

## 约定与约束

- 先运行 `npm run typecheck`、`npm test`、`npm run build` 验证改动。
- 测试：`vitest`（5 个文件、23 个用例）。
- 作物阈值与历史 onset 解读为示例值，未按地区校准；真实使用前需当地农艺师复核。
- 历史与预报值为区域网格模型估算，缺失读数不等于零。
- 未配置 GitHub Pages 部署；本仓库聚焦本地运行。不要主动初始化 Git 或提交。
- 未实现：账号、API key 前端、已保存田块、PWA、卫星图层、第二语言。
