// ═══════════════════════════════════════════════════════════════
// Google Apps Script — 持股追蹤 API v2
// 功能：讀寫資料、自動抓即時股價（美股+台股）、每日損益歷史
// ═══════════════════════════════════════════════════════════════

const SHEET_ID = "在這裡貼上你的_SHEET_ID";
const SHEET_NAME = "工作表1";
const HISTORY_SHEET = "損益歷史";

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "read";
    if (action === "history") return jsonResponse(getHistory());
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonResponse({ success:true, data:[], headers:[] });
    var headers = data[0].map(function(h){return String(h).trim();});
    var rows = [];
    for (var i=1;i<data.length;i++){
      var row=data[i]; if(!row.some(function(c){return c!==""&&c!=null;})) continue;
      var obj={}; headers.forEach(function(h,j){obj[h]=row[j]!=null?row[j]:"";}); rows.push(obj);
    }
    return jsonResponse({success:true,data:rows,headers:headers,count:rows.length,lastUpdated:new Date().toISOString()});
  } catch(err) { return jsonResponse({success:false,error:err.message}); }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || "overwrite";
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

    if (action === "overwrite" && body.rows) {
      var headers = body.headers || ["開倉日期","代號 (Symbol)","名稱","幣別","方向","狀態","股數","進場價","出場價","目前股價","損益金額","報酬率 (%)","備註"];
      sheet.clearContents();
      sheet.getRange(1,1,1,headers.length).setValues([headers]);
      if (body.rows.length > 0) {
        var values = body.rows.map(function(row){return headers.map(function(h){return row[h]!=null?row[h]:"";});});
        sheet.getRange(2,1,values.length,headers.length).setValues(values);
      }
      return jsonResponse({success:true,message:"已寫入 "+body.rows.length+" 筆",count:body.rows.length});
    }

    if (action === "updatePrices") {
      var result = updateAllPrices();
      recordDailyHistory();
      return jsonResponse(result);
    }

    return jsonResponse({success:false,error:"未知 action"});
  } catch(err) { return jsonResponse({success:false,error:err.message}); }
}

// ═══ 批量抓股價並更新 Sheet ═══
function updateAllPrices() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return {success:true,message:"無資料",prices:[]};

  var headers = data[0].map(function(h){return String(h).trim();});
  var symCol=-1,priceCol=-1,statusCol=-1;
  headers.forEach(function(h,i){
    var hh=h.replace(/\s/g,'').toLowerCase();
    if(/代號|symbol/.test(hh)) symCol=i;
    if(/目前股價|currentprice|現價/.test(hh)) priceCol=i;
    if(/狀態|status/.test(hh)) statusCol=i;
  });
  if(symCol<0||priceCol<0) return {success:false,error:"找不到必要欄位"};

  // 收集要抓的 symbols
  var jobs = []; // [{row, symbol, query}]
  for(var i=1;i<data.length;i++){
    var sym=String(data[i][symCol]||"").trim();
    var status=statusCol>=0?String(data[i][statusCol]||""):"";
    if(!sym || /已平倉|closed/i.test(status)) continue;
    var query=sym;
    if(/^\d{4,5}$/.test(sym)) query="TPE:"+sym;
    else if(/\.TW[O]?$/i.test(sym)) query="TPE:"+sym.replace(/\.TW[O]?$/i,"");
    else if(/\.HK$/i.test(sym)) query="HKG:"+sym.replace(/\.HK$/i,"");
    jobs.push({row:i, symbol:sym, query:query});
  }

  if(jobs.length===0) return {success:true,message:"無持倉中部位",prices:[]};

  // 用暫存 sheet 批量寫入 GOOGLEFINANCE 公式
  var tmp = ss.getSheetByName("_tmp_price");
  if(!tmp) tmp = ss.insertSheet("_tmp_price");
  tmp.clear();

  var formulas = jobs.map(function(j){return ['=GOOGLEFINANCE("'+j.query+'","price")'];});
  tmp.getRange(1,1,formulas.length,1).setFormulas(formulas);
  SpreadsheetApp.flush();
  Utilities.sleep(3000);

  var vals = tmp.getRange(1,1,formulas.length,1).getValues();
  var prices = [];
  var updated = 0;

  for(var k=0;k<jobs.length;k++){
    var v = vals[k][0];
    var ok = typeof v==="number" && v>0;
    prices.push({symbol:jobs[k].symbol, price:ok?v:null, success:ok});
    if(ok){
      sheet.getRange(jobs[k].row+1, priceCol+1).setValue(v);
      updated++;
    }
  }

  tmp.clear();

  // 重算損益
  recalcPnL(sheet, headers);

  return {success:true, message:"已更新 "+updated+" 檔股價", updated:updated, prices:prices, lastUpdated:new Date().toISOString()};
}

// ═══ 重算損益 ═══
function recalcPnL(sheet, headers) {
  var data = sheet.getDataRange().getValues();
  var cols={};
  headers.forEach(function(h,i){
    var hh=h.replace(/\s/g,'').toLowerCase();
    if(/方向|direction/.test(hh)) cols.dir=i;
    if(/狀態|status/.test(hh)) cols.status=i;
    if(/股數|shares/.test(hh)) cols.shares=i;
    if(/進場價|entryprice/.test(hh)) cols.entry=i;
    if(/出場價|exitprice/.test(hh)) cols.exit=i;
    if(/目前股價|currentprice/.test(hh)) cols.price=i;
    if(/損益金額/.test(hh)) cols.pnl=i;
    if(/報酬率/.test(hh)) cols.roi=i;
  });
  if(cols.entry==null||cols.shares==null||cols.price==null) return;

  for(var i=1;i<data.length;i++){
    var dir=cols.dir!=null?String(data[i][cols.dir]||""):"多";
    var m=/空|short/i.test(dir)?-1:1;
    var status=cols.status!=null?String(data[i][cols.status]||""):"";
    var closed=/已平倉|closed/i.test(status);
    var shares=parseFloat(data[i][cols.shares])||0;
    var entry=parseFloat(data[i][cols.entry])||0;
    var exit=cols.exit!=null?(parseFloat(data[i][cols.exit])||0):0;
    var price=parseFloat(data[i][cols.price])||0;
    var ref=closed&&exit?exit:price;
    var cost=entry*shares;
    var pnl=m*(ref-entry)*shares;
    var roi=cost>0?(pnl/cost)*100:0;
    if(cols.pnl!=null) sheet.getRange(i+1,cols.pnl+1).setValue(Math.round(pnl*100)/100);
    if(cols.roi!=null) sheet.getRange(i+1,cols.roi+1).setValue(Math.round(roi*100)/100);
  }
}

// ═══ 記錄每日損益歷史 ═══
function recordDailyHistory() {
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var sheet=ss.getSheetByName(SHEET_NAME)||ss.getSheets()[0];
  var data=sheet.getDataRange().getValues();
  if(data.length<2) return;
  var headers=data[0].map(function(h){return String(h).trim();});
  var cols={};
  headers.forEach(function(h,i){
    var hh=h.replace(/\s/g,'').toLowerCase();
    if(/方向|direction/.test(hh)) cols.dir=i;
    if(/狀態|status/.test(hh)) cols.status=i;
    if(/股數|shares/.test(hh)) cols.shares=i;
    if(/進場價|entryprice/.test(hh)) cols.entry=i;
    if(/出場價|exitprice/.test(hh)) cols.exit=i;
    if(/目前股價|currentprice/.test(hh)) cols.price=i;
  });
  var totalPnl=0,totalCost=0;
  for(var i=1;i<data.length;i++){
    var dir=cols.dir!=null?String(data[i][cols.dir]||""):"多";
    var m=/空|short/i.test(dir)?-1:1;
    var status=cols.status!=null?String(data[i][cols.status]||""):"";
    var closed=/已平倉|closed/i.test(status);
    var shares=parseFloat(data[i][cols.shares])||0;
    var entry=parseFloat(data[i][cols.entry])||0;
    var exit=cols.exit!=null?(parseFloat(data[i][cols.exit])||0):0;
    var price=cols.price!=null?(parseFloat(data[i][cols.price])||0):0;
    var ref=closed&&exit?exit:price;
    totalPnl+=m*(ref-entry)*shares;
    totalCost+=entry*shares;
  }
  var roi=totalCost>0?(totalPnl/totalCost)*100:0;
  var hist=ss.getSheetByName(HISTORY_SHEET);
  if(!hist){hist=ss.insertSheet(HISTORY_SHEET);hist.getRange(1,1,1,4).setValues([["日期","總損益","總成本","報酬率(%)"]]);}
  var today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyy-MM-dd");
  var hd=hist.getDataRange().getValues();
  var found=false,frow=-1;
  for(var j=1;j<hd.length;j++){
    var ds=(hd[j][0] instanceof Date)?Utilities.formatDate(hd[j][0],Session.getScriptTimeZone(),"yyyy-MM-dd"):String(hd[j][0]);
    if(ds===today){found=true;frow=j+1;break;}
  }
  var rd=[today,Math.round(totalPnl*100)/100,Math.round(totalCost*100)/100,Math.round(roi*100)/100];
  if(found) hist.getRange(frow,1,1,4).setValues([rd]); else hist.appendRow(rd);
}

function getHistory() {
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var hist=ss.getSheetByName(HISTORY_SHEET);
  if(!hist) return {success:true,history:[]};
  var data=hist.getDataRange().getValues();
  if(data.length<2) return {success:true,history:[]};
  var history=[];
  for(var i=1;i<data.length;i++){
    var d=data[i][0];
    var ds=(d instanceof Date)?Utilities.formatDate(d,Session.getScriptTimeZone(),"yyyy-MM-dd"):String(d);
    history.push({date:ds,pnl:parseFloat(data[i][1])||0,cost:parseFloat(data[i][2])||0,roi:parseFloat(data[i][3])||0});
  }
  return {success:true,history:history};
}

// 每天自動執行（需手動設定觸發器）
function autoUpdate() { updateAllPrices(); recordDailyHistory(); }

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
