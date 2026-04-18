# 斷言與回應串接

編輯器裡共用同一個分頁的兩個功能：**斷言** 檢查回應是否符合你的期待，**串接** 擷取值供下一個請求使用。

![端點的斷言與擷取區塊，顯示期望狀態、最大延遲、必要標頭與一筆擷取](/screenshots/assertions-tab.png)

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

擷取值會寫入 **環境變數**（env variables）— 沒有獨立的「chain」命名空間。之後要用這個值，就用一般的 `{{env.<名稱>}}` 佔位符。

### 擷取（Capture）

在會產出值的那個端點，捲到編輯器的 **Captures** 區塊並點擊 **Add capture**。每一列有三個欄位：

- **Path** — 回應內容的點號路徑（例如 `data.token`、`items[0].id`）。支援陣列的 bracket 索引。
- **Set var** — 要寫入的環境變數名稱（例如 `authToken`）。
- **Env** — 要寫入哪個環境。預設是 **Active environment**；也可指定特定環境名稱。

收到 2xx 回應後，Zwaggen 會依 `path` 從回應內容抽取值，寫入目標環境的 `env.<setVar>`。

### 參照

在任何請求裡 — 路徑、標頭或內容 — 使用 `{{env.authToken}}`。和其他環境變數的佔位符用法完全一樣，唯一差別是這個值是由擷取寫入的。

### 典型流程

1. 定義 `POST /auth/login` 並加一條擷取：`path: token`、`set var: authToken`。
2. 定義 `GET /me`，標頭加入 `Authorization: Bearer {{env.authToken}}`。
3. 執行 `POST /auth/login`。當下環境的 `authToken` 變數就會被填入。
4. 執行 `GET /me`。`Authorization` 標頭會從環境變數取值。

### 限制

- **只支援內容（body）。** 路徑是從回應內容抽值。標頭與狀態目前無法擷取。
- **與環境一起保存。** 擷取到的值直接存在環境上，重新整理頁面仍在。要清除請直接在環境編輯器裡編輯該變數。
