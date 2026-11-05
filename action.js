function createInitialAccounts() {
  const accounts = {};
  for (let i = 1; i <= 4; i++) {
    accounts[i] = {
      accountId: i,
      googleId: `アカウント ${i}`,
      currentProgramId: "",
      theme: "",
      tokens: 0,
      meterLevel: 0,
      isManual: false,
      isRateLimited: false,
      startTime: null,
      tabId: null,
      notes: ""
    };
  }
  return accounts;
}

const defaultPrograms = [
  { id: "prog_1", name: "01_Studioマネージャー(AI Studio連携)", files: "manifest.json, background.js, display.html, action.js, content.js", tokensWeek: 1250000, tokensMonth: 3400000, hoursWeek: 5.5, lastCommit: "v1.0: 初回開発完了", lastId: "ID 1" }
];

let accountsData = createInitialAccounts();
let programsData = defaultPrograms;
let chatLogsData = [];
let apiConfig = {
  githubToken: "",
  githubRepo: "",
  geminiApiKey: "",
  geminiModelName: "gemini-3.5-flash-lite"
};

let currentSelectedLogId = null;
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

function formatElapsedTime(startTime) {
  if (!startTime) return "未開始";
  const diffSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

// === タブ1: IDモニター組み立て ===
function setupCards() {
  const container = document.getElementById("cardsGrid");
  container.innerHTML = "";
  const steps = [20, 40, 60, 80, 100];

  for (let id = 1; id <= 4; id++) {
    const card = document.createElement("div");
    card.className = "card";
    card.id = `card-${id}`;

    let meterHtml = steps.map(step => `<div class="segment" data-step="${step}">${step}%</div>`).join("");
    
    let progOptions = `<option value="">── 対象プログラムを選択 (未分類) ──</option>`;
    programsData.forEach(p => {
      progOptions += `<option value="${p.id}">${p.name}</option>`;
    });

    card.innerHTML = `
      <div class="card-top">
        <span class="id-badge">ID ${id}</span>
        <button class="limit-badge-btn" id="badge-${id}" data-account="${id}">⚠️ リミット未達</button>
        <input type="text" class="google-id-input" data-account="${id}" placeholder="Google ID (例: work@gmail.com)">
        <button class="jump-btn" data-account="${id}">このタブを開く</button>
      </div>

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
            <span id="token-${id}">📊 0 tk</span>
          </div>
        </div>

        <div class="row-2">
          <span class="meter-label-mini">メーター</span>
          <div class="meter-segments" data-account="${id}" id="meter-${id}">
            ${meterHtml}
          </div>
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
    `;

    container.appendChild(card);
  }

  attachCardEvents();
  updateCardValues();
}

// === タブ2: プログラム分析・タイムライン ===
function renderProgramDashboard() {
  const chartList = document.getElementById("chartList");
  const timelineBody = document.getElementById("timelineBody");
  chartList.innerHTML = "";
  timelineBody.innerHTML = "";

  if (programsData.length === 0) {
    chartList.innerHTML = `<div style="color: #94a3b8; font-size: 13px;">プログラムが登録されていません。「⚙️ 設定」タブから登録してください。</div>`;
    timelineBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8;">登録されているプログラムがありません。</td></tr>`;
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

    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `
      <div class="chart-meta">
        <span>📦 ${prog.name}</span>
        <span style="color: #cbd5e1;">${tokens.toLocaleString()} トークン  |  ⏱ ${hours} 時間</span>
      </div>
      <div class="chart-bar-bg">
        <div class="chart-bar-fill" style="width: ${percent}%; background: ${color};"></div>
      </div>
    `;
    chartList.appendChild(row);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <strong style="color: #38bdf8;">${prog.name}</strong>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">ファイル: ${prog.files || '未登録'}</div>
      </td>
      <td>
        <span style="background: #0284c7; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">現在: ${prog.lastId || 'ID 1'} で作業中</span>
      </td>
      <td>
        <div>${prog.lastCommit || '未セーブ'}</div>
      </td>
      <td>
        <button class="github-push-btn" data-prog-id="${prog.id}">🚀 GitHubへセーブ</button>
      </td>
    `;
    timelineBody.appendChild(tr);
  });

  document.querySelectorAll(".github-push-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const pid = e.target.closest("button").dataset.progId;
      currentTargetProg = programsData.find(p => p.id === pid);
      openSaveModal(currentTargetProg);
    });
  });
}

// === タブ3: マスタ設定 & API設定 ===
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
      }
    });
  });

  // API設定の反映
  document.getElementById("githubToken").value = apiConfig.githubToken || "";
  document.getElementById("githubRepo").value = apiConfig.githubRepo || "";
  document.getElementById("geminiApiKey").value = apiConfig.geminiApiKey || "";
  document.getElementById("geminiModelName").value = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
}

// === タブ4: チャット履歴ログ ===
function renderChatLogs() {
  const listContainer = document.getElementById("logListContainer");
  listContainer.innerHTML = "";

  if (chatLogsData.length === 0) {
    listContainer.innerHTML = `<div style="color: #64748b; font-size: 11px; padding: 12px; text-align: center;">ログがありません。<br>AI Studio画面の「💾 チャットをHTML保存」を押してください。</div>`;
    renderChatDetail(null);
    return;
  }

  chatLogsData.forEach(log => {
    const item = document.createElement("div");
    item.className = `log-item ${currentSelectedLogId === log.id ? 'active' : ''}`;
    item.innerHTML = `
      <div class="log-item-title">${log.title}</div>
      <div class="log-item-meta">
        <span class="log-item-badge">ID ${log.accountId}</span>
        <span>${log.dateStr}</span>
      </div>
      <div style="font-size: 10px; color: #38bdf8; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        📦 ${log.programName}
      </div>
    `;

    item.addEventListener("click", () => {
      currentSelectedLogId = log.id;
      renderChatLogs();
      renderChatDetail(log.id);
    });

    listContainer.appendChild(item);
  });

  if (!currentSelectedLogId && chatLogsData.length > 0) {
    currentSelectedLogId = chatLogsData[0].id;
    renderChatDetail(currentSelectedLogId);
  }
}

function renderChatDetail(logId) {
  const viewerTitle = document.getElementById("viewerSessionTitle");
  const viewerMeta = document.getElementById("viewerSessionMeta");
  const viewerBody = document.getElementById("viewerBodyContainer");
  const delBtn = document.getElementById("deleteCurrentLogBtn");

  if (!logId) {
    viewerTitle.innerText = "セッションを選択してください";
    viewerMeta.innerText = "";
    viewerBody.innerHTML = `<div style="text-align: center; color: #64748b; margin-top: 100px; font-size: 13px;">👈 左の一覧から閲覧したいチャットセッションを選択してください。</div>`;
    delBtn.style.display = "none";
    return;
  }

  const log = chatLogsData.find(l => l.id === logId);
  if (!log) return;

  viewerTitle.innerText = log.title;
  viewerMeta.innerText = `(ID ${log.accountId} | ${log.dateStr} | ${log.programName})`;
  delBtn.style.display = "inline-block";
  viewerBody.innerHTML = "";

  log.messages.forEach(msg => {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${msg.role}`;
    const authorLabel = msg.role === "user" ? "👤 あなた (指示・プロンプト)" : "🤖 AI Studio (返答・要約)";
    
    bubble.innerHTML = `
      <div class="bubble-header">
        <span>${authorLabel}</span>
        <button class="copy-text-btn">📋 本文コピー</button>
      </div>
      <div class="bubble-content">${escapeHtml(msg.text)}</div>
    `;

    bubble.querySelector(".copy-text-btn").addEventListener("click", (e) => {
      navigator.clipboard.writeText(msg.text).then(() => {
        const btn = e.target;
        btn.innerText = "✅ コピー完了！";
        setTimeout(() => { btn.innerText = "📋 本文コピー"; }, 1500);
      });
    });

    viewerBody.appendChild(bubble);
  });
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// === イベント登録 ===
function attachCardEvents() {
  document.querySelectorAll(".limit-badge-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.account;
      const willBeLimited = !accountsData[id].isRateLimited;
      accountsData[id].isRateLimited = willBeLimited;
      accountsData[id].isManual = true;
      if (willBeLimited) accountsData[id].meterLevel = 100;
      saveAllData();
      updateCardValues();
    });
  });

  document.querySelectorAll(".prog-select").forEach(sel => {
    sel.addEventListener("change", (e) => {
      const id = e.target.dataset.account;
      const val = e.target.value;
      accountsData[id].currentProgramId = val;
      e.target.className = val === "" ? "prog-select unselected" : "prog-select selected";
      saveAllData();
    });
  });

  document.querySelectorAll(".google-id-input").forEach(el => el.addEventListener("input", e => { accountsData[e.target.dataset.account].googleId = e.target.value; saveAllData(); }));
  document.querySelectorAll(".theme-input").forEach(el => el.addEventListener("input", e => { accountsData[e.target.dataset.account].theme = e.target.value; saveAllData(); }));
  document.querySelectorAll(".notes-area").forEach(el => el.addEventListener("input", e => { accountsData[e.target.dataset.account].notes = e.target.value; saveAllData(); }));

  document.querySelectorAll(".meter-segments").forEach(meter => {
    meter.addEventListener("click", (e) => {
      const seg = e.target.closest(".segment");
      if (!seg) return;
      const id = meter.dataset.account;
      const step = parseInt(seg.dataset.step, 10);

      if (accountsData[id].meterLevel === step) {
        accountsData[id].meterLevel = 0;
        accountsData[id].isManual = false;
        accountsData[id].isRateLimited = false;
      } else {
        accountsData[id].meterLevel = step;
        accountsData[id].isManual = true;
        accountsData[id].isRateLimited = (step === 100);
      }
      saveAllData();
      updateCardValues();
    });
  });

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

function updateCardValues() {
  if (!isDataLoaded) return;

  for (let id = 1; id <= 4; id++) {
    const data = accountsData[id] || {};
    const card = document.getElementById(`card-${id}`);
    const badgeBtn = document.getElementById(`badge-${id}`);

    const isLimit = data.isRateLimited || data.meterLevel === 100;
    if (card) {
      if (isLimit) card.classList.add("rate-limited");
      else card.classList.remove("rate-limited");
    }

    if (badgeBtn) {
      if (isLimit) {
        badgeBtn.classList.add("active");
        badgeBtn.innerText = "⚠️ リミット到達中";
      } else {
        badgeBtn.classList.remove("active");
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
    if (tokenText) tokenText.innerText = `📊 ${(data.tokens || 0).toLocaleString()} tk`;

    const meterContainer = document.getElementById(`meter-${id}`);
    if (meterContainer) {
      const currentLevel = data.meterLevel || 0;
      meterContainer.querySelectorAll(".segment").forEach(seg => {
        const step = parseInt(seg.dataset.step, 10);
        seg.className = "segment";
        if (currentLevel >= step) seg.classList.add(`active-${step}`);
      });
    }
  }
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
      if (targetId === "tab4") renderChatLogs();
    });
  });

  document.querySelectorAll(".period-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".period-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      currentPeriod = e.target.dataset.period;
      const titles = { today: "本日のリソース配分グラフ (Today)", week: "今週のリソース配分グラフ (Week)", month: "今月のリソース配分グラフ (Month)" };
      document.getElementById("chartPeriodTitle").innerText = `📊 プログラム別 ${titles[currentPeriod]}`;
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
      lastId: "ID 1"
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
          lastId: old.lastId || "ID 1"
        });
      }
    });

    programsData = updated;
    saveAllData();
    setupCards();
    alert("✅ プログラムマスタを正常に保存しました！");
  });

  // API設定保存
  document.getElementById("saveApiConfigBtn").addEventListener("click", () => {
    apiConfig.githubToken = document.getElementById("githubToken").value.trim();
    apiConfig.githubRepo = document.getElementById("githubRepo").value.trim();
    apiConfig.geminiApiKey = document.getElementById("geminiApiKey").value.trim();
    apiConfig.geminiModelName = document.getElementById("geminiModelName").value.trim() || "gemini-3.5-flash-lite";

    chrome.storage.local.set({ apiConfig }, () => {
      alert("✅ GitHub & Gemini API設定を保存しました！");
    });
  });

  // ログ削除
  document.getElementById("deleteCurrentLogBtn").addEventListener("click", () => {
    if (!currentSelectedLogId) return;
    if (confirm("このセッションログを削除してもよろしいですか？")) {
      chatLogsData = chatLogsData.filter(l => l.id !== currentSelectedLogId);
      currentSelectedLogId = null;
      chrome.storage.local.set({ chatLogs: chatLogsData }, () => {
        renderChatLogs();
      });
    }
  });

  document.getElementById("clearAllLogsBtn").addEventListener("click", () => {
    if (confirm("保存されているすべてのチャットログを消去しますか？")) {
      chatLogsData = [];
      currentSelectedLogId = null;
      chrome.storage.local.set({ chatLogs: [] }, () => {
        renderChatLogs();
      });
    }
  });
}

function saveAllData() {
  chrome.storage.local.set({ accounts: accountsData, programs: programsData, chatLogs: chatLogsData, apiConfig: apiConfig });
}

// === GitHubセーブモーダル ＆ 差分比較・Gemini要約・プッシュ ===

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

  fileSelector.onchange = (e) => {
    handleSelectedFiles(e.target.files);
  };

  // モーダル内のリポジトリ入力が変更されたらapiConfigにも自動反映
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

// 差分取得 ＆ Gemini要約
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
      } else if (oldCode === f.content) {
        // 変更なし
      } else {
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

// GitHubから過去ファイル取得
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

// Gemini API呼び出し＆日本語クレンジング
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

  // 余計なJSONラベルや記号を強力にクレンジング
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

// GitHubへプッシュ実行
async function executeGitHubPush() {
  const repoInputVal = document.getElementById("modalRepoInput").value.trim();
  const commitMsg = document.getElementById("commitMessageInput").value.trim();
  const summary = document.getElementById("changeSummaryArea").value.trim();
  const banner = document.getElementById("statusBanner");

  if (!repoInputVal) {
    alert("リポジトリ名を入力してください（例: username/AIStudio-Manager）。");
    return;
  }
  if (!commitMsg) {
    alert("コミットメッセージを入力してください。");
    return;
  }
  if (loadedLocalFiles.length === 0) {
    alert("プッシュするファイルが選択されていません。");
    return;
  }

  apiConfig.githubRepo = repoInputVal;
  chrome.storage.local.set({ apiConfig });

  banner.className = "status-banner active";
  banner.innerText = "🚀 GitHubへ接続中（リポジトリ確認 ＆ コミット中）...";

  const [owner, repo] = repoInputVal.split("/");
  if (!owner || !repo) {
    alert("リポジトリ名が不正です。「ユーザー名/リポジトリ名」の形式で入力してください。");
    return;
  }

  try {
    // 1. リポジトリの存在チェック（無ければ自動作成）
    await ensureRepositoryExists(owner, repo);

    // 2. CHANGELOG.mdの自動更新
    const now = new Date();
    const changelogEntry = `\n\n## [${now.toLocaleString()}] ${commitMsg}\n\n${summary}\n`;
    let oldChangelog = await fetchOldFileFromGitHub("CHANGELOG.md") || "# プロジェクト変更履歴\n";
    const updatedChangelog = oldChangelog + changelogEntry;

    const allFilesToPush = [...loadedLocalFiles, { name: "CHANGELOG.md", content: updatedChangelog }];

    // 3. 全ファイルを一括プッシュ
    banner.innerText = `📦 ファイル群をコミット中 (全 ${allFilesToPush.length} ファイル)...`;
    for (const file of allFilesToPush) {
      await pushSingleFileToGitHub(owner, repo, file.name, file.content, commitMsg);
    }

    // 4. マネージャーの記録更新
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

// リポジトリ自動作成
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
      body: JSON.stringify({
        name: repo,
        description: "Created automatically by Studio Manager",
        auto_init: true
      })
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(`リポジトリ自動作成に失敗: ${err.message || createRes.statusText}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
}

// 1ファイルのプッシュ
async function pushSingleFileToGitHub(owner, repo, path, content, commitMessage) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  
  let sha = undefined;
  const getRes = await fetch(url, {
    headers: {
      "Authorization": `token ${apiConfig.githubToken}`,
      "Accept": "application/vnd.github.v3+json"
    }
  });

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
    headers: {
      "Authorization": `token ${apiConfig.githubToken}`,
      "Content-Type": "application/json",
      "Accept": "application/vnd.github.v3+json"
    },
    body: JSON.stringify({
      message: `${commitMessage} (${path})`,
      content: base64Content,
      sha: sha
    })
  });

  if (!putRes.ok) {
    const err = await putRes.json();
    throw new Error(`${path} のプッシュ失敗: ${err.message || putRes.statusText}`);
  }
}

// 起動時の初期化
function bootstrap() {
  initNavigation();
  initModalHandlers();
  updateCountdown();

  chrome.storage.local.get(["accounts", "programs", "chatLogs", "apiConfig"], (res) => {
    if (res.programs && res.programs.length > 0) programsData = res.programs;
    if (res.chatLogs) chatLogsData = res.chatLogs;
    if (res.apiConfig) apiConfig = Object.assign(apiConfig, res.apiConfig);
    if (res.accounts) {
      for (let i = 1; i <= 4; i++) {
        if (res.accounts[i]) {
          accountsData[i] = Object.assign(accountsData[i] || {}, res.accounts[i]);
        }
      }
    }

    isDataLoaded = true;
    setupCards();
    renderProgramDashboard();
    renderMasterSettings();

    setInterval(updateCountdown, 1000);
    setInterval(syncBackgroundStats, 2000);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      if (changes.accounts) {
        const newAccounts = changes.accounts.newValue;
        if (newAccounts) {
          for (let i = 1; i <= 4; i++) {
            if (newAccounts[i]) {
              accountsData[i].tokens = newAccounts[i].tokens;
              accountsData[i].startTime = newAccounts[i].startTime;
              accountsData[i].tabId = newAccounts[i].tabId;
              if (newAccounts[i].isRateLimited) {
                accountsData[i].isRateLimited = true;
                accountsData[i].meterLevel = 100;
              }
            }
          }
          updateCardValues();
        }
      }
      if (changes.chatLogs) {
        chatLogsData = changes.chatLogs.newValue || [];
        renderChatLogs();
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
          accountsData[i].startTime = bgAcc.startTime;
          accountsData[i].tabId = bgAcc.tabId;
          if (bgAcc.isRateLimited) {
            accountsData[i].isRateLimited = true;
            accountsData[i].meterLevel = 100;
          }
        }
      }
      updateCardValues();
    }
  });
}

bootstrap();