# 斷言與回應串接

編輯器裡共用同一個分頁的兩個功能：**斷言** 檢查回應是否符合你的期待，**串接** 擷取值供下一個請求使用。

## 斷言

開啟一個端點，點擊 **Assertions** 分頁。你可以宣告：

- **期望狀態**（Expected status）— 單一數字狀態（例如 `200`）。若伺服器回傳其他狀態，即使內容驗證通過，這次執行仍會被標記為失敗。
- **最大延遲**（Max latency）— 毫秒數。若第一個 byte 花了更久，就視為失敗。
- **必要標頭**（Required headers）— 回應必須攜帶的名稱 / 值成對。檢查以值完全相等為準。

一次執行唯有下列條件都成立才算通過：

1. 內容能以該回傳狀態的回應型別通過驗證（見[執行請求](/guide/running-requests)），並且
2. 每一條斷言都通過。

失敗的斷言會列在 Response 分頁裡，以紅色的「Assertions failed」標題顯示。

### 斷言不是什麼

- 不是任意的 JavaScript — 沒有 Postman 那種 `pm.test(…)` 腳本。若需要自由形式的檢查，可考慮 [CI-mode CLI](https://github.com/tubebigbig/Zwaggen)（在 repo TODO 中計畫中）。
- 不是完整的 contract 測試套件 — 它們是疊加在真正的型別驅動驗證器之上的健檢。

## 回應串接

使用情境：你登入後、回應帶回一個 token，希望下一個請求自動帶上這個 token。

### 擷取（Capture）

在會產出值的那個端點打開 **Assertions & Chaining → Captures**。新增一列：

- **Name** — chain 的 key（例如 `authToken`）。
- **Source** — `body`、`header` 或 `status`。
- **Path** — `body` 時是以點號連接的 JSON 路徑（`data.token`）；`header` 時是標頭名稱。

下一次成功執行時，Zwaggen 會把擷取到的值以該名稱儲存在本 session 的 chain map 中。

### 參照

在任何請求裡 — 路徑、標頭或內容 — 使用 `{{chain.authToken}}`。佔位符會在送出時解析；若 chain 名稱是空的（沒有擷取執行過），執行會在送出前拋錯，訊息為「chain value not set」。

### 典型流程

1. 定義 `POST /auth/login` 端點，附一條擷取：`name: authToken`、`source: body`、`path: token`。
2. 定義 `GET /me` 端點，標頭帶 `Authorization: Bearer {{chain.authToken}}`。
3. 執行 `POST /auth/login`。在歷史紀錄抽屜中看到擷取被填入。
4. 執行 `GET /me`。Authorization 標頭就會從 chain 填入。

### 清除 chain 的值

擷取值存活於本 session 的記憶體中。關掉分頁就消失。若要在 session 中途清除，打開歷史紀錄抽屜並使用 **Clear chain values**。
