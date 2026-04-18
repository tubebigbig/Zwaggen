# 介紹

## 什麼是 Zwaggen？

- 一句話：Zwaggen 是瀏覽器中的型別化 API 規格編輯器與執行時測試器。
- 比喻：它把三個熟悉的工具結合在一起 — Postman（送真實請求）、Swagger/OpenAPI（描述 API）、Zod（用型別結構在執行時驗證回應）。
- 相較於 Postman：Zwaggen 的規格就是唯一的事實來源。每一次收到的回應都會即時比對規格中的型別，一旦出現漂移立刻發現。
- 相較於 Swagger：Zwaggen 是可互動的 — 文件化 API 的那份檔案本身就是用來測試 API 的檔案。
- 相較於 Zod：驗證器內建在應用中,不用在自己的程式碼裡寫 TypeScript 就能用。

## 什麼時候用它

- 正在設計一個新 API,想要一個同時包含型別、端點、範例的單一檔案,並在 git 中做版本控制。
- 想要直接比對真實 API 與規格,而不必寫測試程式碼。
- 在審查一個 API 變更,需要看兩個規格版本之間破壞性與非破壞性差異。
- 已經維護了一份 OpenAPI 檔案,希望有比 Swagger UI 更快的編輯器與測試器。

## 什麼時候不用它

- 已經有一個成熟的 Postman 工作區與 CI 測試套件 — Zwaggen 兩邊都會重疊。
- 需要在 CI 強制執行 contract 測試。Zwaggen 目前是互動式工具；CI 模式已規畫（見 repo TODO）。
- 需要 mock / stub。Zwaggen 會透過 CORS proxy 打到真實伺服器,不會假造回應。

## 文件其他頁面

- [安裝與環境需求](/installation) — 執行 Zwaggen 本地所需的一切。
- [快速上手](/quickstart) — 五分鐘完成第一份規格。
- [核心概念](/guide/core-concepts) — 心智模型：Spec、Environments、Types、Endpoints。
- 左側導覽列上每個功能一頁的指南。

[CORS Proxy](/guide/cors-proxy) 頁說明何時、為何要搭配 `npx zwaggen-proxy`。
