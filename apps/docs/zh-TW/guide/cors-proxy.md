# CORS Proxy

瀏覽器預設會擋下跨來源回應，除非伺服器主動允許。你手上的 API 多半不會為每個開發者的筆電開權限，所以 Zwaggen 附帶了一個開發時用的 proxy。

## 它是什麼

`zwaggen-proxy` 是個小型的 Node 伺服器（原始碼在 `packages/proxy/`）。它會把你的請求轉送到真實 API，並在回應上加上寬鬆的 CORS 標頭讓瀏覽器接受。

## 什麼時候需要

- 目標 API 沒有送 `Access-Control-Allow-Origin`（或沒有包含你的來源）。
- 你在瀏覽器看到類似「CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.」的錯誤。
- 你在執行面板看到 `status: 0` 且沒有內容 — 這是典型被 CORS 擋下的特徵。

## 什麼時候不需要

- **同來源** API（和 Zwaggen 應用程式部署在同一個 origin）。
- 宣告寬鬆 CORS 的公開 API — JSONPlaceholder、GitHub 公開 API、大多數 OpenAPI 寄存服務。
- 你可以設定在開發環境下加上 `Access-Control-Allow-Origin` 的 API。

## 執行它

```bash
npx zwaggen-proxy
```

預設埠號為 `8787`。用 `--port` 覆蓋：

```bash
npx zwaggen-proxy --port 9001
```

讓它在獨立的終端機視窗中持續執行。

## 在應用程式中啟用 proxy 模式

- 在執行面板中把 **Use proxy** 切成開啟。
- 把 proxy URL 設為 `http://localhost:8787`（若用了 `--port` 請自行調整）。
- 一般送出即可。

應用程式會把外送請求重寫成 `POST http://localhost:8787/?url=<original-url>`，並轉送原本的 method、標頭、內容。你在 URL 預覽看到的仍是真實目標 URL；proxy 是一個透明的中繼站。

## 安全

- **不要公開部署這個 proxy。** 它是個 open relay — 任何知道 URL 的人都能用它從你的伺服器發出跨來源請求。
- proxy 不做任何認證。如果必須把它暴露在 `localhost` 之外，請放在 VPN / firewall 後面。
- proxy 本身不會記錄請求內容，但宿主 Node 的 log 可能會 — 拿真實憑證測試時要留意。

## 疑難排解

- **「Proxy returned 502」** — 目標 API 拒絕連線；proxy 把錯誤轉回來。請檢查目標是否可達。
- **瀏覽器 DevTools 網路面板出現「ECONNREFUSED」** — proxy 沒執行，或你用錯埠號。
- **仍被 CORS 擋下** — 檢查 proxy URL 是 `http://` 而非 `https://`，並確認沒有瀏覽器外掛剝除你自訂的標頭。
