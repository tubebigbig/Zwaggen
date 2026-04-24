---
description: 兩分鐘內用 Zwaggen 送出第一個帶型別的請求 — 不用安裝，也不用註冊。
---

# 快速上手

五分鐘就能建出一份 Zwaggen 規格：一個型別、一個端點，加上一次真的送出去的請求。

::: tip 預告
原生桌面應用程式 **Zwaggen Desktop** 即將推出，提供無 CORS 限制的 API 測試。詳見[桌面應用](/zh-TW/guide/desktop)。在此之前，本指南使用 Zwaggen Web。
:::

你可以用兩種方式跟著做：

- **線上 playground** — [play.zwaggen.com](https://play.zwaggen.com)，不用安裝。這份教學用它最快；JSONPlaceholder 會送 CORS 開放的標頭，所以不用 proxy 請求也打得通。
- **在本機跑** — 如果還沒裝，請先看[安裝與環境需求](/zh-TW/installation)。

## 目標

我們要描述一個很小的公開 API — 來自 [JSONPlaceholder](https://jsonplaceholder.typicode.com) 的 `GET /todos/1` — 把回應定義成 `Todo` 型別，送出請求，然後親眼看執行時驗證跑起來。

## 1. 開啟 App

```bash
npx @zwaggen/web
```

指令會在 `http://127.0.0.1:4173` 啟動本機伺服器，並開啟你的瀏覽器。你會看到一份空的規格，預設標題是「My API」。

CORS bypass 已經內建了 — 在任何端點打開「Use proxy」開關，請求會走同一個 Node 程序底下的 `/proxy`。不用開第二個終端機、不用佔第二個 port。（如果要把 proxy 跑在不同機器，獨立的 `npx @zwaggen/proxy` 仍然可用。）

## 2. 設定 base URL

- 在右側側欄（**API Info**）把 **Base URL** 設為 `https://jsonplaceholder.typicode.com`。

## 3. 建立 `Todo` 型別

- 在左側側欄選 **型別**（Types）。
- 點 **+ 新增型別**（+ Add type），命名為 `Todo`。
- Kind 選 **object**，然後點 **+ 新增欄位**（+ Add field）四次，填入：

| 名稱 | 型別 | 必填 |
| --- | --- | --- |
| `userId` | integer | ✅ |
| `id` | integer | ✅ |
| `title` | string | ✅ |
| `completed` | boolean | ✅ |

![Todo 型別，包含 userId、id、title、completed 欄位](/screenshots/quickstart-type-builder.png)

## 4. 建立端點

- 在左側側欄選 **端點**（Endpoints）。
- 點 **+ 新增端點**（+ Add endpoint）。
- Method：`GET`，Path：`/todos/1`，Name：`Get todo by id`。
- 展開 **Responses** → **200** → **Type**，選 **Ref**，再選 `Todo`。

![端點編輯器顯示 GET /todos/1，200 回應對應到 Todo](/screenshots/quickstart-endpoint.png)

## 5. 送出

- 點清單中的端點，右側會打開 **執行**（Run）面板。
- 點 **送出**（Send）。
- 在 **Response** 分頁你會看到回應 JSON，上方還會亮一個綠色的 **type ok** 標籤 — 代表實際回應符合你定義的 `Todo` 型別。

![Run 面板 Response 分頁顯示綠色 type ok 標籤](/screenshots/quickstart-response.png)

## 6. 讓驗證抓出漂移（選做）

- 回到 `Todo` 型別，把 `title` 欄位的 **kind** 從 `string` 改成 `integer`。
- 重跑一次端點。徽章會變成 **Invalid**，Response 分頁會把不符的欄位標出來。這就是 Zwaggen 抓得到、Postman 抓不到的那一類問題。

繼續往下之前，把 `title` 改回 `string`。

## 下一步

- [核心概念](/zh-TW/guide/core-concepts) — 完整的心智模型（Spec、Environments、Types、Endpoints）。
- [型別建構器](/zh-TW/guide/type-builder) — primitive、union、array、ref、example。
- [斷言與串接](/zh-TW/guide/assertions-and-chaining) — 狀態 / 內容斷言，以及把某次回應的值接給下一個請求用。
- [Codegen 程式碼產生](/zh-TW/guide/codegen) — 從規格產出 TypeScript 型別、Zod schemas、型別化 client，讓前端與後端在同一份合約上收斂。
