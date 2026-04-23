# Codegen 程式碼產生

Zwaggen 規格是您 API 合約的**單一資料來源**。Codegen 把 `.zwag` 規格轉成 TypeScript 型別、Zod 執行期驗證器,以及一個前端可以直接呼叫的型別化 client — 不必再對著 Swagger 手刻 interface,合約變動時也不必手動同步。

## 安裝

`zwag` CLI 內建 codegen。透過 npm/pnpm/bun 安裝:

```bash
pnpm add -D @zwaggen/cli zod
# 或
npm install -D @zwaggen/cli zod
# 或
bun add -d @zwaggen/cli zod
```

`zod` 是 peer dependency — 產生出來的 `schemas.ts` 會 import 它。

## 快速開始

假設您的規格存在 `./api.zwag`(從 Zwaggen Web 儲存的檔案):

```bash
zwag generate ts ./api.zwag --out ./src/generated --client
```

這會在 `./src/generated/` 寫入三個檔案:

- `types.ts` — 規格中每個 Type 對應的純 TypeScript interface 與 type alias
- `schemas.ts` — Zod schemas(`UserSchema`、`AdminSchema`、…)用於執行期驗證
- `client.ts` — 您針對 API base URL 實例化的型別化 client

## 使用產生的 client

```typescript
import { createClient } from './generated/client';

const api = createClient({
  baseUrl: 'https://api.example.com',
  headers: () => ({ authorization: `Bearer ${getToken()}` }),
});

const users = await api.users.listUsers();      // 型別化: Promise<User[]>
const me    = await api.users.getUser({ id: 'u1' });
const made  = await api.users.createUser({ body: { id: 'u9', name: 'New' } });
```

每個回應都會經過對應的 Zod schema 驗證 — 如果 API 漂移、回傳了錯誤的形狀,您會在呼叫端拿到清楚的執行期錯誤,而不是在元件樹深處看到謎樣的 `undefined`。

## Watch 模式

在開發時讓 codegen 在背景跑。它會 debounce 並在每次存檔時重新產生:

```bash
zwag generate ts ./api.zwag --out ./src/generated --client --watch
```

加進您的 `dev` script:

```json
{
  "scripts": {
    "codegen": "zwag generate ts ./api.zwag --out ./src/generated --client",
    "codegen:watch": "zwag generate ts ./api.zwag --out ./src/generated --client --watch",
    "dev": "concurrently 'pnpm codegen:watch' 'vite'"
  }
}
```

## 只產生 schemas

如果您只要執行期驗證器(例如 TS 型別來自其他來源):

```bash
zwag generate zod ./api.zwag --out ./src/generated
```

這只會輸出 `schemas.ts`。

## 通用 runtime

產生的程式碼只用 `globalThis.fetch`、`URL`、`JSON`、`zod`。可在以下環境直接執行,不需修改:

- 瀏覽器(現代 evergreen)
- Node.js ≥ 18
- Deno
- Bun
- React Native(目標版本低於 RN 0.71 時需要 fetch polyfill)

產生的輸出沒有任何 Node 專屬 import。您的 bundler(Vite、esbuild、webpack、Rollup、…)會處理其餘的事。

## 要不要把產生的檔案加進版控?

兩種做法都可行,挑適合您團隊的:

**做法 A — 加進版控。** 合約變動時 PR 會顯示有意義的 diff。CI 只要跑 `tsc`。Reviewer 直接看到型別怎麼變。

**做法 B — `.gitignore` 它們,在 CI 重新產生。** 讓 repo 保持精簡。把 `pnpm codegen` 加進 CI 的 prebuild。代價:PR 不會顯示 inline 的型別變動,而且您需要一條乾淨的 spec → code pipeline。

做法 A 比較常見於產品團隊;做法 B 比較常見於 library。

## 確定性

產生的輸出是確定性的 — 同一份規格 → 跨機器、跨作業系統、跨多次執行都產出位元組相同的檔案。可安全加進版控,可安全在 CI 比對,可安全在 PR review。

## 輸出 flags

```
zwag generate ts <spec> [options]

  --out <dir>      輸出目錄 (預設: ./zwaggen-generated)
  --client         同時輸出 client.ts (型別化 client 物件)
  --no-types       不輸出 types.ts
  --no-schemas     不輸出 schemas.ts
  --watch          規格變動時重新執行 (200ms debounce)

zwag generate zod <spec> [options]

  --out <dir>      輸出目錄 (預設: ./zwaggen-generated)
  --watch          規格變動時重新執行
```

## 後端怎麼辦?

後端框架早就吃 OpenAPI。用 `zwag` 從規格匯出 OpenAPI 3 文件,然後把您現有的後端 codegen(NestJS、FastAPI、openapi-generator、oazapfts、…)指向那份檔案。合約一致 — 後端與前端都從同一份 `.zwag` 收斂。

## v1.1 新增

v1.1 + v1.2 follow-up 已經把原本 v1 的限制補齊:

- **資料夾前綴的型別 key 會被 sanitize。** 放在資料夾下的型別(key 形如 `auth/User`)會輸出合法識別字(TS 的 `auth_User`、Zod 的 `auth_UserSchema`)。繼承、ref、inline object 表達式都會對稱使用 sanitize 後的名稱。
- **endpoint 輸入裡的 inline object 型別。** 當 endpoint 直接 inline 宣告 `requestBody` 或 path / query 參數時,產生器會把該結構展開到 client 方法簽章中,而不再退回 `unknown`。TS 型別與 Zod schema 都會對應 inline 結構。
- **`headers` 支援 async factory。** `opts.headers` 接受 `Record<string, string>`、`() => Record<string, string>`、或 `() => Promise<Record<string, string>>`。Async token refresh 可以直接使用 — client 會在送出每個請求前 await factory。
- **依 tag 分組的 client API 使用 camelCase。** 帶有 OpenAPI `tags[]` 的端點會在 client 上分組(`client.users.get(...)` 而非一長串平的方法);分組 key 會被 camelize,所以多字詞 tag(像 `"User Profiles"`)會變成 `client.userProfiles`。

## v1 已知限制

- **path / query / header 命名衝突。** 輸入型別是一個 flat intersection。如果同一個名字同時是 path 與 query 參數,產生的 TS 型別會自相矛盾(tsc 會報錯)。在規格裡改名其中一個。

## 疑難排解

**「Cannot find module 'zod'」** — 在使用產生程式碼的專案執行 `pnpm add -D zod`(或對應套件管理工具的指令)。

**「Property X does not exist on type Y」** — 您的規格沒有定義欄位 X。打開規格、加上欄位、重新產生。

**測試通過但實際 API 回傳錯誤的形狀** — 那就是漂移。產生的 Zod parse 會丟出包含精確欄位路徑的錯誤。修 API 或更新規格;不論哪邊,都代表合約原本是錯的。
