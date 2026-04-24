---
description: 當目標 API 擋掉瀏覽器的 Origin 時,透過 Zwaggen 的 CORS Proxy 把請求轉過去 — 自 v0.2.0 起已內建在 npx @zwaggen/web 中。
---

# CORS Proxy

::: tip 已經在用 `npx @zwaggen/web`?那你已經完成了。
自 `@zwaggen/web` v0.2.0 起,proxy 已經**內建**進去。本機伺服器會在跟 SPA 同一個 port 上掛載 `/proxy` — 在任何端點打開 **Use proxy** 開關,請求就會走過去。不用額外安裝、不用第二個終端機、不用第二個 port。直接跳到[在 App 裡打開 proxy 模式](#在-app-裡打開-proxy-模式)。

你只有在以下情況才需要用下方的獨立 proxy:想把 proxy 跑在跟 SPA 不同的機器上,或是用 `npx @zwaggen/web --no-proxy` 啟動了 SPA。
:::

::: tip 即將推出
Zwaggen Desktop 透過作業系統的網路層執行請求,完全不受 CORS 限制,也不需要 proxy。詳見[桌面應用](/zh-TW/guide/desktop)。在桌面版推出之前,本指南介紹 Zwaggen Web 適用的 proxy 做法。
:::

瀏覽器預設會擋掉跨來源的回應,除非伺服器主動允許。多數 API 不會特地為每個開發者的筆電開權限,所以 Zwaggen 附帶了一個開發時用的 proxy。

## 它是什麼

proxy 是個小型的 Node 伺服器(原始碼在 `packages/proxy/`),會把你的請求轉發到真實 API,再在回應上加上寬鬆的 CORS 標頭,讓瀏覽器願意接受。

兩種跑法:

1. **內建 (預設)** — `npx @zwaggen/web` 會把 proxy 掛在 SPA 同一個 port 的 `/proxy` 路徑上。同 origin → 完全沒有 CORS preflight。
2. **獨立** — `npx @zwaggen/proxy`(或 `npx zwaggen-proxy`)在自己的 port 啟動 proxy(預設 `4801`)。適合 SPA 跟 proxy 不在同一台機器的情況。

## 什麼時候會需要

- 目標 API 沒有送 `Access-Control-Allow-Origin`(或沒有包含你的 origin)。
- 瀏覽器跳出類似「CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.」的錯誤。
- 執行面板看到 `status: 0` 而且完全沒有內容 — 這是典型被 CORS 擋掉的樣子。

## 什麼時候不需要

- **同 origin** 的 API(和 Zwaggen App 部署在同一個 origin)。
- 宣告寬鬆 CORS 的公開 API — JSONPlaceholder、GitHub 公開 API、大多數 OpenAPI 托管服務。
- 你可以在開發環境上幫 API 加上 `Access-Control-Allow-Origin` 的情況。

## 內建 proxy(預設)

```bash
npx @zwaggen/web
```

啟動 log 會出現:`Bundled CORS proxy: on (http://127.0.0.1:4173/proxy)`。SPA 已經自動設定好 proxy URL — 在任何端點打開 **Use proxy** 開關就完成了。

如果想關掉內建 proxy(例如想單獨測 SPA):

```bash
npx @zwaggen/web --no-proxy
```

啟動 log 會變成 `Bundled CORS proxy: off (--no-proxy)`。打開 **Use proxy** 的請求會 fallback 到獨立 proxy 的網址(`http://localhost:4801`)— 需要的話請另外開 `npx zwaggen-proxy`。

## 獨立 proxy

```bash
npx zwaggen-proxy
```

預設埠號為 `4801`。用 `--port` 改掉:

```bash
npx zwaggen-proxy --port=9001
```

讓它在另一個終端機視窗裡一直跑著。

## 在 App 裡打開 proxy 模式

- 在執行面板裡把每個端點的 **Use proxy** 切成開啟,或在 **設定 → 預設 proxy** 設整份規格的預設值。
- proxy URL 已經自動設定:在內建模式下是 `/proxy`(同 origin),否則是 `http://localhost:4801`。
- 正常送出即可。

App 會把外送請求改寫成 `<proxy-url>/proxy?url=<original-url>`,並把原本的 method、標頭、內容一起轉過去。URL 預覽上看到的還是真實目標 URL;proxy 就是一個透明的中繼站。

## 安全

- **不要把這個 proxy 公開部署。** 它是個 open relay — 任何知道 URL 的人都能透過你的伺服器去發跨來源請求。
- proxy 不做任何認證。如果一定要暴露在 `localhost` 之外,請放在 VPN / 防火牆後面。
- proxy 本身不會記錄請求內容,但宿主 Node 的 log 可能會 — 拿真實憑證測試時要留意。

## 疑難排解

- **「Proxy returned 502」** — 目標 API 拒絕連線;proxy 把錯誤轉回來。請檢查目標是不是真的可達。
- **瀏覽器 DevTools 網路面板出現「ECONNREFUSED」** — 獨立 proxy 沒在跑,或是你用錯埠號了。(內建模式不會 ECONNREFUSE — 它是同 origin。)
- **還是被 CORS 擋下來** — 確認 proxy URL 可以連得上,並確認沒有瀏覽器外掛把你自訂的標頭剝掉。檢查啟動 log 確認內建 proxy 是 **on**(沒有 `--no-proxy`)。
