# ☁️ 持股追蹤系統 — 雲端設定教學

## 架構說明

```
Google Sheet (你的資料)
      ↕
Google Apps Script (免費 API 中間層)
      ↕
前端 App (Claude Artifact / GitHub Pages)
```

**優點：完全免費、不需要 API Key、即時雲端同步**

---

## 第一步：準備 Google Sheet

1. 打開你的 Google Sheet
2. 確認第一列標題為：

| 開倉日期 | 代號 (Symbol) | 名稱 | 幣別 | 方向 | 狀態 | 股數 | 進場價 | 出場價 | 目前股價 | 損益金額 | 報酬率 (%) | 備註 |
|---------|-------------|------|-----|------|------|------|-------|-------|---------|---------|-----------|------|

3. 記下你的 **Sheet ID**（網址中 `/d/` 和 `/edit` 之間的那串字）

```
https://docs.google.com/spreadsheets/d/【這串就是你的 SHEET_ID】/edit
```

---

## 第二步：建立 Google Apps Script

1. 在你的 Google Sheet 中，點擊 **擴充功能** → **Apps Script**
2. 刪除編輯器中的所有預設程式碼
3. 將 `google-apps-script.js` 檔案的完整內容貼上
4. **重要：** 修改第 5 行的 `SHEET_ID`，改為你自己的 Sheet ID
5. 如果你的工作表名稱不是「工作表1」，也修改第 8 行的 `SHEET_NAME`

```javascript
const SHEET_ID = "1aBcDeFgHiJkLmNoPqRsTuVwXyZ"; // ← 改成你的
const SHEET_NAME = "工作表1"; // ← 改成你的工作表名稱
```

---

## 第三步：部署為 Web App

1. 在 Apps Script 編輯器中，點擊 **部署** → **新增部署**
2. 左側類型選擇 ⚙️ **網頁應用程式**
3. 設定：
   - **說明：** 持股追蹤 API（隨意填寫）
   - **執行身分：** 我自己
   - **存取權限：** **所有人**（這樣前端才能呼叫）
4. 點擊 **部署**
5. 首次部署會要求授權，點 **授權存取** → 選擇你的 Google 帳號
6. 如果出現「這個應用程式未經 Google 驗證」，點 **進階** → **前往（不安全）**
7. 複製產生的 **Web App 網址**（格式如下）

```
https://script.google.com/macros/s/AKfycbx.../exec
```

---

## 第四步：連線到 App

1. 打開持股追蹤 App
2. 點右上角 ☁️ 按鈕
3. 貼上剛才複製的 Web App 網址
4. 點「🔗 測試連線」確認成功
5. 點「儲存」

現在你可以：
- **⬇ 從 Sheet 拉取** — 讀取 Google Sheet 最新資料
- **⬆ 寫回 Sheet** — 將 App 中的變更（含自動計算的損益）同步回 Sheet

---

## 第五步（可選）：部署到 GitHub Pages

如果你想在手機上隨時存取，可以將前端部署到 GitHub Pages：

### 建立 GitHub Repository

1. 到 [github.com/new](https://github.com/new) 建立新 repo
2. 名稱例如：`portfolio-tracker`
3. 設為 **Public**

### 上傳檔案

將 `portfolio-cloud.jsx` 的內容包裝成一個 `index.html`：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>持股追蹤</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    // 將 portfolio-cloud.jsx 的完整內容貼在這裡
    // 注意：移除 import 語句，改用 React.useState 等
  </script>
</body>
</html>
```

### 啟用 GitHub Pages

1. 到 repo 的 **Settings** → **Pages**
2. Source 選 **Deploy from a branch**
3. Branch 選 **main** → **/(root)**
4. 點 Save
5. 幾分鐘後就能在 `https://你的帳號.github.io/portfolio-tracker/` 存取

---

## 更新 Apps Script

如果修改了 Apps Script 程式碼：

1. 在 Apps Script 編輯器中修改後
2. 點 **部署** → **管理部署**
3. 點 ✏️ 鉛筆圖示
4. 版本選 **新版本**
5. 點 **部署**

⚠️ **注意：** 每次修改都要建新版本並重新部署，否則 URL 仍指向舊版。

---

## 常見問題

### Q: 出現 CORS 錯誤？
A: 確認 Apps Script 的存取權限設為「所有人」，且已重新部署。

### Q: 測試連線失敗？
A: 檢查 SHEET_ID 是否正確，以及是否已授權 Apps Script 存取你的 Sheet。

### Q: 損益金額和報酬率在 Sheet 裡是空的？
A: 這兩個欄位由系統自動計算。點「⬆ 寫回 Sheet」就會填入計算結果。

### Q: 手機上怎麼使用？
A: 部署到 GitHub Pages 後，將網址加到手機桌面即可像 App 一樣使用。
