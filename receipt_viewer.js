// [作業版 Rev.1] Manifest V3 CSP準拠の完全外付けアナリティクススクリプト＆ゼロ除算セーフガード

// === 状態管理 ===
let allReceiptLogs = [];
let currentFilteredLogs = [];
let currentPeriodFilter = "all";
let sortKey = "timestamp";
let sortAsc = false;

// === 初期化とデータ読み込み ===
async function initDashboard() {
  setupEventHandlers();
  await loadLogsFromExtensionOrCache();
  setupRealtimeStorageListener();
}

async function loadLogsFromExtensionOrCache() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["tokenTransactionLogs"], (res) => {
      allReceiptLogs = res.tokenTransactionLogs || [];
      const count = allReceiptLogs.length;
      document.getElementById("headerDataSource").innerText = `🟢 拡張機能ストレージとリアルタイム自動連動中 (全 ${count.toLocaleString()} 件)`;
      populateProgramFilterDropdown();
      applyFiltersAndRender();
    });
  } else {
    document.getElementById("headerDataSource").innerText = "データソース: CSVファイルを読み込んでください";
    applyFiltersAndRender();
  }
}

// 📡 リアルタイム変更監視リスナー（マネージャーでトークンが動いたら自動で即座に再描画）
function setupRealtimeStorageListener() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.tokenTransactionLogs) {
        allReceiptLogs = changes.tokenTransactionLogs.newValue || [];
        const count = allReceiptLogs.length;
        document.getElementById("headerDataSource").innerText = `🟢 拡張機能ストレージとリアルタイム自動連動中 (全 ${count.toLocaleString()} 件)`;
        populateProgramFilterDropdown();
        applyFiltersAndRender();
      }
    });
  }
}

function setupEventHandlers() {
  // 期間ピル切り替え
  document.querySelectorAll(".period-pill").forEach(btn => {
    btn.onclick = (e) => {
      document.querySelectorAll(".period-pill").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      currentPeriodFilter = e.target.dataset.period;
      applyFiltersAndRender();
    };
  });

  // ドロップダウンフィルター
  const progSelect = document.getElementById("filterProgSelect");
  if (progSelect) progSelect.onchange = applyFiltersAndRender;

  const accSelect = document.getElementById("filterAccountSelect");
  if (accSelect) accSelect.onchange = applyFiltersAndRender;

  // 検索バー
  const searchInput = document.getElementById("tableSearchInput");
  if (searchInput) searchInput.oninput = applyFiltersAndRender;

  // CSVファイル選択
  const fileInput = document.getElementById("csvFileInput");
  const selectBtn = document.getElementById("selectCsvBtn");
  if (selectBtn && fileInput) {
    selectBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) readCsvFile(file);
    };
  }

  // 再読込ボタン
  const refreshBtn = document.getElementById("refreshDataBtn");
  if (refreshBtn) refreshBtn.onclick = loadLogsFromExtensionOrCache;

  // CSVエクスポート
  const downloadBtn = document.getElementById("downloadCurrentCsvBtn");
  if (downloadBtn) downloadBtn.onclick = exportFilteredCsv;

  // ドラッグ＆ドロップ受け付け
  const overlay = document.getElementById("dropOverlay");
  if (overlay) {
    window.ondragover = (e) => { e.preventDefault(); overlay.classList.add("dragover"); };
    overlay.ondragleave = () => overlay.classList.remove("dragover");
    overlay.ondrop = (e) => {
      e.preventDefault();
      overlay.classList.remove("dragover");
      const file = e.dataTransfer.files?.[0];
      if (file) readCsvFile(file);
    };
  }

  // テーブルソート
  document.querySelectorAll(".receipt-full-table th").forEach(th => {
    th.onclick = () => {
      const key = th.dataset.sort;
      if (!key) return;
      if (sortKey === key) {
        sortAsc = !sortAsc;
      } else {
        sortKey = key;
        sortAsc = false;
      }
      renderTableOnly();
    };
  });
}

function populateProgramFilterDropdown() {
  const select = document.getElementById("filterProgSelect");
  if (!select) return;
  const currentVal = select.value;
  const progSet = new Set();
  allReceiptLogs.forEach(l => {
    if (l.programName) progSet.add(l.programName);
  });

  let options = `<option value="ALL">すべて表示</option>`;
  Array.from(progSet).sort().forEach(name => {
    options += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
  });
  select.innerHTML = options;
  select.value = currentVal || "ALL";
}

// === CSVファイル読み込み・解析 ===
function readCsvFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const parsedLogs = parseCsvToReceiptObjects(text);
    if (parsedLogs.length > 0) {
      allReceiptLogs = parsedLogs;
      document.getElementById("headerDataSource").innerText = `データソース: CSV (${file.name} / ${parsedLogs.length} 件)`;
      populateProgramFilterDropdown();
      applyFiltersAndRender();
    } else {
      alert("有効なレシートCSVデータを検出できませんでした。");
    }
  };
  reader.readAsText(file, "UTF-8");
}

function parseCsvToReceiptObjects(csvText) {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];

  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    if (cols.length >= 6) {
      const delta = parseInt(cols[5].replace(/[,\+]/g, ''), 10) || 0;
      const totalChat = parseInt(cols[6]?.replace(/,/g, ''), 10) || 0;
      const accMatch = (cols[2] || "").match(/ID\s*(\d+)/i);
      const accountId = accMatch ? parseInt(accMatch[1], 10) : 0;

      let type = "usage";
      const rawType = cols[7] || "";
      if (rawType.includes("遮断")) type = "fuse_blocked";
      else if (rawType.includes("補正")) type = "manual_correction";
      else if (rawType.includes("リセット")) type = "system_reset";

      result.push({
        id: cols[0] || `tx_csv_${i}`,
        dateStr: cols[1]?.split(" ")[0] || "",
        timeStr: cols[1]?.split(" ")[1] || "",
        timestamp: new Date(cols[1] || Date.now()).getTime() || (Date.now() - i * 1000),
        accountId: accountId,
        programId: cols[3] || "",
        programName: cols[4] || "未分類タスク",
        delta: delta,
        totalChatTokens: totalChat,
        type: type,
        isLargeDelta: delta >= 30000,
        chatTitle: cols[8] || "",
        url: cols[9] || "",
        note: cols[10] || ""
      });
    }
  }
  return result;
}

function parseCsvLine(text) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

// === フィルタリングと集計 ===
function applyFiltersAndRender() {
  const progSelect = document.getElementById("filterProgSelect");
  const accSelect = document.getElementById("filterAccountSelect");
  const searchInput = document.getElementById("tableSearchInput");

  const progVal = progSelect ? progSelect.value : "ALL";
  const accVal = accSelect ? accSelect.value : "ALL";
  const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : "";

  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  currentFilteredLogs = allReceiptLogs.filter(log => {
    // 期間フィルター
    if (currentPeriodFilter === "today") {
      const todayStr = getJstDateString(now);
      if (log.dateStr && !todayStr.endsWith(log.dateStr.replace(/^0/, ''))) {
        if (now - (log.timestamp || 0) > oneDay) return false;
      }
    } else if (currentPeriodFilter === "week") {
      if (now - (log.timestamp || 0) > 7 * oneDay) return false;
    } else if (currentPeriodFilter === "month") {
      if (now - (log.timestamp || 0) > 30 * oneDay) return false;
    }

    // プログラムフィルター
    if (progVal !== "ALL" && log.programName !== progVal) return false;

    // アカウントフィルター
    if (accVal !== "ALL" && String(log.accountId) !== accVal) return false;

    // 検索フィルター
    if (searchVal) {
      const fullText = `${log.chatTitle || ''} ${log.programName || ''} ${log.url || ''} ${log.note || ''}`.toLowerCase();
      if (!fullText.includes(searchVal)) return false;
    }

    return true;
  });

  const countLabel = document.getElementById("filteredCountLabel");
  if (countLabel) {
    countLabel.innerText = `対象レコード: ${currentFilteredLogs.length.toLocaleString()} 件 / 全 ${allReceiptLogs.length.toLocaleString()} 件`;
  }
  const tableCount = document.getElementById("tableRecordCount");
  if (tableCount) {
    tableCount.innerText = currentFilteredLogs.length.toLocaleString();
  }

  renderKpis();
  renderProgBars();
  renderTrendChart();
  renderIdBalance();
  renderHeatmap();
  renderTopTasks();
  renderTableOnly();
}

// === 1. KPIサマリー描画 ===
function renderKpis() {
  let totalTokens = 0;
  let sessionCount = 0;
  let warningCount = 0;
  let bloatCount = 0;

  const accountTokens = { 1: 0, 2: 0, 3: 0, 4: 0 };

  currentFilteredLogs.forEach(l => {
    if (l.delta > 0) totalTokens += l.delta;
    if (l.type === "usage" || l.type === "manual_correction") sessionCount++;
    if (l.isLargeDelta || l.type === "fuse_blocked") warningCount++;
    if (l.totalChatTokens >= 300000) bloatCount++;

    if (l.accountId >= 1 && l.accountId <= 4) {
      accountTokens[l.accountId] += Math.max(0, l.delta);
    }
  });

  const kpiTotal = document.getElementById("kpiTotalTokens");
  if (kpiTotal) kpiTotal.innerText = `${totalTokens.toLocaleString()} tk`;

  const estHours = (totalTokens / 250000).toFixed(1);
  const kpiEst = document.getElementById("kpiEstimatedHours");
  if (kpiEst) kpiEst.innerText = `推定開発工数: 約 ${estHours} 時間`;

  const kpiSession = document.getElementById("kpiSessionCount");
  if (kpiSession) kpiSession.innerText = `${sessionCount.toLocaleString()} 回`;

  const avgTokens = sessionCount > 0 ? Math.round(totalTokens / sessionCount) : 0;
  const kpiAvg = document.getElementById("kpiAvgTokensPerSession");
  if (kpiAvg) kpiAvg.innerText = `1回平均: ${avgTokens.toLocaleString()} tk / セッション`;

  const kpiWarn = document.getElementById("kpiWarningCount");
  if (kpiWarn) kpiWarn.innerText = `${warningCount.toLocaleString()} 件`;

  const kpiWarnDetail = document.getElementById("kpiWarningDetail");
  if (kpiWarnDetail) kpiWarnDetail.innerText = `急増注意: ${warningCount}回 / 300k超: ${bloatCount}回`;

  // アカウント均等度指数の計算（標準偏差から100点満点スコア化）
  const vals = Object.values(accountTokens);
  const sum = vals.reduce((a, b) => a + b, 0);
  let balanceScore = 100;
  if (sum > 0) {
    const mean = sum / 4;
    const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 4;
    const stdDev = Math.sqrt(variance);
    balanceScore = Math.max(10, Math.round(100 - (stdDev / mean) * 60));
  }

  const kpiScore = document.getElementById("kpiBalanceScore");
  if (kpiScore) kpiScore.innerText = `${balanceScore} %`;

  let diagnosis = "4アカウントが極めて均等に稼働";
  if (balanceScore < 60) diagnosis = "特定アカウントへの偏りが発生中";
  else if (balanceScore < 80) diagnosis = "やや偏りあり（ローテーション推奨）";

  const kpiDiag = document.getElementById("kpiBalanceDiagnosis");
  if (kpiDiag) kpiDiag.innerText = diagnosis;
}

// === 2. プログラム別投資比率描画 ===
function renderProgBars() {
  const container = document.getElementById("progBarsList");
  if (!container) return;
  container.innerHTML = "";

  const progTotals = {};
  currentFilteredLogs.forEach(l => {
    const name = l.programName || "未分類タスク";
    if (!progTotals[name]) progTotals[name] = 0;
    if (l.delta > 0) progTotals[name] += l.delta;
  });

  const sorted = Object.entries(progTotals).sort((a, b) => b[1] - a[1]);
  const maxVal = sorted.length > 0 ? Math.max(sorted[0][1], 1) : 1;
  const colors = ["#38bdf8", "#10b981", "#facc15", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"];

  if (sorted.length === 0) {
    container.innerHTML = `<div style="font-size: 11px; color: #64748b; padding: 20px; text-align: center;">データがありません</div>`;
    return;
  }

  sorted.forEach(([name, tokens], idx) => {
    const percent = Math.min(100, Math.round((tokens / maxVal) * 100));
    const color = colors[idx % colors.length];
    const row = document.createElement("div");
    row.className = "prog-bar-row";
    row.innerHTML = `
      <div class="prog-bar-top">
        <span class="prog-bar-name" title="${escapeHtml(name)}">${idx + 1}. ${escapeHtml(name)}</span>
        <span class="prog-bar-stat">${tokens.toLocaleString()} tk</span>
      </div>
      <div class="prog-bar-bg">
        <div class="prog-bar-fill" style="width: ${percent}%; background: ${color};"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

// === 3. 時系列トレンド折れ線グラフ描画 (SVG完全自己完結) ===
function renderTrendChart() {
  const dayTotals = {};
  currentFilteredLogs.forEach(l => {
    const dStr = l.dateStr || "不明";
    if (!dayTotals[dStr]) dayTotals[dStr] = 0;
    if (l.delta > 0) dayTotals[dStr] += l.delta;
  });

  const sortedDays = Object.keys(dayTotals).sort((a, b) => new Date(a) - new Date(b));
  const gridG = document.getElementById("svgGridLines");
  const areaPath = document.getElementById("svgAreaPath");
  const linePath = document.getElementById("svgLinePath");
  const pointsG = document.getElementById("svgPoints");
  const labelsG = document.getElementById("svgLabels");

  if (!gridG || !areaPath || !linePath || !pointsG || !labelsG) return;

  gridG.innerHTML = "";
  pointsG.innerHTML = "";
  labelsG.innerHTML = "";

  if (sortedDays.length === 0) {
    areaPath.setAttribute("d", "");
    linePath.setAttribute("d", "");
    return;
  }

  const values = sortedDays.map(d => dayTotals[d]);
  const maxVal = Math.max(...values, 1000);

  const width = 700;
  const height = 240;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Y軸グリッド線 (4分割)
  for (let i = 0; i <= 4; i++) {
    const y = padTop + (chartH / 4) * i;
    const val = Math.round(maxVal - (maxVal / 4) * i);
    gridG.innerHTML += `
      <line class="chart-grid-line" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"/>
      <text class="chart-axis-text" x="${padLeft - 8}" y="${y + 3}" text-anchor="end">${(val / 1000).toFixed(0)}k</text>
    `;
  }

  const points = sortedDays.map((d, i) => {
    const x = sortedDays.length === 1 ? padLeft + chartW / 2 : padLeft + (chartW / (sortedDays.length - 1)) * i;
    const y = padTop + chartH - (dayTotals[d] / maxVal) * chartH;
    return { x, y, day: d, val: dayTotals[d] };
  });

  // 折れ線・塗りつぶしパス
  let lineD = `M ${points[0].x} ${points[0].y}`;
  points.slice(1).forEach(p => { lineD += ` L ${p.x} ${p.y}`; });
  linePath.setAttribute("d", lineD);

  const areaD = `${lineD} L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${padTop + chartH} Z`;
  areaPath.setAttribute("d", areaD);

  // ポイント＆X軸ラベル
  points.forEach((p, idx) => {
    pointsG.innerHTML += `<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="3.5"><title>${p.day}: ${p.val.toLocaleString()} tk</title></circle>`;

    const step = Math.max(1, Math.floor(points.length / 8));
    if (idx % step === 0 || idx === points.length - 1) {
      labelsG.innerHTML += `
        <text class="chart-axis-text" x="${p.x}" y="${padTop + chartH + 16}" text-anchor="middle">${p.day}</text>
      `;
    }
  });
}

// === 4. アカウントバランス描画 ===
function renderIdBalance() {
  const container = document.getElementById("idBalanceList");
  if (!container) return;
  container.innerHTML = "";

  const accTokens = { 1: 0, 2: 0, 3: 0, 4: 0 };
  currentFilteredLogs.forEach(l => {
    if (l.accountId >= 1 && l.accountId <= 4 && l.delta > 0) {
      accTokens[l.accountId] += l.delta;
    }
  });

  const total = Object.values(accTokens).reduce((a, b) => a + b, 0) || 1;
  const colors = { 1: "#38bdf8", 2: "#10b981", 3: "#facc15", 4: "#a855f7" };

  for (let id = 1; id <= 4; id++) {
    const tk = accTokens[id];
    const pct = Math.round((tk / total) * 100);
    const row = document.createElement("div");
    row.className = "id-balance-row";
    row.innerHTML = `
      <div class="id-balance-top">
        <span style="color: ${colors[id]};">ID ${id}</span>
        <span style="color: #94a3b8;">${tk.toLocaleString()} tk (${pct}%)</span>
      </div>
      <div class="id-balance-bg">
        <div class="id-balance-fill" style="width: ${pct}%; background: ${colors[id]};"></div>
      </div>
    `;
    container.appendChild(row);
  }
}

// === 5. 集中開発ヒートマップ描画 (24時間×7曜日) ===
function renderHeatmap() {
  const grid = document.getElementById("heatmapGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const daysOfWeek = ["日", "月", "火", "水", "木", "金", "土"];
  const matrix = Array(7).fill(0).map(() => Array(24).fill(0));

  currentFilteredLogs.forEach(l => {
    if (l.timestamp && l.delta > 0) {
      const d = new Date(l.timestamp);
      const day = d.getDay();
      const hour = d.getHours();
      matrix[day][hour] += l.delta;
    }
  });

  let maxHourVal = 1;
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      if (matrix[day][hour] > maxHourVal) maxHourVal = matrix[day][hour];
    }
  }

  // ヘッダー行 (時間ラベル 0〜23)
  grid.innerHTML += `<div></div>`;
  for (let h = 0; h < 24; h++) {
    grid.innerHTML += `<div style="text-align: center; font-size: 8px;">${h}</div>`;
  }

  // 各曜日行
  for (let d = 0; d < 7; d++) {
    grid.innerHTML += `<div style="font-weight: bold; text-align: center;">${daysOfWeek[d]}</div>`;
    for (let h = 0; h < 24; h++) {
      const val = matrix[d][h];
      let lvlClass = "";
      if (val > 0) {
        const ratio = val / maxHourVal;
        if (ratio > 0.75) lvlClass = "l4";
        else if (ratio > 0.45) lvlClass = "l3";
        else if (ratio > 0.2) lvlClass = "l2";
        else lvlClass = "l1";
      }
      grid.innerHTML += `<div class="heatmap-cell ${lvlClass}" title="${daysOfWeek[d]}曜 ${h}時: ${val.toLocaleString()} tk"></div>`;
    }
  }
}

// === 6. 大量消費タスクTOP 10 ===
function renderTopTasks() {
  const container = document.getElementById("topTasksList");
  if (!container) return;
  container.innerHTML = "";

  const sortedTasks = [...currentFilteredLogs]
    .filter(l => l.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 10);

  if (sortedTasks.length === 0) {
    container.innerHTML = `<div style="font-size: 11px; color: #64748b; padding: 15px; text-align: center;">データなし</div>`;
    return;
  }

  sortedTasks.forEach((t, i) => {
    const item = document.createElement("div");
    item.className = "top-task-item";
    item.innerHTML = `
      <span style="font-weight: 800; color: #38bdf8; width: 22px;">#${i + 1}</span>
      <span class="top-task-title" title="${escapeHtml(t.chatTitle || t.programName)}">${escapeHtml(t.chatTitle || t.programName)}</span>
      <span class="top-task-delta">+${t.delta.toLocaleString()} tk</span>
    `;
    container.appendChild(item);
  });
}

// === 7. 全件テーブル描画 ===
function renderTableOnly() {
  const tbody = document.getElementById("receiptTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const sorted = [...currentFilteredLogs].sort((a, b) => {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (sortKey === "timestamp") {
      va = a.timestamp || 0;
      vb = b.timestamp || 0;
    }
    if (typeof va === "string") {
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sortAsc ? va - vb : vb - va;
  });

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 24px;">該当するレシート記録がありません</td></tr>`;
    return;
  }

  sorted.forEach(l => {
    const tr = document.createElement("tr");

    let badgeClass = "usage";
    let badgeText = "通常消費";
    if (l.type === "fuse_blocked") { badgeClass = "fuse"; badgeText = "⛔ 異常遮断"; }
    else if (l.type === "manual_correction") { badgeClass = "correct"; badgeText = "✏️ 手動補正"; }
    else if (l.type === "system_reset") { badgeClass = "reset"; badgeText = "⚙️ 17時リセット"; }
    else if (l.isLargeDelta) { badgeClass = "warning"; badgeText = "⚠️ 急増注意"; }

    const deltaColor = l.delta > 0 ? (l.isLargeDelta ? "#facc15" : "#38bdf8") : (l.delta < 0 ? "#ef4444" : "#94a3b8");
    const deltaSign = l.delta > 0 ? `+${l.delta.toLocaleString()}` : (l.delta < 0 ? l.delta.toLocaleString() : "0");
    const totalChatStr = l.totalChatTokens ? `${l.totalChatTokens.toLocaleString()} tk` : "-";

    const linkHtml = l.url ? `<a href="${escapeHtml(l.url)}" target="_blank" style="color: #38bdf8; text-decoration: none;">🔗 開く</a>` : "-";

    tr.innerHTML = `
      <td style="color: #94a3b8; font-family: monospace;">${escapeHtml(l.dateStr || '')} ${escapeHtml(l.timeStr || '')}</td>
      <td><strong style="color: #cbd5e1;">${l.accountId ? `ID ${l.accountId}` : 'システム'}</strong></td>
      <td style="color: #f8fafc; font-weight: 600;">${escapeHtml(l.programName || '未分類')}</td>
      <td style="text-align: right; font-weight: 800; color: ${deltaColor}; font-variant-numeric: tabular-nums;">${deltaSign} tk</td>
      <td style="text-align: right; color: ${l.totalChatTokens >= 300000 ? '#f59e0b; font-weight: bold;' : '#94a3b8;'}; font-variant-numeric: tabular-nums;">${totalChatStr}</td>
      <td><span class="badge-tag ${badgeClass}">${badgeText}</span></td>
      <td style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(l.note || l.chatTitle)}">
        ${escapeHtml(l.note || l.chatTitle || 'チャット作業')}
      </td>
      <td>${linkHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// === CSVエクスポート ===
function exportFilteredCsv() {
  if (currentFilteredLogs.length === 0) {
    alert("エクスポート対象のデータがありません。");
    return;
  }

  const headers = ["ID", "記録日時", "アカウント", "プログラムID", "プログラム名", "トークン増分(tk)", "チャット累計トークン(tk)", "イベント種別", "チャットタイトル/タスク名", "URL", "備考/遮断・補正理由"];
  const rows = currentFilteredLogs.map(l => [
    `"${l.id || ''}"`,
    `"${l.dateStr || ''} ${l.timeStr || ''}"`,
    `"${l.accountId ? `ID ${l.accountId}` : 'システム'}"`,
    `"${l.programId || ''}"`,
    `"${(l.programName || '').replace(/"/g, '""')}"`,
    `"${l.delta || 0}"`,
    `"${l.totalChatTokens || 0}"`,
    `"${l.type || ''}"`,
    `"${(l.chatTitle || '').replace(/"/g, '""')}"`,
    `"${l.url || ''}"`,
    `"${(l.note || '').replace(/"/g, '""')}"`
  ].join(","));

  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `token_receipt_analysis_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ユーティリティ
function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function getJstDateString(epochMs) {
  const d = new Date(epochMs + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 起動
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}