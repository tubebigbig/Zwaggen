# 型別建構器

型別描述你的 API 送出與接收的結構。型別建構器是應用程式最左側的側欄；每個端點的參數、內容、回應都以這些型別組合而成。

![型別建構器中列出三個型別並展開其中一個](/screenshots/type-builder-overview.png)

## 原始型別

- **string** — 選填的 `minLength`、`maxLength`、`pattern`（regex）、`enum`（允許的 literal 清單）。
- **number** — 浮點數。選填的 `min`、`max`、`enum`。
- **integer** — 整數。與 `number` 相同的約束條件。
- **boolean** — `true` 或 `false`。
- **null** — literal 值 `null`。
- **literal** — 單一具體值（`"active"`、`42`、`true`、`null`）。在 union 裡當作判別值很好用。

## 複合型別

### Array

`array` 包裹任一元素型別。選填的 `minItems` / `maxItems`。在 array 上設定 `example` 會在執行面板中預填範例資料。

### Object

`object` 是有命名的欄位集合。每個欄位都有 `name`、`type`、`required` 旗標，以及選填的 `description`。把 **strict** 設為 true，便會拒絕帶有規格不知道欄位的回應 — 在想要抓到後端靜默新增欄位時很有用。

### Union

`union` 是一串變體（variants）的清單。只要符合任一變體，值就算通過驗證。搭配 `literal` 判別值就能組出 tagged union：

```json
{
  "kind": "union",
  "variants": [
    { "kind": "object", "fields": [{ "name": "status", "required": true, "type": { "kind": "literal", "value": "ok" } }, { "name": "data", "required": true, "type": { "kind": "ref", "ref": "Todo" } }] },
    { "kind": "object", "fields": [{ "name": "status", "required": true, "type": { "kind": "literal", "value": "error" } }, { "name": "message", "required": true, "type": { "kind": "string" } }] }
  ]
}
```

### Ref

`ref` 以名稱指向另一個型別。允許循環 — 一個名為 `TreeNode` 的物件帶有型別為 `array<ref:TreeNode>` 的欄位是可以的；執行時驗證器在走訪時會偵測循環。

## Examples

任何複合型別（或 array / string）都可以帶一個 `example` 值。當你為某個端點打開執行面板，而該端點的請求內容參照到帶有 example 的型別時，內容輸入框會以 example 預填。這是檢查請求結構最快的方式。

## 刪除守門

刪除一個還被參照的型別會靜默破壞端點。因此刪除動作會開啟一個對話視窗，列出每一個參照處 — 端點、其他型別、請求內容、回應型別。你有兩個選擇：

- **取消**（預設）。先移除參照再刪除。
- **強制刪除**。型別被移除；每個參照處會變成端點編輯器裡的驗證錯誤並被標示出來，直到你修好為止。

只有在你準備要替換這個型別時才用 **強制刪除** — 否則請選 **取消** 並重構。

## 型別存放在哪

型別放在規格檔案的最上層，以名稱為 key 的物件結構。關於型別如何與端點、環境產生關聯，請見[核心概念](/guide/core-concepts)。
