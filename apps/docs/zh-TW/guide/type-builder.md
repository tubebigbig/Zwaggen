---
description: 用 primitive、object、array、ref 組合請求與回應型別，不必自己動手寫 TypeScript。
---

# 型別建構器

型別描述你的 API 送出與收到的資料結構。型別建構器在 App 最左側的側欄；每個端點的參數、請求內容、回應都是從這些型別拼出來的。

![型別建構器中列出三個型別並展開其中一個](/screenshots/type-builder-overview.png)

## Primitive 型別

- **string** — 選填的 `minLength`、`maxLength`、`pattern`（regex）、`enum`（允許的 literal 清單）。
- **number** — 浮點數。選填的 `min`、`max`、`enum`。
- **integer** — 整數，約束條件和 `number` 一樣。
- **boolean** — `true` 或 `false`。
- **null** — literal 值 `null`。
- **literal** — 單一具體值（`"active"`、`42`、`true`、`null`）。當 union 裡的判別值很好用。

## Composite 型別

### Array

`array` 外面包住任一元素型別。選填的 `minItems` / `maxItems`。在 array 上設 `example` 可以在執行面板預填範例資料。

### Object

`object` 是一組具名欄位。每個欄位有 `name`、`type`、`required` 旗標，以及選填的 `description`。把 **strict** 打開後，規格裡沒定義的欄位一出現就會被視為驗證失敗 — 想抓出後端偷偷多塞欄位時很有用。

### Union

`union` 是一串變體（variants）。值只要符合任何一個變體就算通過。搭配 `literal` 判別值就能組出 tagged union：

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

`ref` 用名稱指到另一個型別。允許循環參照 — 一個 `TreeNode` 物件底下帶一個 `array<ref:TreeNode>` 的欄位完全沒問題；執行時驗證器走訪時會自己偵測循環。

## Examples

任何 composite 型別（或 array / string）都可以掛一個 `example` 值。當你打開一個端點的執行面板、而該端點的請求內容 ref 到一個帶 example 的型別時，內容輸入框會用這個 example 預填。這是最快的方法去確認請求該長什麼樣子。

## 刪除守門

刪掉一個還被引用的型別，會直接讓端點壞掉。所以按下刪除會跳出一個對話框，列出每一個引用點 — 端點、其他型別、請求內容、回應型別。你有兩個選擇：

- **取消**（預設）。先移除引用，再回來刪。
- **強制刪除**。型別被移除；每個原本的引用點會在端點編輯器裡變成驗證錯誤並被標出來，直到你修掉為止。

只有在你打算馬上換掉這個型別的時候才按 **強制刪除** — 否則請按 **取消**，先重構再說。

## 型別存在哪裡

型別放在規格檔最上層，是以名稱為 key 的物件結構。關於型別如何跟端點、環境串起來，請見[核心概念](/zh-TW/guide/core-concepts)。
