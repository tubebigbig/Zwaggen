# 快速上手

五分鐘就能建立一份 Zwaggen 規格，包含一個型別、一個端點、以及一次真實請求。若還沒安裝，請先看[安裝與環境需求](/installation)。

## 目標

我們要描述一個很小的公開 API — 來自 [JSONPlaceholder](https://jsonplaceholder.typicode.com) 的 `GET /todos/1` — 使用型別化的 `Todo` 回應，執行它，並親眼看見執行時驗證運作。

## 1. 開啟應用程式

```bash
pnpm dev
```

打開印出的網址。你會看到一份空的規格，預設標題是「My API」。

## 2. 設定根網址

- 點擊規格標題列（「My API」）以開啟 **規格資訊**（Spec Info）。
- 把 **Base URL** 設為 `https://jsonplaceholder.typicode.com`。
- 關閉對話視窗。

## 3. 建立 `Todo` 型別

- 在左側側欄選擇 **型別**（Types）。
- 點擊 **+ 新增型別**（+ Add type）。命名為 `Todo`。
- Kind：**object**。點擊 **+ 新增欄位**（+ Add field）四次並填入：

| 名稱 | 型別 | 必填 |
| --- | --- | --- |
| `userId` | integer | ✅ |
| `id` | integer | ✅ |
| `title` | string | ✅ |
| `completed` | boolean | ✅ |

## 4. 建立端點

- 在左側側欄選擇 **端點**（Endpoints）。
- 點擊 **+ 新增端點**（+ Add endpoint）。
- Method：`GET`，Path：`/todos/1`，Name：`Get todo by id`。
- 展開 **Responses** → **200** → **Type**。選 **Ref** 並選擇 `Todo`。

## 5. 執行它

- 點擊清單中的端點。右側會開啟 **執行**（Run）面板。
- 點擊 **送出**（Send）。
- 在 **Response** 分頁你應該會看到 JSON 內容，並在上方看到一個綠色的「Validates」徽章 — 實際回應符合你定義的 `Todo` 型別。

## 6. 讓驗證抓出漂移（選做）

- 回到 `Todo` 型別，把 `title` 欄位的 **必填** 從 ✅ 改為 ✅ → 其實原本就是 ✅。改為把 `title` 的 **kind** 改成 `integer`。
- 重新執行端點。徽章現在會顯示 **Invalid**，Response 分頁會標示出不相符的欄位。這正是 Zwaggen 抓得到、Postman 抓不到的東西。

繼續下一步前，把 `title` 還原成 `string`。

## 下一步

- [核心概念](/guide/core-concepts) — 完整的心智模型（Spec、Environments、Types、Endpoints）。
- [型別建構器](/guide/type-builder) — 原始型別、unions、arrays、references、examples。
- [斷言與串接](/guide/assertions-and-chaining) — 狀態 / 內容斷言，把某次回應的值重複用在下一個請求。
