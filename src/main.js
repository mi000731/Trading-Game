// === 全域變數 ===
let marginInterestAccrued = 0; // ✨ 新增：累積融資利息
let shortSellDate = null; // ✨ 新增：記錄融券賣出日
let taxFee = 0; // ✏️ 新增：累積證券交易稅
let stockData = [];
let currentIndex = getRandomStartIndex();
let virtualStartDate = new Date();
let cash = 1000000;
let initialCapital = 1000000;
let position = 0, marginPosition = 0, shortPosition = 0;
let longCost = 0, marginCost = 0, shortCost = 0;
let longFee = 0, marginFee = 0, shortFee = 0;
let quantity = 0;
let selectedAction = 'hold';
let chartInitialized = false;
let chart, candleSeries;
let stockName = "範例公司";  // 🔥 全域變數
let stockCode = "";          // 🔥 全域變數
let stockNameMap = {};       // 🔥 股票代碼 ➔ 股票名稱 對應表
let animationMonitorTimeout = null;

const lotSize = 1000;
const financingRate = 6.45 / 100 / 365;
const borrowRate = 0.2 / 100 / 365;  // 日利率
const shortFeeRate = 0.8 / 1000;
const daytradeBuyFeeRate = 0.1425 / 100;
const daytradeSellFeeRate = (0.1425 + 0.15) / 100;
const transactionFeeRate = 1.425 / 1000;
const taxRate = 0.003; // ✏️ 0.3% 的交易稅

function triggerDownload() {
  const overlay = document.getElementById('overlay-button');
  overlay.style.display = 'none';  // 點一次就隱藏
  downloadStock();                 // 直接呼叫你原本下載股價的功能
}

// 🔥 啟動時檢查是否需要顯示透明按鈕
function showOverlayIfNeeded() {
  if (stockData.length === 0) {
    const overlay = document.getElementById('overlay-button');
    overlay.style.display = 'block';
  }
}
function getRandomStartIndex() {
  if (stockData.length <= 20) {
    return 0; // 資料太少只能從最前面
  }

  let index;
  let tryCount = 0;

  do {
    index = Math.floor(Math.random() * stockData.length);

    const startDate = new Date(stockData[index]?.Date);
    const endDate = new Date(stockData[index + 19]?.Date);

    const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24); // 天數差

    tryCount++;

    if (tryCount > 1) { 
      // 🔥 如果找超過50次都找不到，就放棄，從第0筆開始
      console.warn("⚠️ 資料異常太多，自動從第一天開始");
      return 19;
    }

  } while (
    index > stockData.length - 20 || // 要保證後面夠20筆
    isNaN(new Date(stockData[index]?.Date)) ||  // 保護防止亂日期
    isNaN(new Date(stockData[index + 19]?.Date)) ||
    ((new Date(stockData[index + 19]?.Date)) - (new Date(stockData[index]?.Date))) / (1000 * 60 * 60 * 24) > 35  // 🔥 超過35天
  );

  return index;
}


function addTradeRecord(date, action, amount, price, cashChange = null) {
  const list = document.getElementById('trade-list');
  if (!list) return;

  const li = document.createElement('li');

  if (action === '還是睡覺不要操作好了') {
    // ✨ 如果是睡覺，只顯示一句話
    li.textContent = `${date} ${action}`;
  } else {
    // ✨ 防止 cashChange 錯誤崩掉
    if (cashChange === null || isNaN(cashChange)) {
      cashChange = 0;
    }

    const direction = cashChange >= 0 ? '現金增加' : '現金減少';
    const roundedCash = Math.round(Math.abs(cashChange)); // ✨ 四捨五入並取絕對值
    li.textContent = `${date} ${action} ${amount} 張，成交價 ${price.toFixed(2)}　${direction} ${roundedCash.toLocaleString()}元`;
  }

  list.appendChild(li);
  list.scrollTop = list.scrollHeight; // ✨ 自動捲到最新紀錄
}



// === 畫K線圖 ===
function drawChart() {
  if (stockData.length === 0) return;

  document.getElementById('chart').innerHTML = '';

  // === 建立K線圖 ===
  chart = LightweightCharts.createChart(document.getElementById('chart'), {
    width: 600,
    height: 400,
    rightPriceScale: { visible: true },
    layout: { background: { color: '#ffffff' }, textColor: '#000' },
    grid: { vertLines: { color: '#eee' }, horzLines: { color: '#eee' } },
    timeScale: {
      rightOffset: 10,   
      barSpacing: 8,
      fixLeftEdge: true,
      lockVisibleTimeRangeOnResize: true
    },
    handleScroll: {
      pressedMouseMove: true,
      horzTouchDrag: true
    }
  });

  candleSeries = chart.addCandlestickSeries();

  let animationIndex = Math.max(0, currentIndex - 20);
  let targetIndex = currentIndex;
  
  let animatedData = []; // ✨ 所有動畫中的資料

  // 先預設20天範圍，開盤高低收都一樣，確保框架大小正常
  for (let i = animationIndex; i <= targetIndex; i++) {
    const row = stockData[i];
    if (row) {
      animatedData.push({
        time: i,
        open: +row.Open,
        high: +row.Open,
        low: +row.Open,
        close: +row.Open
      });
    }
  }
  candleSeries.setData(animatedData); // ✨ 一開始就畫20根開盤的小棒子出來

  chart.timeScale().fitContent(); // ✨ 馬上拉正時間範圍（一開始就正常）

  // 然後開始補動畫
  const interval = setInterval(() => {
    if (animationIndex > targetIndex) {
      clearInterval(interval);
      chartInitialized = true;
      return;
    }

    const row = stockData[animationIndex];
    const open = +row.Open;
    const high = +row.High;
    const low = +row.Low;
    const targetClose = +row.Close;
    let currentClose = open;

    // ✨ 開始慢慢動態更新收盤價 + 高低點
    const moveInterval = setInterval(() => {
      if (Math.abs(currentClose - targetClose) < 0.1) {
        // 最後直接到收盤價
        animatedData[animationIndex - (currentIndex - 20)] = {
          time: animationIndex,
          open: open,
          high: high,
          low: low,
          close: targetClose
        };
        candleSeries.setData(animatedData);
        console.log(`畫K線 #${animationIndex}`, {
  open: open,
  high: high,
  low: low,
  close: currentClose
});
        
        clearInterval(moveInterval);
      } else {
        // 每次微調
// 🔥 最後一天慢慢停下來的收盤價微調
let diff = targetClose - currentClose;
currentClose += diff * 0.2; // 每次只前進剩下距離的20%

        // ✨ 注意：高低價也要一起動態更新！（這樣K線不會扭曲）
        const dynamicHigh = Math.max(open, currentClose, high);
        const dynamicLow = Math.min(open, currentClose, low);

        animatedData[animationIndex - (currentIndex - 20)] = {
          time: animationIndex,
          open: open,
          high: dynamicHigh,
          low: dynamicLow,
          close: currentClose
        };
        candleSeries.setData(animatedData);
        console.log(`畫K線 #${animationIndex}`, {
  open: open,
  high: high,
  low: low,
  close: currentClose
});
      }

      chart.timeScale().scrollToRealTime(); // ✨ 一直保持最新
    }, 30);

    animationIndex++;
  }, 200); // 每0.2秒新增一天
}

function loadStockNameMap() {
  fetch('src/name.csv')  // 🔥 你說跟 main.js 同資料夾，如果在 src/ 就這樣
    .then(response => response.text())
    .then(data => {
      const lines = data.split('\n');
      lines.forEach(line => {
        const [code, name] = line.trim().split(',');
        if (code && name) {
          stockNameMap[code.trim()] = name.trim();
        }
      });
      console.log("載入公司名稱對照表完成", stockNameMap);
    })
    .catch(error => {
      console.error("載入公司名稱對照表失敗", error);
    });
}



// === 初始資金設定 ===
function showInitialCapitalDialog() {
  document.getElementById('initialCapitalDialog').style.display = 'block';
}
function setInitialCapital(amount) {
  document.getElementById('initialCapital').value = amount;
}
function confirmInitialCapital() {
  const input = document.getElementById('initialCapital').value;
  initialCapital = parseInt(input) || 1000000;
  cash = initialCapital;
  document.getElementById('initialCapitalDialog').style.display = 'none';
  updateUI();
}

// === 操作按鈕 ===
function selectAction(action) {
  selectedAction = action;
  document.querySelectorAll('.action-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.getElementById(`btn-${action}`);
  if (btn) btn.classList.add('active');
}
function changeQuantity(change) {
  quantity = Math.max(0, quantity + change);
  document.getElementById('quantity').textContent = quantity;
}
function executeTrade(type) {
  if (!selectedAction || selectedAction === 'hold') {
    showActionSelectionDialog(); // ✨ 如果沒選交易模式，就跳提示
    return;
  }

  if (quantity <= 0) {
    alert("請選擇正確的數量");
    return;
  }

  const amount = quantity;
  const action = `${selectedAction}-${type}`;
  nextDay(action, amount);
}
function showActionSelectionDialog() {
  const dialog = document.createElement('div');
  dialog.id = 'action-selection-dialog';
  dialog.style.position = 'fixed';
  dialog.style.top = '50%';
  dialog.style.left = '50%';
  dialog.style.transform = 'translate(-50%, -50%)';
  dialog.style.background = '#fff';
  dialog.style.border = '2px solid #333';
  dialog.style.padding = '20px';
  dialog.style.zIndex = '9999';
  dialog.style.textAlign = 'center';
  dialog.innerHTML = `
    <p style="margin-bottom: 15px;">請選擇你要的交易項目</p>
    <div style="display: flex; gap: 10px; justify-content: center;">
      <button onclick="selectActionAndClose('cash')">現券</button>
      <button onclick="selectActionAndClose('daytrade')">當沖</button>
      <button onclick="selectActionAndClose('margin')">融資</button>
      <button onclick="selectActionAndClose('short')">融券</button>
    </div>
  `;

  document.body.appendChild(dialog);
}
function selectActionAndClose(action) {
  selectAction(action); // ✨ 直接切換選擇
  const dialog = document.getElementById('action-selection-dialog');
  if (dialog) {
    dialog.remove(); // ✨ 關掉選單
  }
}



// === 手續費計算 ===
function calculateTransactionFee(amount, price) {
  const fee = amount * lotSize * price * transactionFeeRate;
  return fee < 20 ? 20 : fee;
}

// === 買賣邏輯 ===
function executeCashBuy(amount, price) {
  const totalCost = amount * lotSize * price;
  const fee = calculateTransactionFee(amount, price);
  if (cash < totalCost + fee) {
    alert("現金不足");
    return false;
  }
  cash -= (totalCost + fee);
  position += amount;
  longCost = position === 0 ? 0 : ((longCost * (position - amount) + price * amount) / position);
  longFee += fee;
  return true;
}

function executeCashSell(amount, price) {
  if (position < amount) {
    alert("現股不足");
    return false;
  }
  const fee = calculateTransactionFee(amount, price);
  const income = amount * lotSize * price;
const tax = income * taxRate;
cash += income;
cash -= fee;
cash -= tax;
taxFee += tax;
  position -= amount;
  longCost = position === 0 ? 0 : longCost;
  longFee += fee;
  return true;
}

function executeMarginBuy(amount, price) {
  const totalCost = amount * lotSize * price;
  const fee = calculateTransactionFee(amount, price);
  const margin = totalCost * 0.4;
  if (cash < margin + fee) {
    alert("保證金不足");
    return false;
  }
  cash -= (margin + fee);
  marginPosition += amount;
  marginCost = marginPosition === 0 ? 0 : ((marginCost * (marginPosition - amount) + price * amount) / marginPosition);
  marginFee += fee;
  return true;
}
function executeMarginSell(amount, price) {
  if (marginPosition < amount) {
    alert("融資部位不足");
    return false;
  }

  const fee = calculateTransactionFee(amount, price);
  const income = amount * lotSize * price;
  const tax = income * taxRate;

  cash += income;  // 收回全部收入
  cash -= fee;
  cash -= tax;

  marginPosition -= amount;
  marginCost = marginPosition === 0 ? 0 : marginCost;
  marginFee += fee;
  taxFee += tax;

  console.log('執行融資賣出，當前融資部位:', marginPosition, '賣出張數:', amount); // ✨加診斷

  return true;
}


function executeShortSell(amount, price) {
  const totalSellValue = amount * lotSize * price; // 賣出所得
  const fee = calculateTransactionFee(amount, price);
  const margin = totalSellValue * 0.9; // 自備保證金 (90%)

  if (cash < margin + fee) {
    alert("保證金不足");
    return false;
  }

  cash -= margin;  // ✨ 扣自備保證金
  cash -= fee;     // ✨ 扣手續費

  shortPosition += amount;
  // 計算放空的平均價格
  shortCost = shortPosition === 0 ? 0 : ((shortCost * (shortPosition - amount) + price * amount) / shortPosition);
  shortFee += fee;

  // 記錄融券賣出日
  const sellDate = new Date(virtualStartDate.getTime());
  sellDate.setDate(sellDate.getDate() + (currentIndex - 20));
  shortSellDate = sellDate;

  return true;
}




  

function executeShortSell(amount, price) {
  const totalValue = amount * lotSize * price;
  const fee = calculateTransactionFee(amount, price);
  const margin = totalValue * 0.9;
  if (cash < margin + fee) {
    alert("保證金不足");
    return false;
  }
  cash -= (margin + fee);
  shortPosition += amount;
  shortCost = shortPosition === 0 ? 0 : ((shortCost * (shortPosition - amount) + price * amount) / shortPosition);
  shortFee += fee;

  // ✨ 記錄融券賣出日
  const sellDate = new Date(virtualStartDate.getTime());
  sellDate.setDate(sellDate.getDate() + (currentIndex - 20));
  shortSellDate = sellDate;

  return true;
}
function executeShortBuy(amount, price) {
  if (shortPosition < amount) {
    alert("借券部位不足");
    return false;
  }

  const fee = calculateTransactionFee(amount, price);
  const totalBuyCost = amount * lotSize * price; // 買回股票成本

  let borrowInterest = 0;
  if (shortSellDate) {
    const buyDate = new Date(virtualStartDate.getTime());
    buyDate.setDate(buyDate.getDate() + (currentIndex - 20));

    const holdingDays = Math.floor((buyDate - shortSellDate) / (1000 * 60 * 60 * 24)) + 3; // T+2 到 D+1
    const shortSellValue = shortCost * lotSize * shortPosition; // 放空時賣出所得
    const shortBuyValue = price * lotSize * shortPosition; // 買回時股票價值
    borrowInterest = (shortSellValue + shortBuyValue) * 0.002 * holdingDays / 365;
    cash -= borrowInterest; // ✨ 扣融券利息
  }

  // ✨ 核心：拿回190%擔保品
  const totalCollateral = (shortCost * lotSize * amount) + (shortCost * lotSize * amount * 0.9);

  cash += totalCollateral; // ✨ 退回當初的擔保金（賣出所得+自備金）
  cash -= totalBuyCost;     // ✨ 支付買回股票成本
  cash -= fee;              // ✨ 扣手續費

  shortPosition -= amount;
  shortCost = shortPosition === 0 ? 0 : shortCost;
  shortFee += fee;
  shortSellDate = null;

  return true;
}




// === 更新畫面 ===
function updateUI() {
  if (stockData.length === 0) return;
  
  const current = stockData[currentIndex];
  const today = new Date(virtualStartDate.getTime());
  today.setDate(today.getDate() + (currentIndex - 20));
  const fakeDate = today.toISOString().split('T')[0];
  const price = +current.Close;
  
  // === 更新左上角股票資訊 ===
  const yesterday = stockData[currentIndex - 1] ? +stockData[currentIndex - 1].Close : price;
  const priceChange = price - yesterday;
  const priceChangePercent = (priceChange / yesterday) * 100;

  const stockNameElement = document.getElementById('stock-name');
  if (stockNameElement) {
    stockNameElement.textContent = `${stockName} ${stockCode}`;
  }

  const todayPriceElement = document.getElementById('today-price');
  if (todayPriceElement) {
    todayPriceElement.textContent = price.toFixed(2);
    todayPriceElement.style.color = priceChange >= 0 ? '#ff4d4d' : '#4dff4d';
  }

  const priceChangeElement = document.getElementById('price-change');
  if (priceChangeElement) {
    const sign = priceChange >= 0 ? '+' : '';
    priceChangeElement.textContent = `${sign}${priceChange.toFixed(2)} ${sign}${priceChangePercent.toFixed(2)}%`;
    priceChangeElement.style.color = priceChange >= 0 ? '#ff4d4d' : '#4dff4d';
  }

  const currentDateElement = document.getElementById('current-date');
  if (currentDateElement) {
    currentDateElement.textContent = `模擬時間::${fakeDate}`;
  }


  // 計算資產
  const longValue = price * position * lotSize;                         // 現股市值
  const marginValue = price * marginPosition * lotSize;                 // 融資市值 (100%市值)
  const shortPnl = (shortCost - price) * shortPosition * lotSize;       // 融券損益
  const shortValue = shortCost * shortPosition * lotSize * 0.9;         // 融券保證金(90%)
// ✅ 修正後的總預估現值計算：
  const totalValue = longValue + 
                   (marginValue - marginCost * marginPosition * lotSize * 0.6) + // 融資部分需扣除借款
                   cash + 
                   shortPnl + 
                   shortValue;
  // ✅總預估現值：現股市值 + 融資市值(-0.4) + 現金 + 融券損益 + 融券保證金
  
  const totalCost = (longCost * position * lotSize) 
                  + (marginCost * marginPosition * lotSize * 0.4) 
                  + (shortCost * shortPosition * lotSize * 0.9);
  // ✅總成本：現股成本 + 融資自己出40% + 融券保證金
  
  const totalMargin = (marginCost * marginPosition * lotSize * 0.6) 
                    + (shortCost * shortPosition * lotSize * 0.9);
  // ✅總融資金額：融資借60% + 融券保證金

  const totalInterest = -((marginPosition * lotSize * price * financingRate) 
                        + (shortPosition * lotSize * price * borrowRate) 
                        + (shortPosition * lotSize * price * shortFeeRate));
  // ✏️ 融資與融券的利息負數
  
  const totalReturn = ((totalValue - initialCapital) / initialCapital) * 100;
  // ✏️ 報酬率
  
  const totalFee = longFee + marginFee + shortFee;
  // ✏️ 累積手續費

  updateTableValues({
    price, 
    position, 
    longCost, 
    longPnl: longValue - longCost * position * lotSize,
    marginPosition, 
    marginCost, 
    marginPnl: marginValue - marginCost * marginPosition * lotSize,
    shortPosition, 
    shortCost, 
    shortPnl,
    cash, 
    totalCost, 
    totalValue, 
    totalMargin, 
    totalInterest, 
    totalFee, 
    totalReturn
  });
}

// === 更新表格 ===
function updateTableValues(values) {
  const elements = {
    'market-price': values.price,
    'market-price2': values.price,
    'market-price3': values.price,
    'position': values.position,
    'long-cost': values.longCost,
    'long-total': values.longCost * values.position * lotSize,
    'long-pnl': values.longPnl,
    'margin-position': values.marginPosition,
    'margin-cost': values.marginCost,
    'margin-total': values.marginCost * values.marginPosition * lotSize * 0.4,
    'margin-pnl': values.marginPnl,
    'short': values.shortPosition,
    'short-cost': values.shortCost,
    'short-total': values.shortCost * values.shortPosition * lotSize * 0.9,
    'short-pnl': values.shortPnl,
    'cash': values.cash,
    'total-cost': values.totalCost,
    'total-value': values.totalValue,
    'total-margin': values.totalMargin,
    'total-interest': values.totalInterest,
  'total-fee': values.totalFee,
  'total-tax': taxFee,  // ✏️ 加上這個！
  'total-return': values.totalReturn
  };

  for (const [id, value] of Object.entries(elements)) {
    const element = document.getElementById(id);
    if (element) {
      if (id === 'total-return') {
        element.textContent = value.toFixed(2) + '%';
      } else if (['cash', 'total-cost', 'total-value', 'total-margin', 'long-pnl', 'margin-pnl', 'short-pnl', 'total-interest', 'total-fee'].includes(id)) {
        element.textContent = Math.round(value).toLocaleString();
      } else {
        element.textContent = value.toFixed(1);
      }
      if (['long-pnl', 'margin-pnl', 'short-pnl', 'total-return'].includes(id)) {
        element.className = value >= 0 ? 'positive' : 'negative';
      } else if (id === 'total-value') {
        element.className = value >= initialCapital ? 'positive' : 'negative';
      }
    }
  }
}

// === 交易動作 ===
function nextDay(action = 'hold', amount = 0) {
  if (stockData.length === 0) return;

  // === 先扣每日持倉成本 ===
  if (marginPosition > 0 || shortPosition > 0) {
    const current = stockData[currentIndex];
    const price = +current.Close;
    const financingCost = marginPosition * lotSize * price * financingRate;

    let borrowCost = 0;
    if (shortSellDate) {
      const today = new Date(virtualStartDate.getTime());
      today.setDate(today.getDate() + (currentIndex - 20));
      const holdingDays = Math.floor((today - shortSellDate) / (1000 * 60 * 60 * 24)) + 3;
      const shortSellValue = shortCost * lotSize * shortPosition * 0.9;
      const shortBuyValue = price * lotSize * shortPosition * 0.9;
      borrowCost = (shortSellValue + shortBuyValue) * 0.002 * holdingDays / 365;
    }

    const shortCostFee = shortPosition * lotSize * price * shortFeeRate;
    const totalDailyCost = financingCost + borrowCost + shortCostFee;
    cash -= totalDailyCost;
  }

  // === 取今天日期（無論有沒有操作，都要有日期）
  const today = new Date(virtualStartDate.getTime());
  today.setDate(today.getDate() + (currentIndex - 20));
  const fakeDate = today.toISOString().split('T')[0];

  if (action === 'hold') {
    // ✨ 如果是睡覺，單純記錄一句話
    addTradeRecord(fakeDate, '還是睡覺不要操作好了', 0, 0);
  } else {
    // ✨ 如果是有交易行為，繼續走交易流程
    const current = stockData[currentIndex];
    const price = +current.Close;
    const success = executeTradingAction(action, amount, price);
    if (!success) return;  // 交易失敗就中斷（例如錢不夠）
  }

  currentIndex++; // ✨ 正常推進到下一天
  if (currentIndex >= stockData.length) {
    alert("已達資料結尾");
    return;
  }
  updateChartData(); // 更新K線
  updateUI();        // 更新資產狀態
}

function executeTradingAction(action, amount, price) {
  if (amount <= 0) {
    alert("請選擇正確的數量");
    return false;
  }

  const actions = {
    'cash-buy': () => executeCashBuy(amount, price),
    'cash-sell': () => {
      if (position < amount) {
        alert("現股部位不足");
        return false;
      }
      return executeCashSell(amount, price);
    },
    'margin-buy': () => executeMarginBuy(amount, price),
    'margin-sell': () => {
      if (marginPosition < amount) {
        alert("融資部位不足");
        return false;
      }
      return executeMarginSell(amount, price);
    },
    'short-sell': () => executeShortSell(amount, price),
    'short-buy': () => {
      if (shortPosition < amount) {
        alert("融券部位不足");
        return false;
      }
      return executeShortBuy(amount, price);
    }
  };

  if (actions[action]) {
    const beforeCash = cash;   // ✨ 交易前的現金
    const success = actions[action](); // ✨ 執行動作
    const afterCash = cash;    // ✨ 交易後的現金

    if (success) {
      const today = new Date(virtualStartDate.getTime());
      today.setDate(today.getDate() + (currentIndex - 20));
      const fakeDate = today.toISOString().split('T')[0];

      let actionText = '';
      if (action.includes('buy')) actionText = '買進';
      if (action.includes('sell')) actionText = '賣出';

      const cashChange = afterCash - beforeCash; // ✨ 這次現金變化

      addTradeRecord(fakeDate, actionText, amount, price, cashChange);
    }
    return success;
  }
  return false;
}



function updateChartData() {
  if (!chartInitialized) {
    drawChart();
  } else {
    const row = stockData[currentIndex];
    let currentClose = +row.Open;  // 從開盤價開始
    const targetClose = +row.Close; // 目標收盤價
    const open = +row.Open;
    const high = +row.High;
    const low = +row.Low;

    // 先加一根從開盤價開始的
    candleSeries.update({
      time: currentIndex,
      open: open,
      high: open,
      low: low,
      close: open
    });

    // ✨ 慢慢動態漲到收盤價
    const moveInterval = setInterval(() => {
      if (Math.abs(currentClose - targetClose) < 0.1) {
        // 到達收盤價，停下來
        candleSeries.update({
          time: currentIndex,
          open: open,
          high: high,
          low: low,
          close: targetClose
        });
        clearInterval(moveInterval);
      } else {
        // 慢慢往收盤價靠近
        currentClose += (targetClose > open ? 0.5 : -0.5);
        candleSeries.update({
          time: currentIndex,
          open: open,
          high: high,
          low: low,
          close: currentClose
        });
      }

      chart.timeScale().scrollToRealTime(); // ✨ 滑到最右邊
    }, 30); // 每30毫秒滑動一次收盤價
  }
}


// === 重置遊戲 ===
function restartGame() {
  if (stockData.length > 0) {
    showSummaryDialog(); // ✅ 新增：跳出總結
  }

  currentIndex = getRandomStartIndex();
  cash = initialCapital;
  position = marginPosition = shortPosition = 0;
  longCost = marginCost = shortCost = 0;
  longFee = marginFee = shortFee = 0;
  quantity = 0;
  document.getElementById('quantity').textContent = '0';
  document.getElementById('trade-list').innerHTML = '';

  if (stockData.length > 0) {
    document.getElementById('chart').innerHTML = '';
    chartInitialized = false;
  }

  resetDisplay();
  updateUI();
  drawChart();
  showInitialCapitalDialog();
}
function showSummaryDialog() {
  const firstShownIndex = Math.max(0, currentIndex - 20);
  const lastShownIndex = Math.max(0, currentIndex - 1);

  const startDate = stockData[firstShownIndex]?.Date || "未知";
  const endDate = stockData[lastShownIndex]?.Date || "未知";

  const price = +stockData[lastShownIndex]?.Close || 0;

  // 🔥 用最新收盤價算持股、融資、融券估值
  const longValue = price * position * lotSize;
  const marginValue = price * marginPosition * lotSize;
  const shortPnl = (shortCost - price) * shortPosition * lotSize;
  const shortValue = shortCost * shortPosition * lotSize * 0.9;

  const totalValue = longValue 
                   + (marginValue - marginCost * marginPosition * lotSize * 0.6)
                   + cash 
                   + shortPnl 
                   + shortValue; // ✅ 這是總估值（不是只有現金）

  const totalReturn = ((totalValue - initialCapital) / initialCapital) * 100;

  const cashColor = totalValue >= initialCapital ? 'red' : 'green';
  const returnColor = totalReturn >= 0 ? 'red' : 'green';

  const message = `
    <div style="text-align: left; font-size: 18px;">
      <b>真實時間</b>：${startDate} ~ ${endDate}<br><br>
      <b>總估值</b>：<span style="color:${cashColor}; font-weight:bold;">${Math.round(totalValue).toLocaleString()} 元</span><br><br>
      <b>總報酬率</b>：<span style="color:${returnColor}; font-weight:bold;">${totalReturn.toFixed(2)}%</span>
    </div>
  `;

  const dialog = document.createElement('div');
  dialog.innerHTML = message;
  dialog.style.position = 'fixed';
  dialog.style.top = '50%';
  dialog.style.left = '50%';
  dialog.style.transform = 'translate(-50%, -50%)';
  dialog.style.background = '#fff';
  dialog.style.padding = '30px';
  dialog.style.borderRadius = '10px';
  dialog.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';
  dialog.style.zIndex = 9999;
  
  const button = document.createElement('button');
  button.textContent = '確定';
  button.style.marginTop = '20px';
  button.style.padding = '10px 20px';
  button.style.cursor = 'pointer';
  button.onclick = () => dialog.remove();
  
  dialog.appendChild(button);
  document.body.appendChild(dialog);
}

function resetDisplay() {
  document.getElementById('current-date').textContent = '';
  document.getElementById('today-price').textContent = '';
  document.getElementById('price-change').textContent = '';
  selectedAction = 'hold';
  document.querySelectorAll('.action-btn').forEach(btn => btn.classList.remove('active'));
}

// === 初始化 ===
document.addEventListener('DOMContentLoaded', () => {
   
  loadStockNameMap();  // 🔥 一進網頁就讀取 name.csv
  showOverlayIfNeeded();  // 🔥 啟動時判斷要不要開啟透明按鈕
  document.getElementById('csvFile').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const text = event.target.result;

    if (file.name.endsWith('.csv')) {
      // 如果是CSV
      Papa.parse(text, {
  header: true,
  complete: function(results) {
    stockData = results.data.filter(row => row.Date && row.Close);
    stockData.forEach((row, index) => {
      row.Date = row.Date.split(' ')[0]; 
    fixInvalidData(row, index); // 🔥 這裡加
    });
    stockData.sort((a, b) => new Date(a.Date) - new Date(b.Date));
    currentIndex = 20;
    drawChart();
    showInitialCapitalDialog();
    selectAction('hold');
  }
});

    } else if (file.name.endsWith('.html')) {
      // 如果是HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const rows = doc.querySelectorAll('#tblDetail tr');
      stockData = [];

      rows.forEach((row, index) => {
        if (index < 2) return; // 跳過表頭
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          let date = cells[0].textContent.trim().replace(/^'/, '20'); // Goodinfo是 '25/04/12 -> 2025/04/12
          date = date.replace(/\//g, '-'); // 轉成 yyyy-mm-dd
          const open = parseFloat(cells[1].textContent.trim());
          const high = parseFloat(cells[2].textContent.trim());
          const low = parseFloat(cells[3].textContent.trim());
          const close = parseFloat(cells[4].textContent.trim());
          if (!isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close)) {
            stockData.push({ Date: date, Open: open, High: high, Low: low, Close: close });
          }
        }
      });

      stockData.reverse(); // Goodinfo是新到舊，反轉成舊到新
      currentIndex = getRandomStartIndex();
      drawChart();
      showInitialCapitalDialog();
      selectAction('hold');
    } else {
      alert('只支援CSV或HTML檔案');
    }
  };

  reader.readAsText(file);
});

  document.getElementById('quantity').textContent = '0';
});
async function downloadStock() {
  stockCode = prompt("請輸入股票代碼（4位或5位數字）：");
  if (stockCode) {
    const isValid = /^[0-9]{4,5}$/.test(stockCode);
    if (!isValid) {
      alert("股價代碼錯誤，請輸入正確的股票代碼！");
      return;
    }

    const today = new Date();
    const requests = [];

    // 🔥 清空進度條
    updateProgressBar(0);

    for (let i = 0; i < 12; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const yyyymmdd = date.getFullYear().toString() + 
                       (date.getMonth() + 1).toString().padStart(2, '0') + '01';
      const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${yyyymmdd}&stockNo=${stockCode}`;

      const request = fetch(url)
        .then(res => res.json())
        .then(data => {
          updateProgressBar((i + 1) / 12 * 100); // 🔥 更新進度條
          return data;
        });

      requests.push(request);
    }

    try {
      const results = await Promise.all(requests);

      let combinedData = [];
      results.forEach((monthData) => {
        if (monthData.stat === "OK") {
          monthData.data.forEach((row, index) => {
            const date = row[0];
            const open = parseFloat(row[3].replace(',', ''));
            const high = parseFloat(row[4].replace(',', ''));
            const low = parseFloat(row[5].replace(',', ''));
            const close = parseFloat(row[6].replace(',', ''));

            if (!isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close)) {
              const record = {
                Date: formatDate(date),
                Open: open,
                High: high,
                Low: low,
                Close: close
              };

              fixInvalidData(record, combinedData.length); // 🔥 資料檢查修正
              combinedData.push(record);
            }
          });
        }
      });

      stockData = combinedData.sort((a, b) => new Date(a.Date) - new Date(b.Date));
      currentIndex = getRandomStartIndex();

      drawChart();
      showInitialCapitalDialog();
      selectAction('hold');

      alert(`股票 ${stockName} ${stockCode} 資料載入成功！可以開始模擬交易囉！`);
      updateProgressBar(100); // 🔥 下載結束補滿進度
    } catch (error) {
      alert("⚠️ 找不到股價資料，請改用手動下載模式！");
      const proceed = confirm(
        "請先移到最下面，點選【查1年】，再按右上角【匯出HTML】。\n\n匯出後即可回來開啟檔案。\n\n要前往股價網站嗎？"
      );
      if (proceed) {
        const fallbackUrl = `https://goodinfo.tw/tw/ShowK_Chart.asp?STOCK_ID=${stockCode}&CHT_CAT=DATE`;
        window.open(fallbackUrl, '_blank');
      }
    }
  }
}



function formatDate(twDateStr) {
  const [y, m, d] = twDateStr.split('/');
  return `${parseInt(y, 10) + 1911}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
// 🔥 修正異常的價格
function fixInvalidData(row, index) {
  const fields = ['Open', 'High', 'Low', 'Close'];
  fields.forEach(field => {
    let value = parseFloat(row[field]);
    if (isNaN(value) || value < 0 || value > 100000) {
      const fallback = getFallbackPrice(index);
      const randomFactor = 1 + (Math.random() * 0.02 - 0.01);  // ±1% 隨機
      row[field] = (fallback * randomFactor).toFixed(2);
    }
  });
}

function getFallbackPrice(index) {
  if (index > 0) {
    const prevClose = parseFloat(stockData[index - 1]?.Close);
    if (!isNaN(prevClose) && prevClose > 0) {
      return prevClose;
    }
  }
  return 100; // 沒有前一天就用100
}



function exportCurrentKLine() {
  if (stockData.length === 0) {
    alert("目前沒有任何股價資料！");
    return;
  }

  const firstIndex = Math.max(0, currentIndex - 20);
  const lastIndex = Math.min(stockData.length - 1, currentIndex);

  const dataToExport = stockData.slice(firstIndex, lastIndex + 1);

  // 轉成CSV格式
  let csvContent = "Date,Open,High,Low,Close\n";
  dataToExport.forEach(row => {
    csvContent += `${row.Date},${row.Open},${row.High},${row.Low},${row.Close}\n`;
  });

  // 建立Blob並下載
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "current_kline_data.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
// === 資料異常修正工具 ===

// 🔥 主函數：檢查並修正每一筆資料
function fixInvalidData(row, index) {
  const fields = ['Open', 'High', 'Low', 'Close'];

  fields.forEach(field => {
    let value = parseFloat(row[field]);

    // 如果不是數字或大於10萬，使用安全的替代價格
    if (isNaN(value) || value > 100000) {
      const fallback = getFallbackPrice(index);
      const randomFactor = 1 + (Math.random() * 0.02 - 0.01);  // ±1%
      row[field] = (fallback * randomFactor).toFixed(2);
    }
    // 如果是負數，用當天開盤價來取代
    else if (value < 0) {
      const openValue = parseFloat(row['Open']);
      if (!isNaN(openValue)) {
        row[field] = openValue.toFixed(2);
      } else {
        // 如果開盤價也壞掉，還是用安全價格
        const fallback = getFallbackPrice(index);
        row[field] = fallback.toFixed(2);
      }
    }
    // 正常情況：四捨五入保留2位小數
    else {
      row[field] = value.toFixed(2);
    }
  });
}

// 🔥 取得替代價格（通常是前一天的收盤價）
function getFallbackPrice(index) {
  if (index > 0 && stockData[index - 1]) {
    const prevClose = parseFloat(stockData[index - 1].Close);
    if (!isNaN(prevClose) && prevClose > 0) {
      return prevClose;
    }
  }
  // 如果沒有前一天，就用安全的100
  return 100;
}
function updateProgressBar(percent) {
  const bar = document.getElementById('progress-bar');
  if (bar) {
    bar.style.width = `${percent}%`;
  }
}
