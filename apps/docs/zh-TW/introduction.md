---
description: Zwaggen 是什麼、為誰而做，以及它與 Postman、Swagger、Zod 的定位差異。
---

# 介紹

## 什麼是 Zwaggen？

- 一句話：Zwaggen 是一個跑在瀏覽器裡的 API 規格編輯器，會用型別描述你的 API，並在送出請求時即時驗證回應。
- 比喻：它把三個熟悉的工具揉在一起 — Postman（送真實請求）、Swagger/OpenAPI（描述 API）、Zod（用型別結構在執行時驗證回應）。
- 相較於 Postman：Zwaggen 的規格就是單一真相來源。每一次回應都會和規格中的型別即時對照，只要開始漂移立刻就看得到。
- 相較於 Swagger：Zwaggen 是可互動的 — 用來描述 API 的那份檔案，本身就是拿來測試 API 的工具。
- 相較於 Zod：驗證器直接內建在 App 裡，你不用在自己的程式碼裡寫 TypeScript 就能用。

## 什麼時候用它

- 正在設計一個新 API，想要一份同時包含型別、端點、範例的規格檔，並用 git 做版本控制。
- 想直接拿真實 API 和規格對照，不想為此再寫一份測試程式碼。
- 在審查一個 API 變更，想一眼看出兩個規格版本之間哪些是破壞性、哪些是非破壞性的差異。
- 已經維護了一份 OpenAPI 檔案，想要比 Swagger UI 更快的編輯器與測試器。

## 什麼時候別用它

- 你已經有一個成熟的 Postman 工作區加上 CI 測試套件 — Zwaggen 做的事情兩邊都會重疊。
- 你需要在 CI 強制跑 contract 測試。Zwaggen 目前是互動式工具；CI 模式還在規畫中（見 repo TODO）。
- 你需要 mock 或 stub。Zwaggen 會透過 CORS proxy 打到真實伺服器，不會假造回應。

## 文件其他頁面

- [安裝與環境需求](/zh-TW/installation) — 在本機執行 Zwaggen 所需要的一切。
- [快速上手](/zh-TW/quickstart) — 五分鐘做出你的第一份規格。
- [核心概念](/zh-TW/guide/core-concepts) — 心智模型：Spec、Environments、Types、Endpoints。
- 左側導覽列有每個功能各自一頁的指南。

[CORS Proxy](/zh-TW/guide/cors-proxy) 這一頁會說明什麼時候、為什麼會用到。自 v0.2.0 起,proxy 已經**內建在 `npx @zwaggen/web` 裡** — 在任何端點打開「Use proxy」開關就好,不用額外安裝或開終端機。
