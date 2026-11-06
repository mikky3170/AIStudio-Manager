function createInitialAccounts() {
  const accounts = {};
  for (let i = 1; i <= 4; i++) {
    accounts[i] = {
      accountId: i,
      googleId: `アカウント ${i}`,
      currentProgramId: "",
      theme: "",
      tokens: 0,
      currentChatTokens: 0,
      meterLevel: 0,
      statusMode: "normal", // "normal" | "warning" | "limited"
      isManual: false,
      isRateLimited: false,
      hasError: false,
      startTime: null,
      tabId: null,
      notes: ""
    };
  }
  return accounts;
}

const defaultPrograms = [
  { 
    id: "prog_1", 
    name: "01_Studioマネージャー(AI Studio連携)", 
    files: "manifest.json, background.js, display.html, action.js, content.js", 
    tokensWeek: 1250000, 
    tokensMonth: 3400000, 
    hoursWeek: 5.5, 
    lastCommit: "v1.1: 初期開発完了", 
    lastId: "ID 1",
    saveHistory: []
  }
];

let accountsData = createInitialAccounts();
let programsData = defaultPrograms;
let knowledgeLogsData = [];
let apiConfig = {
  githubToken: "",
  githubRepo: "",
  geminiApiKey: "",
  geminiModelName: "gemini-3.5-flash-lite"
};

let selectedKnowledgeFilter = "ALL";
let currentPeriod = "week";
let isDataLoaded = false;
let currentTargetProg = null;
let loadedLocalFiles = [];

// 17:00カウントダウン
function updateCountdown() {
  const timerEl = document.getElementById("resetCountdown");
  if (!timerEl) return;
  const now = new Date();
  const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const resetTarget = new Date(jstNow);
  resetTarget.setHours(17, 0, 0, 0);

  if (jstNow.getTime() >= resetTarget.getTime()) {
    resetTarget.setDate(resetTarget.getDate() + 1);
  }

  const diffMs = resetTarget.getTime() - jstNow.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  timerEl.innerText = `次回 17:00 リセットまで: あと ${hours}時間 ${minutes}分 ${seconds}秒`;
}

function updateActiveModelBadge() {
  const badge = document.getElementById("activeModelBadge");
  if (badge) {
    badge.innerText = `🤖 Model: ${apiConfig.geminiModelName || 'gemini-3.5-flash-lite'}`;
  }
}

function formatElapsedTime(startTime) {
  if (!startTime) return "未開始";
  const diffSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function calculateDailyMeter(dailyTokens) {
  if (!dailyTokens || dailyTokens <= 0) return 0;
  if (dailyTokens <= 300000) return 20;
  if (dailyTokens <= 600000) return 40;
  if (dailyTokens <= 900000) return 60;
  return 80;
}

// 履歴データのクリーンアップ ＆ 01_Studioマネージャーの初回セーブ詳細復元
function cleanupAndMigrateSaveHistory() {
  let hasChanges = false;
  programsData.forEach(p => {
    if (p.id === "prog_1") {
      if (!p.saveHistory || p.saveHistory.length === 0) {
        p.saveHistory = [{
          timestamp: Date.now() - 7200000,
          dateStr: "2024/11/6 10:30",
          commitMsg: p.lastCommit || "v1.1: 初期開発完了",
          summary: "■ 初回リポジトリ作成・ベースコードの登録\n・Google AI Studio連携マネージャーの初期実装一式（manifest.json, background.js, display.html, action.js, content.js）\n・IDモニター（残量監視・メーター）、プログラム分析、マスタ設定の基盤構築"
        }];
        hasChanges = true;
      }
    } else {
      if (p.saveHistory && p.saveHistory.length > 0) {
        p.saveHistory = [];
        hasChanges = true;
      }
    }
  });
  if (hasChanges) saveAllData();
}

// === タブ1: IDモニター ===
function setupCards() {
  const container = document.getElementById("cardsGrid");
  container.innerHTML = "";
  const steps = [20, 40, 60, 80, 100];

  for (let id = 1; id <= 4; id++) {
    const card = document.createElement("div");
    card.className = "card";
    card.id = `card-${id}`;

    // 20〜80%は自動表示用タイトル、100%のみ手動切替タイトル
    let meterHtml = steps.map(step => {
      const isManualBtn = (step === 100);
      const titleText = isManualBtn 
        ? '【手動専用】クリックでリミット到達(100%)を手動切替' 
        : `【自動表示】本日の累計消費により自動点灯（手動選択不可）`;
      return `<div class="segment ${isManualBtn ? 'manual-seg' : ''}" data-step="${step}" title="${titleText}">${step}%</div>`;
    }).join("");
    
    let progOptions = `<option value="">── 対象プログラムを選択 (未分類) ──</option>`;
    programsData.forEach(p => {
      progOptions += `<option value="${p.id}">${p.name}</option>`;
    });

    card.innerHTML = `
      <div class="card-top">
        <span class="id-badge">ID ${id}</span>
        <button class="status-toggle-btn mode-normal" id="badge-${id}" data-account="${id}" title="クリックで 未達 ➜ 警戒 ➜ 到達 を手動切替">⚠️ リミット未達</button>
        <input type="text" class="google-id-input" data-account="${id}" placeholder="Google ID (例: work@gmail.com)">
        <button class="jump-btn" data-account="${id}">このタブを開く</button>
      </div>

      <div class="card-body-area">
        <div class="two-rows-box">
          <div class="row-1">
            <div class="prog-wrapper">
              <select class="prog-select unselected" data-account="${id}">
                ${progOptions}
              </select>
            </div>
            <div class="status-badge">
              <span id="time-${id}">⏱ 未開始</span>
              <span style="color: #475569;">|</span>
              <span id="token-${id}">📊 累計: 0 tk</span>
            </div>
          </div>

          <div class="row-2">
            <span class="meter-label-mini">メーター (20-80%自動 / 100%手動)</span>
            <div class="meter-segments" data-account="${id}" id="meter-${id}">
              ${meterHtml}
            </div>
          </div>

          <div class="chat-tokens-info" id="chatInfo-${id}">
            <span>💬 現在のチャット長: <strong id="chatTokens-${id}">0</strong> tk</span>
            <span id="bloatBadge-${id}" style="display: none;" class="bloat-badge">⚠️ 肥大化中・要約推奨</span>
          </div>
        </div>

        <div>
          <div class="field-label">📌 本日の作業テーマ (連携プログラム等)</div>
          <input type="text" class="theme-input" data-account="${id}" placeholder="例: 〇〇機能の実装 (＋プログラムB連携)">
        </div>

        <div>
          <div class="field-label">📝 備考・メモ</div>
          <textarea class="notes-area" data-account="${id}" placeholder="メモ、プロンプトの調整内容など..."></textarea>
        </div>
      </div>
    `;

    container.appendChild(card);
  }

  attachCardEvents();
  updateCardValues();
}

function attachCardEvents() {
  document.querySelectorAll(".status-toggle-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.account;
      cycleAccountStatus(id);
    });
  });

  // 100%のみ手動クリックを受け付ける（20〜80%はクリック無効）
  document.querySelectorAll(".meter-segments").forEach(meter => {
    meter.addEventListener("click", (e) => {
      const seg = e.target.closest(".segment");
      if (!seg) return;
      const id = meter.dataset.account;
      const step = parseInt(seg.dataset.step, 10);

      if (step === 100) {
        const current = accountsData[id];
        // 100% <-> 通常（自動計算値）をユーザーの意思でいつでも手動切替可能
        if (current.statusMode === "limited") {
          current.statusMode = "normal";
          current.isRateLimited = false;
          current.hasError = false;
          current.meterLevel = calculateDailyMeter(current.tokens);
        } else {
          current.statusMode = "limited";
          current.isRateLimited = true;
          current.hasError = false;
          current.meterLevel = 100;
        }
        saveAllData();
        updateCardValues();
      }
    });
  });

  document.querySelectorAll(".prog-select").forEach(sel => {
    sel.addEventListener("change", (e) => {
      const id = e.target.dataset.account;
      const val = e.target.value;
      accountsData[id].currentProgramId = val;
      e.target.className = val === "" ? "prog-select unselected" : "prog-select selected";
      saveAllData();
      renderKnowledgeFilterTabs();
    });
  });

  document.querySelectorAll(".google-id-input").forEach(el => el.addEventListener("input", e => { accountsData[e.target.dataset.account].googleId = e.target.value; saveAllData(); }));
  document.querySelectorAll(".theme-input").forEach(el => el.addEventListener("input", e => { accountsData[e.target.dataset.account].theme = e.target.value; saveAllData(); }));
  document.querySelectorAll(".notes-area").forEach(el => el.addEventListener("input", e => { accountsData[e.target.dataset.account].notes = e.target.value; saveAllData(); }));

  document.querySelectorAll(".jump-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.target.dataset.account, 10);
      const data = accountsData[id];
      if (data && data.tabId) {
        chrome.tabs.update(data.tabId, { active: true }, tab => {
          if (chrome.runtime.lastError || !tab) chrome.tabs.create({ url: `https://aistudio.google.com/u/${id - 1}/` });
        });
      } else {
        chrome.tabs.create({ url: `https://aistudio.google.com/u/${id - 1}/` });
      }
    });
  });
}

// ユーザー主権の手動トグル: いつでも元に戻せる自由な循環
function cycleAccountStatus(id) {
  const current = accountsData[id];
  const mode = current.statusMode || (current.isRateLimited ? "limited" : (current.hasError ? "warning" : "normal"));

  if (mode === "normal") {
    current.statusMode = "warning";
    current.hasError = true;
    current.isRateLimited = false;
  } else if (mode === "warning") {
    current.statusMode = "limited";
    current.hasError = false;
    current.isRateLimited = true;
    current.meterLevel = 100;
  } else {
    // limitedからnormalへいつでも戻せる
    current.statusMode = "normal";
    current.hasError = false;
    current.isRateLimited = false;
    current.meterLevel = calculateDailyMeter(current.tokens);
  }

  saveAllData();
  updateCardValues();
}

function updateCardValues() {
  if (!isDataLoaded) return;

  for (let id = 1; id <= 4; id++) {
    const data = accountsData[id] || {};
    const card = document.getElementById(`card-${id}`);
    const badgeBtn = document.getElementById(`badge-${id}`);
    const meterContainer = document.getElementById(`meter-${id}`);

    const mode = data.statusMode || (data.isRateLimited ? "limited" : (data.hasError ? "warning" : "normal"));

    if (card) {
      if (mode === "limited") {
        card.className = "card status-limited";
      } else if (mode === "warning") {
        card.className = "card status-warning";
      } else {
        card.className = "card";
      }
    }

    if (badgeBtn) {
      badgeBtn.className = "status-toggle-btn";
      if (mode === "limited") {
        badgeBtn.classList.add("mode-limited");
        badgeBtn.innerText = "⛔ リミット到達・停止";
      } else if (mode === "warning") {
        badgeBtn.classList.add("mode-warning");
        badgeBtn.innerText = "⚡ エラー多発・警戒";
      } else {
        badgeBtn.classList.add("mode-normal");
        badgeBtn.innerText = "⚠️ リミット未達";
      }
    }

    const idInput = document.querySelector(`.google-id-input[data-account="${id}"]`);
    if (idInput && document.activeElement !== idInput) idInput.value = data.googleId || "";

    const progSelect = document.querySelector(`.prog-select[data-account="${id}"]`);
    if (progSelect) {
      progSelect.value = data.currentProgramId || "";
      progSelect.className = !data.currentProgramId ? "prog-select unselected" : "prog-select selected";
    }

    const themeInput = document.querySelector(`.theme-input[data-account="${id}"]`);
    if (themeInput && document.activeElement !== themeInput) themeInput.value = data.theme || "";

    const notesArea = document.querySelector(`.notes-area[data-account="${id}"]`);
    if (notesArea && document.activeElement !== notesArea) notesArea.value = data.notes || "";

    const timeText = document.getElementById(`time-${id}`);
    if (timeText) timeText.innerText = `⏱ ${formatElapsedTime(data.startTime)}`;

    const tokenText = document.getElementById(`token-${id}`);
    if (tokenText) tokenText.innerText = `📊 累計: ${(data.tokens || 0).toLocaleString()} tk`;

    const chatTokensEl = document.getElementById(`chatTokens-${id}`);
    const bloatBadgeEl = document.getElementById(`bloatBadge-${id}`);
    const curTokens = data.currentChatTokens || 0;

    if (chatTokensEl) chatTokensEl.innerText = curTokens.toLocaleString();
    if (bloatBadgeEl) {
      bloatBadgeEl.style.display = (curTokens >= 300000) ? "inline-block" : "none";
    }

    if (meterContainer) {
      const currentLevel = (mode === "limited") ? 100 : calculateDailyMeter(data.tokens || 0);

      meterContainer.querySelectorAll(".segment").forEach(seg => {
        const step = parseInt(seg.dataset.step, 10);
        seg.className = "segment";
        if (step === 100) seg.classList.add("manual-seg");

        if (step === 100) {
          if (mode === "limited") {
            seg.classList.add("active-100");
          }
        } else {
          if (currentLevel >= step) {
            seg.classList.add(`active-${step}`);
          }
        }
      });
    }
  }
}

// === タブ2: プログラム分析 ===
function renderProgramDashboard() {
  const chartList = document.getElementById("chartList");
  const progCardList = document.getElementById("progCardList");
  chartList.innerHTML = "";
  progCardList.innerHTML = "";

  cleanupAndMigrateSaveHistory();

  if (programsData.length === 0) {
    chartList.innerHTML = `<div style="color: #94a3b8; font-size: 13px;">プログラムが登録されていません。「⚙️ 設定」タブから登録してください。</div>`;
    progCardList.innerHTML = `<div style="color: #94a3b8; font-size: 13px; text-align: center; padding: 20px;">登録されているプログラムがありません。</div>`;
    return;
  }

  const tokenKey = currentPeriod === "today" ? "tokensToday" : (currentPeriod === "month" ? "tokensMonth" : "tokensWeek");
  const maxToken = Math.max(...programsData.map(p => (p[tokenKey] || (p.tokensWeek * 0.2))), 1);
  const colors = ["#38bdf8", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"];

  programsData.forEach((prog, index) => {
    let tokens = prog[tokenKey] || Math.round(prog.tokensWeek * (currentPeriod === "today" ? 0.25 : 1));
    let hours = (prog.hoursWeek * (currentPeriod === "today" ? 0.25 : (currentPeriod === "month" ? 3.8 : 1))).toFixed(1);
    let percent = Math.min(100, Math.round((tokens / maxToken) * 100));
    let color = colors[index % colors.length];

    const chartRow = document.createElement("div");
    chartRow.className = "chart-row";
    chartRow.innerHTML = `
      <div class="chart-meta">
        <span>📦 ${prog.name}</span>
        <span style="color: #cbd5e1;">${tokens.toLocaleString()} tk | ⏱ ${hours}h</span>
      </div>
      <div class="chart-bar-bg">
        <div class="chart-bar-fill" style="width: ${percent}%; background: ${color};"></div>
      </div>
    `;
    chartList.appendChild(chartRow);

    const historyCount = (prog.saveHistory || []).length;
    const cardEl = document.createElement("div");
    cardEl.className = "prog-manage-card";
    cardEl.innerHTML = `
      <div class="prog-card-header">
        <span class="prog-card-title">📦 ${escapeHtml(prog.name)}</span>
        <span class="prog-work-badge">${escapeHtml(prog.lastId || 'ID 1')} で作業中</span>
      </div>
      <div class="prog-card-details">
        <div>📁 ファイル: <span style="color: #cbd5e1;">${escapeHtml(prog.files || '未登録')}</span></div>
        <div style="margin-top: 3px;">📌 直近のセーブ: <span class="commit-text">${escapeHtml(prog.lastCommit || '未セーブ')}</span></div>
      </div>
      <div class="prog-card-actions">
        <button class="view-history-btn" data-prog-id="${prog.id}">📜 履歴 (${historyCount}件)</button>
        <button class="github-push-btn" data-prog-id="${prog.id}">🚀 GitHubへセーブ</button>
      </div>
    `;
    progCardList.appendChild(cardEl);
  });

  document.querySelectorAll(".github-push-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const pid = e.target.closest("button").dataset.progId;
      currentTargetProg = programsData.find(p => p.id === pid);
      openSaveModal(currentTargetProg);
    });
  });

  document.querySelectorAll(".view-history-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const pid = e.target.closest("button").dataset.progId;
      const target = programsData.find(p => p.id === pid);
      openHistoryModal(target);
    });
  });
}

function openHistoryModal(prog) {
  if (!prog) return;
  document.getElementById("historyModalTitle").innerText = `📜 【${prog.name}】 GitHubセーブ履歴`;
  const bodyEl = document.getElementById("historyModalBody");
  bodyEl.innerHTML = "";

  const history = prog.saveHistory || [];

  if (history.length === 0) {
    bodyEl.innerHTML = `
      <div style="text-align: center; color: #94a3b8; padding: 40px 20px; font-size: 13px;">
        💡 まだGitHubへのセーブ履歴がありません。<br>
        「🚀 GitHubへセーブ」ボタンからファイルをプッシュすると、ここに過去のコミットと変更概要が自動蓄積されます。
      </div>
    `;
  } else {
    const listContainer = document.createElement("div");
    listContainer.className = "history-timeline-list";

    history.forEach((item, index) => {
      const isLatest = (index === 0);
      const card = document.createElement("div");
      card.className = "history-card-item";

      card.innerHTML = `
        <div class="history-item-top">
          <span class="history-badge-num">${isLatest ? '🟢 最新 (第' + (history.length - index) + '回セーブ)' : '第' + (history.length - index) + '回セーブ'}</span>
          <span class="history-item-date">🕒 セーブ日時: <strong style="color: #cbd5e1;">${escapeHtml(item.dateStr || '記録なし')}</strong></span>
        </div>
        <div class="history-commit-msg">📌 コミットメッセージ: <span style="color: #f8fafc;">${escapeHtml(item.commitMsg)}</span></div>
        <div class="history-summary-body">
          <div style="font-weight: 700; color: #38bdf8; margin-bottom: 5px;">📝 詳細な変更履歴 (Change Log):</div>
          <div>${escapeHtml(item.summary || '変更概要なし')}</div>
        </div>
      `;
      listContainer.appendChild(card);
    });

    bodyEl.appendChild(listContainer);
  }

  document.getElementById("historyModalOverlay").classList.add("active");
}

function initHistoryModalHandlers() {
  const overlay = document.getElementById("historyModalOverlay");
  const closeBtn = document.getElementById("closeHistoryModalBtn");
  const closeFooterBtn = document.getElementById("closeHistoryModalFooterBtn");

  closeBtn.onclick = () => overlay.classList.remove("active");
  closeFooterBtn.onclick = () => overlay.classList.remove("active");
}

// === タブ4: 🧠 開発ナレッジ要約 ===
function renderKnowledgeFilterTabs() {
  const container = document.getElementById("knowledgeFilterTabs");
  if (!container) return;

  let html = `<button class="filter-btn ${selectedKnowledgeFilter === 'ALL' ? 'active' : ''}" data-prog="ALL">すべてのプログラム</button>`;
  
  programsData.forEach(p => {
    html += `<button class="filter-btn ${selectedKnowledgeFilter === p.id ? 'active' : ''}" data-prog="${p.id}">${escapeHtml(p.name)}</button>`;
  });

  container.innerHTML = html;

  container.querySelectorAll(".filter-btn").forEach(btn => {
    btn.onclick = (e) => {
      selectedKnowledgeFilter = e.target.dataset.prog;
      renderKnowledgeFilterTabs();
      renderKnowledgeList();
    };
  });
}

function renderFormattedSummaryBoxes(rawText) {
  if (!rawText) return `<div class="section-box-content">要約内容がありません。</div>`;

  const purposeMatch = rawText.match(/■\s*セッションの目的([\s\S]*?)(?=■\s*主な決定事項|$)/i);
  const decisionMatch = rawText.match(/■\s*主な決定事項[^\n]*([\s\S]*?)(?=■\s*(?:💡\s*)?(?:得られたノウハウ|ノウハウ|知見|重要キーワード)|$)/i);
  const knowhowMatch = rawText.match(/■\s*(?:💡\s*)?(?:得られたノウハウ|ノウハウ|知見|重要キーワード)[^\n]*([\s\S]*?)$/i);

  if (purposeMatch || decisionMatch || knowhowMatch) {
    const purposeText = (purposeMatch ? purposeMatch[1] : "").trim();
    const decisionText = (decisionMatch ? decisionMatch[1] : "").trim();
    const knowhowText = (knowhowMatch ? knowhowMatch[1] : "").trim();

    return `
      ${purposeText ? `
        <div class="knowledge-purpose-box">
          <strong style="color: #38bdf8;">🎯 セッションの目的:</strong> ${escapeHtml(purposeText)}
        </div>
      ` : ''}
      <div class="knowledge-split-grid">
        <div class="knowledge-section-box">
          <div class="section-box-header">🛠️ 主な決定事項・コード改修</div>
          <div class="section-box-content">${escapeHtml(decisionText || '特に記録なし')}</div>
        </div>
        <div class="knowledge-section-box">
          <div class="section-box-header">💡 得られたノウハウ・知見・重要キーワード</div>
          <div class="section-box-content">${escapeHtml(knowhowText || '特に記録なし')}</div>
        </div>
      </div>
    `;
  }

  return `<div class="knowledge-purpose-box" style="white-space: pre-wrap;">${escapeHtml(rawText)}</div>`;
}

function renderKnowledgeList() {
  const container = document.getElementById("knowledgeListContainer");
  const searchInput = document.getElementById("knowledgeSearchInput");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  container.innerHTML = "";

  if (knowledgeLogsData.length === 0) {
    container.innerHTML = `
      <div style="background: #1e293b; border: 1px dashed #475569; border-radius: 10px; padding: 30px; text-align: center; color: #94a3b8; font-size: 13px;">
        💡 まだナレッジ要約が保存されていません。<br>
        AI Studioの画面右上にある <strong>「🧠 ナレッジ要約してマネージャーへ同期」</strong> ボタンを押すと、ここに要約カードが自動蓄積されます。
      </div>
    `;
    return;
  }

  const filteredIndices = [];
  knowledgeLogsData.forEach((log, originalIndex) => {
    const matchProg = (selectedKnowledgeFilter === "ALL") || (log.programId === selectedKnowledgeFilter);
    const textAll = `${log.title} ${log.programName} ${log.summary} ${log.chatDate || ''} ${log.usedModel || ''}`.toLowerCase();
    const matchQuery = (query === "") || textAll.includes(query);
    if (matchProg && matchQuery) {
      filteredIndices.push(originalIndex);
    }
  });

  if (filteredIndices.length === 0) {
    container.innerHTML = `<div style="color: #94a3b8; font-size: 13px; text-align: center; padding: 20px;">該当するナレッジが見つかりませんでした。</div>`;
    return;
  }

  filteredIndices.forEach((origIdx, localIdx) => {
    const log = knowledgeLogsData[origIdx];
    const card = document.createElement("div");
    card.className = "knowledge-card";

    const isTopLatest = (localIdx === 0);
    const phaseBadgeHtml = isTopLatest
      ? `<span class="badge-latest-star">⭐ 最新決定版</span>`
      : `<span class="phase-badge">#${filteredIndices.length - localIdx}</span>`;

    const dateText = log.chatDate ? `📅 ${escapeHtml(log.chatDate)}` : (log.updatedAt ? `📅 ${escapeHtml(log.updatedAt)}` : "");
    const modelBadge = log.usedModel ? `<span class="badge-model">🤖 ${escapeHtml(log.usedModel)}</span>` : "";

    card.innerHTML = `
      <div class="knowledge-header">
        <div class="knowledge-title-group">
          ${phaseBadgeHtml}
          <span class="badge-prog">📦 ${escapeHtml(log.programName || '未分類')}</span>
          <span class="badge-id">ID ${log.accountId}</span>
          <span class="knowledge-title">${escapeHtml(log.title)}</span>
          <span class="knowledge-dates">${dateText}</span>
          ${modelBadge}
        </div>
        <div class="knowledge-actions">
          <button class="order-btn" data-action="up" data-index="${origIdx}" title="上へ移動（最新側へ）">▲ 上へ</button>
          <button class="order-btn" data-action="down" data-index="${origIdx}" title="下へ移動（過去側へ）">▼ 下へ</button>
          <button class="copy-prompt-btn" data-id="${log.id}">📋 引継ぎプロンプトをコピー</button>
          <a class="jump-chat-btn" href="${escapeHtml(log.url)}" target="_blank">🔗 AI Studioを開く</a>
          <button class="del-card-btn" data-id="${log.id}">削除</button>
        </div>
      </div>
      ${renderFormattedSummaryBoxes(log.summary)}
    `;

    card.querySelector('[data-action="up"]').onclick = () => {
      if (origIdx > 0) {
        const temp = knowledgeLogsData[origIdx];
        knowledgeLogsData[origIdx] = knowledgeLogsData[origIdx - 1];
        knowledgeLogsData[origIdx - 1] = temp;
        saveAllData();
        renderKnowledgeList();
      }
    };

    card.querySelector('[data-action="down"]').onclick = () => {
      if (origIdx < knowledgeLogsData.length - 1) {
        const temp = knowledgeLogsData[origIdx];
        knowledgeLogsData[origIdx] = knowledgeLogsData[origIdx + 1];
        knowledgeLogsData[origIdx + 1] = temp;
        saveAllData();
        renderKnowledgeList();
      }
    };

    card.querySelector(".copy-prompt-btn").onclick = () => {
      const promptToCopy = `あなたはプロのエンジニアです。前回のチャット（${log.title}）から作業を引き継ぎます。\n以下は前回のセッションで決定・実装された要約と知見です。これを前提として開発を続行してください。\n\n---\n${log.summary}\n---`;
      navigator.clipboard.writeText(promptToCopy).then(() => {
        alert("✅ 最新の引継ぎ用プロンプトをクリップボードにコピーしました！\n新しいAI Studioのチャットに貼り付けてそのまま作業を再開できます。");
      });
    };

    card.querySelector(".del-card-btn").onclick = () => {
      if (confirm(`「${log.title}」のナレッジカードを削除してもよろしいですか？`)) {
        knowledgeLogsData = knowledgeLogsData.filter(l => l.id !== log.id);
        chrome.storage.local.set({ knowledgeLogs: knowledgeLogsData }, () => {
          renderKnowledgeList();
        });
      }
    };

    container.appendChild(card);
  });
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// === タブ3: マスタ設定 ===
function renderMasterSettings() {
  const tbody = document.getElementById("masterTableBody");
  tbody.innerHTML = "";

  programsData.forEach((prog, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="color: #94a3b8; font-weight: bold;">${index + 1}</td>
      <td>
        <input type="text" class="master-input master-name" value="${prog.name}" placeholder="例: 01_メインシステム">
      </td>
      <td>
        <input type="text" class="master-input master-files" value="${prog.files || ''}" placeholder="例: main.py, config.json">
      </td>
      <td>
        <button class="delete-btn" data-index="${index}">削除</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      if (confirm(`「${programsData[idx].name}」を削除してもよろしいですか？`)) {
        programsData.splice(idx, 1);
        renderMasterSettings();
        renderKnowledgeFilterTabs();
      }
    });
  });

  document.getElementById("githubToken").value = apiConfig.githubToken || "";
  document.getElementById("githubRepo").value = apiConfig.githubRepo || "";
  document.getElementById("geminiApiKey").value = apiConfig.geminiApiKey || "";
  document.getElementById("geminiModelName").value = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
}

function initNavigation() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      e.target.classList.add("active");
      const targetId = e.target.dataset.tab;
      document.getElementById(targetId).classList.add("active");

      if (targetId === "tab2") renderProgramDashboard();
      if (targetId === "tab3") renderMasterSettings();
      if (targetId === "tab4") {
        renderKnowledgeFilterTabs();
        renderKnowledgeList();
      }
    });
  });

  document.querySelectorAll(".period-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".period-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      currentPeriod = e.target.dataset.period;
      renderProgramDashboard();
    });
  });

  document.getElementById("addMasterRowBtn").addEventListener("click", () => {
    programsData.push({
      id: `prog_${Date.now()}`,
      name: `新規プログラム_${programsData.length + 1}`,
      files: "",
      tokensWeek: 0,
      tokensMonth: 0,
      hoursWeek: 0,
      lastCommit: "未セーブ",
      lastId: "ID 1",
      saveHistory: []
    });
    renderMasterSettings();
  });

  document.getElementById("clearSampleBtn").addEventListener("click", () => {
    if (confirm("サンプルのプログラムを全て消去して、リストを空にしますか？")) {
      programsData = [];
      renderMasterSettings();
    }
  });

  document.getElementById("saveMasterBtn").addEventListener("click", () => {
    const rows = document.querySelectorAll("#masterTableBody tr");
    const updated = [];
    rows.forEach((row, i) => {
      const name = row.querySelector(".master-name").value.trim();
      const files = row.querySelector(".master-files").value.trim();
      if (name) {
        const old = programsData[i] || {};
        updated.push({
          id: old.id || `prog_${Date.now()}_${i}`,
          name: name,
          files: files,
          tokensWeek: old.tokensWeek || 0,
          tokensMonth: old.tokensMonth || 0,
          hoursWeek: old.hoursWeek || 0,
          lastCommit: old.lastCommit || "未セーブ",
          lastId: old.lastId || "ID 1",
          saveHistory: old.saveHistory || []
        });
      }
    });

    programsData = updated;
    saveAllData();
    setupCards();
    renderKnowledgeFilterTabs();
    alert("✅ プログラムマスタを正常に保存しました！");
  });

  document.getElementById("saveApiConfigBtn").addEventListener("click", () => {
    apiConfig.githubToken = document.getElementById("githubToken").value.trim();
    apiConfig.githubRepo = document.getElementById("githubRepo").value.trim();
    apiConfig.geminiApiKey = document.getElementById("geminiApiKey").value.trim();
    apiConfig.geminiModelName = document.getElementById("geminiModelName").value.trim() || "gemini-3.5-flash-lite";

    chrome.storage.local.set({ apiConfig }, () => {
      updateActiveModelBadge();
      alert("✅ GitHub & Gemini API設定を保存しました！");
    });
  });

  const searchInput = document.getElementById("knowledgeSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderKnowledgeList();
    });
  }
}

function saveAllData() {
  chrome.storage.local.set({ accounts: accountsData, programs: programsData, knowledgeLogs: knowledgeLogsData, apiConfig: apiConfig });
}

function initModalHandlers() {
  const overlay = document.getElementById("saveModalOverlay");
  const dropzone = document.getElementById("dropzone");
  const fileSelector = document.getElementById("fileSelector");
  const closeBtn = document.getElementById("closeModalBtn");
  const cancelBtn = document.getElementById("cancelModalBtn");
  const executeBtn = document.getElementById("executePushBtn");
  const reGenBtn = document.getElementById("reGenerateSummaryBtn");
  const repoInput = document.getElementById("modalRepoInput");

  closeBtn.onclick = () => overlay.classList.remove("active");
  cancelBtn.onclick = () => overlay.classList.remove("active");
  dropzone.onclick = () => fileSelector.click();
  dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add("dragover"); };
  dropzone.ondragleave = () => dropzone.classList.remove("dragover");
  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    handleSelectedFiles(e.dataTransfer.files);
  };
  fileSelector.onchange = (e) => handleSelectedFiles(e.target.files);

  repoInput.oninput = (e) => {
    apiConfig.githubRepo = e.target.value.trim();
    chrome.storage.local.set({ apiConfig });
  };

  executeBtn.onclick = executeGitHubPush;
  reGenBtn.onclick = analyzeDiffAndGenerateSummary;
}

function openSaveModal(prog) {
  currentTargetProg = prog;
  loadedLocalFiles = [];
  document.getElementById("modalProgTitle").innerText = `🚀 【${prog.name}】をGitHubへセーブ`;
  document.getElementById("modalRepoInput").value = apiConfig.githubRepo || "";
  document.getElementById("selectedFilesList").innerHTML = "";
  document.getElementById("commitMessageInput").value = "";
  document.getElementById("changeSummaryArea").value = "";
  document.getElementById("statusBanner").classList.remove("active");
  document.getElementById("reGenerateSummaryBtn").style.display = "none";
  document.getElementById("saveModalOverlay").classList.add("active");
}

async function handleSelectedFiles(fileList) {
  if (!fileList || fileList.length === 0) return;
  loadedLocalFiles = [];
  const listEl = document.getElementById("selectedFilesList");
  listEl.innerHTML = "";

  const filesArray = Array.from(fileList);
  for (const file of filesArray) {
    const text = await readFileAsText(file);
    loadedLocalFiles.push({ name: file.name, content: text });
    listEl.innerHTML += `<div>📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)</div>`;
  }

  analyzeDiffAndGenerateSummary();
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function analyzeDiffAndGenerateSummary() {
  const banner = document.getElementById("statusBanner");
  banner.className = "status-banner active";
  banner.innerText = `⏳ 前回コードを確認し、${apiConfig.geminiModelName || 'gemini-3.5-flash-lite'} で差分を要約中...`;

  const repo = document.getElementById("modalRepoInput").value.trim() || apiConfig.githubRepo;
  if (!apiConfig.githubToken || !repo) {
    banner.innerText = "⚠️ 上の入力欄に「対象リポジトリ名」、設定タブに「GitHubトークン」を入力してください。";
    return;
  }
  apiConfig.githubRepo = repo;

  try {
    const diffs = [];
    for (const f of loadedLocalFiles) {
      const oldCode = await fetchOldFileFromGitHub(f.name);
      if (oldCode === null) {
        diffs.push(`【新規追加ファイル: ${f.name}】\n内容の一部:\n${f.content.substring(0, 500)}...`);
      } else if (oldCode !== f.content) {
        diffs.push(`【変更ファイル: ${f.name}】\n差分スニペット:\n${createSnippetDiff(oldCode, f.content)}`);
      }
    }

    const diffContext = diffs.join("\n\n");

    if (apiConfig.geminiApiKey) {
      banner.innerText = `🤖 ${apiConfig.geminiModelName} が変更概要を自然言語で作成中...`;
      const aiResult = await callGeminiAPI(diffContext);
      document.getElementById("commitMessageInput").value = aiResult.commitMessage;
      document.getElementById("changeSummaryArea").value = aiResult.summary;
    } else {
      document.getElementById("commitMessageInput").value = `${currentTargetProg.name} のコード改修`;
      document.getElementById("changeSummaryArea").value = `■ 変更されたファイル一覧:\n${loadedLocalFiles.map(f => `- ${f.name}`).join("\n")}\n\n※Gemini APIキーを設定すると、自然言語の詳細要約が自動出力されます。`;
    }

    banner.innerText = "✅ 差分解析と要約ドラフトの作成が完了しました！内容を確認・微調整してください。";
    document.getElementById("reGenerateSummaryBtn").style.display = "inline-block";
  } catch (err) {
    console.error(err);
    banner.innerText = `⚠️ 差分解析中にエラーが発生しました: ${err.message}`;
  }
}

async function fetchOldFileFromGitHub(path) {
  const [owner, repo] = apiConfig.githubRepo.split("/");
  if (!owner || !repo) return null;

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `token ${apiConfig.githubToken}`,
      "Accept": "application/vnd.github.v3+json"
    }
  });

  if (res.status === 404) return null;
  if (!res.ok) return null;

  const data = await res.json();
  return decodeBase64Utf8(data.content);
}

function decodeBase64Utf8(base64Str) {
  try {
    const binStr = atob(base64Str.replace(/\n/g, ''));
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch (e) {
    return "";
  }
}

function createSnippetDiff(oldStr, newStr) {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const diffLines = [];
  for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
    if (oldLines[i] !== newLines[i]) {
      if (oldLines[i]) diffLines.push(`- ${oldLines[i].substring(0, 80)}`);
      if (newLines[i]) diffLines.push(`+ ${newLines[i].substring(0, 80)}`);
      if (diffLines.length > 15) break;
    }
  }
  return diffLines.join("\n") || "コード全体の更新";
}

async function callGeminiAPI(diffText) {
  const model = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiConfig.geminiApiKey}`;

  const prompt = `あなたはプロのソフトウェアエンジニア兼テクニカルライターです。
以下の差分情報を読み解き、人間がパッと理解できる分かりやすい日本語の変更概要を作成してください。

【厳格な指示】
・英語のラベルやJSON記号（{, }, ", commitMessage, summary, feat: など）は一切含めないでください。
・1行目に「1行のコミットメッセージ」を書いてください。
・2行目以降に「・」で始まる変更点の箇条書きを書いてください。

【差分データ】
${diffText || "初回登録・ベースファイル一式"}
`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2 }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  rawText = rawText
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .replace(/\{[\s\S]*?"commitMessage":\s*"/i, '')
    .replace(/",\s*"summary":\s*"/i, '\n')
    .replace(/"\s*\}?$/i, '')
    .replace(/commitMessage[:=]?/gi, '')
    .replace(/summary[:=]?/gi, '')
    .replace(/feat:\s*/gi, '')
    .trim();

  const lines = rawText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const commitMsg = lines[0] || `${currentTargetProg.name} の機能更新`;
  const summary = lines.slice(1).join("\n") || lines[0] || "・各種ファイルの初期追加および改修";

  return {
    commitMessage: commitMsg.replace(/^["'・\s]+|["'\s]+$/g, ''),
    summary: summary
  };
}

async function executeGitHubPush() {
  const repoInputVal = document.getElementById("modalRepoInput").value.trim();
  const commitMsg = document.getElementById("commitMessageInput").value.trim();
  const summary = document.getElementById("changeSummaryArea").value.trim();
  const banner = document.getElementById("statusBanner");

  if (!repoInputVal || !commitMsg || loadedLocalFiles.length === 0) {
    alert("必須項目（リポジトリ名、コミットメッセージ、ファイル選択）を確認してください。");
    return;
  }

  apiConfig.githubRepo = repoInputVal;
  chrome.storage.local.set({ apiConfig });

  banner.className = "status-banner active";
  banner.innerText = "🚀 GitHubへ接続中...";

  const [owner, repo] = repoInputVal.split("/");
  if (!owner || !repo) {
    alert("リポジトリ名の形式が不正です（例: user/repo）。");
    return;
  }

  try {
    await ensureRepositoryExists(owner, repo);

    const now = new Date();
    const dateFormatted = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newLogEntry = `### [${dateFormatted}] ${commitMsg}\n\n${summary}\n\n---\n`;

    let oldReadme = await fetchOldFileFromGitHub("README.md") || "";
    let updatedReadme = "";
    const headerTitle = `# 📦 ${currentTargetProg ? currentTargetProg.name : repo}\n\nAI Studioと連携して自動管理・同期されているプロジェクトです。\n\n## 📝 更新履歴 (Change Log)\n\n`;

    if (!oldReadme || oldReadme.includes("Created automatically by Studio Manager")) {
      updatedReadme = headerTitle + newLogEntry;
    } else if (oldReadme.includes("## 📝 更新履歴 (Change Log)")) {
      updatedReadme = oldReadme.replace("## 📝 更新履歴 (Change Log)\n\n", `## 📝 更新履歴 (Change Log)\n\n${newLogEntry}`);
    } else {
      updatedReadme = oldReadme + `\n\n## 📝 更新履歴 (Change Log)\n\n${newLogEntry}`;
    }

    const filteredFiles = loadedLocalFiles.filter(f => f.name !== "README.md");
    const allFilesToPush = [...filteredFiles, { name: "README.md", content: updatedReadme }];

    banner.innerText = `📦 ファイル群をコミット中 (全 ${allFilesToPush.length} ファイル)...`;
    for (const file of allFilesToPush) {
      await pushSingleFileToGitHub(owner, repo, file.name, file.content, commitMsg);
    }

    if (!currentTargetProg.saveHistory) currentTargetProg.saveHistory = [];
    currentTargetProg.saveHistory.unshift({
      timestamp: now.getTime(),
      dateStr: dateFormatted,
      commitMsg: commitMsg,
      summary: summary
    });

    currentTargetProg.lastCommit = commitMsg;
    saveAllData();
    renderProgramDashboard();

    banner.innerText = "🎉 GitHubへのプッシュが正常に完了しました！";
    setTimeout(() => {
      document.getElementById("saveModalOverlay").classList.remove("active");
      alert(`✅ GitHubへのセーブが完了しました！\nリポジトリ: ${owner}/${repo}\nコミット: ${commitMsg}`);
    }, 1200);

  } catch (err) {
    console.error(err);
    banner.innerText = `❌ プッシュ失敗: ${err.message}`;
    alert(`エラーが発生しました:\n${err.message}`);
  }
}

async function ensureRepositoryExists(owner, repo) {
  const checkUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetch(checkUrl, {
    headers: {
      "Authorization": `token ${apiConfig.githubToken}`,
      "Accept": "application/vnd.github.v3+json"
    }
  });

  if (res.status === 404) {
    const createUrl = `https://api.github.com/user/repos`;
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Authorization": `token ${apiConfig.githubToken}`,
        "Content-Type": "application/json",
        "Accept": "application/vnd.github.v3+json"
      },
      body: JSON.stringify({ name: repo, description: "Managed by Studio Manager", auto_init: true })
    });
    if (!createRes.ok) throw new Error("リポジトリ自動作成に失敗しました。");
    await new Promise(r => setTimeout(r, 1500));
  }
}

async function pushSingleFileToGitHub(owner, repo, path, content, commitMessage) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  let sha = undefined;
  const getRes = await fetch(url, { headers: { "Authorization": `token ${apiConfig.githubToken}`, "Accept": "application/vnd.github.v3+json" } });
  if (getRes.ok) {
    const data = await getRes.json();
    sha = data.sha;
  }

  const utf8Bytes = new TextEncoder().encode(content);
  let binary = "";
  utf8Bytes.forEach(b => binary += String.fromCharCode(b));
  const base64Content = btoa(binary);

  const putRes = await fetch(url, {
    method: "PUT",
    headers: { "Authorization": `token ${apiConfig.githubToken}`, "Content-Type": "application/json", "Accept": "application/vnd.github.v3+json" },
    body: JSON.stringify({ message: `${commitMessage} (${path})`, content: base64Content, sha: sha })
  });

  if (!putRes.ok) throw new Error(`${path} のプッシュ失敗`);
}

function bootstrap() {
  initNavigation();
  initModalHandlers();
  initHistoryModalHandlers();
  updateCountdown();

  chrome.storage.local.get(["accounts", "programs", "knowledgeLogs", "apiConfig"], (res) => {
    if (res.programs && res.programs.length > 0) programsData = res.programs;
    if (res.knowledgeLogs) knowledgeLogsData = res.knowledgeLogs;
    if (res.apiConfig) apiConfig = Object.assign(apiConfig, res.apiConfig);
    if (res.accounts) {
      for (let i = 1; i <= 4; i++) {
        if (res.accounts[i]) {
          accountsData[i] = Object.assign(accountsData[i] || {}, res.accounts[i]);
        }
      }
    }

    cleanupAndMigrateSaveHistory();

    isDataLoaded = true;
    updateActiveModelBadge();
    setupCards();
    renderProgramDashboard();
    renderMasterSettings();

    setInterval(updateCountdown, 1000);
    setInterval(syncBackgroundStats, 2000);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      if (changes.apiConfig) {
        apiConfig = Object.assign(apiConfig, changes.apiConfig.newValue || {});
        updateActiveModelBadge();
      }
      if (changes.accounts) {
        const newAccounts = changes.accounts.newValue;
        if (newAccounts) {
          for (let i = 1; i <= 4; i++) {
            if (newAccounts[i]) {
              accountsData[i].tokens = newAccounts[i].tokens;
              accountsData[i].currentChatTokens = newAccounts[i].currentChatTokens;
              accountsData[i].meterLevel = newAccounts[i].meterLevel;
              accountsData[i].statusMode = newAccounts[i].statusMode;
              accountsData[i].isRateLimited = newAccounts[i].isRateLimited;
              accountsData[i].hasError = newAccounts[i].hasError;
              accountsData[i].startTime = newAccounts[i].startTime;
              accountsData[i].tabId = newAccounts[i].tabId;
            }
          }
          updateCardValues();
        }
      }
      if (changes.knowledgeLogs) {
        knowledgeLogsData = changes.knowledgeLogs.newValue || [];
        renderKnowledgeList();
      }
      if (changes.programs) {
        programsData = changes.programs.newValue || [];
        renderProgramDashboard();
      }
    }
  });
}

function syncBackgroundStats() {
  chrome.storage.local.get(["accounts"], (res) => {
    if (res.accounts) {
      for (let i = 1; i <= 4; i++) {
        const bgAcc = res.accounts[i];
        if (bgAcc) {
          accountsData[i].tokens = bgAcc.tokens;
          accountsData[i].currentChatTokens = bgAcc.currentChatTokens;
          accountsData[i].meterLevel = bgAcc.meterLevel;
          accountsData[i].statusMode = bgAcc.statusMode;
          accountsData[i].isRateLimited = bgAcc.isRateLimited;
          accountsData[i].hasError = bgAcc.hasError;
          accountsData[i].startTime = bgAcc.startTime;
          accountsData[i].tabId = bgAcc.tabId;
        }
      }
      updateCardValues();
    }
  });
}

bootstrap();