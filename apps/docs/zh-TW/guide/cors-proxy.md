---
description: 當目標 API 擋掉瀏覽器的 Origin 時，透過 Zwaggen 的 CORS Proxy 把請求轉過去。
---

# CORS Proxy

瀏覽器預設會擋掉跨來源的回應，除非伺服器主動允許。你手上的 API 多半不會特地為每個開發者的筆電開權限，所以 Zwaggen 附帶了一個開發時用的 proxy。

## 它是什麼

`zwaggen-proxy` 是個小型的 Node 伺服器（原始碼在 `packages/proxy/`）。它會把你的請求轉發到真實 API，再在回應上加上寬鬆的 CORS 標頭，讓瀏覽器願意接受。

## 什麼時候會需要

- 目標 API 沒有送 `Access-Control-Allow-Origin`（或沒有包含你的 origin）。
- 瀏覽器跳出類似「CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.」的錯誤。
- 執行面板看到 `status: 0` 而且完全沒有內容 — 這是典型被 CORS 擋掉的樣子。

## 什麼時候不需要

- **同 origin** 的 API（和 Zwaggen App 部署在同一個 origin）。
- 宣告寬鬆 CORS 的公開 API — JSONPlaceholder、GitHub 公開 API、大多數 OpenAPI 托管服務。
- 你可以在開發環境上幫 API 加上 `Access-Control-Allow-Origin` 的情況。

## 跑起來

```bash
npx zwaggen-proxy
```

預設埠號為 `8787`。用 `--port` 改掉：

```bash
npx zwaggen-proxy --port 9001
```

讓它在另一個終端機視窗裡一直跑著。

## 在 App 裡打開 proxy 模式

- 在執行面板裡把 **Use proxy** 切成開啟。
- 把 proxy URL 設成 `http://localhost:8787`（有用 `--port` 的話請自行調整）。
- 正常送出即可。

App 會把外送請求改寫成 `POST http://localhost:8787/?url=<original-url>`，並把原本的 method、標頭、內容一起轉過去。URL 預覽上看到的還是真實目標 URL；proxy 就是一個透明的中繼站。

## 安全

- **不要把這個 proxy 公開部署。** 它是個 open relay — 任何知道 URL 的人都能透過你的伺服器去發跨來源請求。
- proxy 不做任何認證。如果一定要暴露在 `localhost` 之外，請放在 VPN / 防火牆後面。
- proxy 本身不會記錄請求內容，但宿主 Node 的 log 可能會 — 拿真實憑證測試時要留意。

## 疑難排解

- **「Proxy returned 502」** — 目標 API 拒絕連線；proxy 把錯誤轉回來。請檢查目標是不是真的可達。
- **瀏覽器 DevTools 網路面板出現「ECONNREFUSED」** — proxy 沒在跑，或是你用錯埠號了。
- **還是被 CORS 擋下來** — 確認 proxy URL 是 `http://` 而不是 `https://`，並確認沒有瀏覽器外掛把你自訂的標頭剝掉。
