// ═══════════════════════════════════════════════════════════════
// Google Apps Script — 持股追蹤 API 中間層
// 部署為 Web App 後，前端可透過 URL 讀寫你的 Google Sheet
// ═══════════════════════════════════════════════════════════════

// ⬇️ 請將此處改為你的 Google Sheet ID（從網址中取得）
const SHEET_ID = "在這裡貼上你的_SHEET_ID";

// ⬇️ 工作表名稱（預設為第一個工作表）
const SHEET_NAME = "工作表1";

// ═══ GET：讀取所有資料 ═══
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      return jsonResponse({ success: true, data: [], headers: [], message: "工作表為空" });
    }

    const headers = data[0].map(h => String(h).trim());
    const rows = data.slice(1)
      .filter(row => row.some(cell => cell !== "" && cell != null))
      .map(row => {
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = row[i] != null ? row[i] : "";
        });
        return obj;
      });

    return jsonResponse({
      success: true,
      data: rows,
      headers: headers,
      count: rows.length,
      lastUpdated: new Date().toISOString()
    });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ═══ POST：寫回資料到 Sheet ═══
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || "overwrite";

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

    if (action === "overwrite" && body.rows) {
      // 清空後寫入（保留標題列）
      const headers = body.headers || [
        "開倉日期", "代號 (Symbol)", "名稱", "幣別", "方向", "狀態",
        "股數", "進場價", "出場價", "目前股價", "損益金額", "報酬率 (%)", "備註"
      ];

      sheet.clearContents();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

      if (body.rows.length > 0) {
        const values = body.rows.map(row =>
          headers.map(h => row[h] != null ? row[h] : "")
        );
        sheet.getRange(2, 1, values.length, headers.length).setValues(values);
      }

      return jsonResponse({
        success: true,
        message: `已寫入 ${body.rows.length} 筆資料`,
        count: body.rows.length
      });

    } else if (action === "append" && body.row) {
      // 追加一筆
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const newRow = headers.map(h => body.row[h] != null ? body.row[h] : "");
      sheet.appendRow(newRow);

      return jsonResponse({ success: true, message: "已新增一筆資料" });

    } else if (action === "update" && body.rowIndex != null && body.row) {
      // 更新特定列（rowIndex 從 0 開始，對應資料列）
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const updatedRow = headers.map(h => body.row[h] != null ? body.row[h] : "");
      sheet.getRange(body.rowIndex + 2, 1, 1, headers.length).setValues([updatedRow]);

      return jsonResponse({ success: true, message: `已更新第 ${body.rowIndex + 1} 筆` });

    } else if (action === "delete" && body.rowIndex != null) {
      // 刪除特定列
      sheet.deleteRow(body.rowIndex + 2);
      return jsonResponse({ success: true, message: `已刪除第 ${body.rowIndex + 1} 筆` });
    }

    return jsonResponse({ success: false, error: "未知的 action" });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ═══ 回傳 JSON + CORS ═══
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
