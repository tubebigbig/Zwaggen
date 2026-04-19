---
description: 對回應內容加斷言、擷取值，並把多個請求串起來，讓前一個的回應餵給下一個。
---

# 斷言與回應串接

編輯器裡共用同一個分頁的兩個功能：**斷言** 檢查回應符不符合你的期待，**串接** 把某個值擷取下來給下一個請求用。

![端點的斷言與擷取區塊，顯示期望狀態、最大延遲、必要標頭與一筆擷取](/screenshots/assertions-tab.png)

## 斷言

打開一個端點，點 **Assertions** 分頁。你可以宣告：

- **期望狀態**（Expected status）— 單一數字狀態（例如 `200`）。只要伺服器回傳其他狀態碼，就算內容驗證過了，這次執行還是會被標記成失敗。
- **最大延遲**（Max latency）— 毫秒數。第一個 byte 超過這個時間就算失敗。
- **必要標頭**（Required headers）— 回應一定要帶的名稱 / 值成對。檢查方式是值完全相等。

一次執行要全部滿足下面兩項才算通過：

1. 回應內容能以該狀態碼對應的回應型別通過驗證（見[執行請求](/zh-TW/guide/running-requests)），
2. 而且每一條斷言都通過。

失敗的斷言會列在 Response 分頁裡，以紅色的「Assertions failed」標題顯示。

### 斷言不是什麼

- 不是任意的 JavaScript — 沒有 Postman 那種 `pm.test(…)` 腳本。如果你需要自由形式的檢查，可以考慮 [CI-mode CLI](https://github.com/tubebigbig/Zwaggen)（還在 repo TODO 裡規畫中）。
- 也不是完整的 contract 測試套件 — 它們是疊在型別驗證器上面的輕量健檢。

## 回應串接

使用情境：你登入之後、回應帶回一個 token，希望下一個請求自動帶上這個 token。

擷取出來的值會寫進 **環境變數**（env variables）— 沒有另外獨立的「chain」命名空間。之後要用這個值，就用一般的 `{{env.<名稱>}}` 佔位符。

### 擷取（Capture）

在會回傳想要值的那個端點，捲到編輯器的 **Captures** 區塊，點 **Add capture**。每一列有三個欄位：

- **Path** — 回應內容的點號路徑（例如 `data.token`、`items[0].id`）。支援陣列的 bracket 索引。
- **Set var** — 要寫入的環境變數名稱（例如 `authToken`）。
- **Env** — 要寫進哪個環境。預設是 **Active environment**；也可以指定特定環境名稱。

收到 2xx 回應後，Zwaggen 會依 `path` 從回應內容裡抽值，寫進目標環境的 `env.<setVar>`。

### 引用

在任何請求裡 — 路徑、標頭或內容 — 都用 `{{env.authToken}}`。用法和其他環境變數的佔位符完全一樣，唯一差別是這個值是擷取時寫進去的。

### 典型流程

1. 定義 `POST /auth/login`，加一條擷取：`path: token`、`set var: authToken`。
2. 定義 `GET /me`，在標頭加入 `Authorization: Bearer {{env.authToken}}`。
3. 執行 `POST /auth/login`。當前環境的 `authToken` 變數就會被填進去。
4. 執行 `GET /me`。`Authorization` 標頭會從環境變數取值。

### 限制

- **只支援內容（body）。** path 是從回應內容抽值。標頭跟狀態目前沒辦法擷取。
- **跟著環境一起保存。** 擷取到的值直接存在環境上，重新整理頁面也還在。要清掉請直接在環境編輯器裡編輯那個變數。
