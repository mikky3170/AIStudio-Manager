// [v1.2.0 作業版 Rev.1] IDモニター・プログラム管理・ナレッジ要約・設定UI描画ロジックの独立分割

// === タブ1: IDモニター ＆ トークン管理 ===
function setupCards() {
  const container = document.getElementById("cardsGrid");
  container.innerHTML = "";
  const steps = [20, 40, 60, 80, 100];

  for (let id = 1; id <= 4; id++) {
    const card = document.createElement("div");
    card.className = "card";
    card.id = `card-${id}`;

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
              <span class="id-prog-ver-badge" id="idProgVerBadge-${id}">ベース: v1.0.0</span>
            </div>
            <div class="status-badge">
              <span id="time-${id}">⏱ 未開始</span>
              <span style="color: #475569;">|</span>
              <span id="token-${id}">📊 累計: 0 tk</span>
              <button type="button" class="btn-correct-tokens" data-account="${id}" title="過去チャット等で誤加算された累計トークンを手動補正・リセット">✏️</button>
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
          <div class="field-label">📝 備考・メモ / 指示プロンプト</div>
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

  document.querySelectorAll(".meter-segments").forEach(meter => {
    meter.addEventListener("click", (e) => {
      const seg = e.target.closest(".segment");
      if (!seg) return;
      const id = meter.dataset.account;
      const step = parseInt(seg.dataset.step, 10);

      if (step === 100) {
        const current = accountsData[id];
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
        chrome.storage.local.set({ accounts: accountsData });
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
      chrome.storage.local.set({ accounts: accountsData });
      updateCardValues();
      updateProgramWorkBadgesOnly();
      renderKnowledgeFilterTabs();

      chrome.runtime.sendMessage({
        type: "NOTIFY_PROGRAM_CHANGED",
        data: { accountId: parseInt(id, 10), programId: val }
      }).catch(() => {});
    });
  });

  document.querySelectorAll(".btn-correct-tokens").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.target.dataset.account, 10);
      openTokenCorrectModal(id);
    });
  });

  document.querySelectorAll(".google-id-input").forEach(el => el.addEventListener("input", e => { accountsData[e.target.dataset.account].googleId = e.target.value; chrome.storage.local.set({ accounts: accountsData }); }));
  document.querySelectorAll(".theme-input").forEach(el => el.addEventListener("input", e => { accountsData[e.target.dataset.account].theme = e.target.value; chrome.storage.local.set({ accounts: accountsData }); }));
  document.querySelectorAll(".notes-area").forEach(el => el.addEventListener("input", e => { accountsData[e.target.dataset.account].notes = e.target.value; chrome.storage.local.set({ accounts: accountsData }); }));

  document.querySelectorAll(".jump-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.target.dataset.account, 10);
      const data = accountsData[id];
      const targetUrl = `https://aistudio.google.com/u/${id - 1}/prompts/new_chat`;

      if (data && data.tabId) {
        chrome.tabs.update(data.tabId, { active: true }, tab => {
          if (chrome.runtime.lastError || !tab) {
            chrome.tabs.create({ url: targetUrl }, newTab => {
              accountsData[id].tabId = newTab.id;
              chrome.storage.local.set({ accounts: accountsData });
            });
          }
        });
      } else {
        chrome.tabs.create({ url: targetUrl }, newTab => {
          accountsData[id].tabId = newTab.id;
          chrome.storage.local.set({ accounts: accountsData });
        });
      }
    });
  });
}

function openTokenCorrectModal(accId) {
  tokenCorrectTargetId = accId;
  const currentTk = accountsData[accId]?.tokens || 0;
  document.getElementById("tokenCorrectTargetLabel").innerText = `ID ${accId} の本日の実質累計トークン数（現在: ${currentTk.toLocaleString()} tk）`;
  document.getElementById("tokenCorrectInput").value = currentTk;
  document.getElementById("tokenCorrectModalOverlay").classList.add("active");
  document.getElementById("tokenCorrectInput").focus();
}

function initTokenCorrectModalHandlers() {
  const overlay = document.getElementById("tokenCorrectModalOverlay");
  const closeBtn = document.getElementById("closeTokenCorrectModalBtn");
  const cancelBtn = document.getElementById("cancelTokenCorrectBtn");
  const saveBtn = document.getElementById("saveTokenCorrectBtn");
  const resetZeroBtn = document.getElementById("tokenCorrectResetZeroBtn");

  const closeModal = () => overlay.classList.remove("active");
  closeBtn.onclick = closeModal;
  cancelBtn.onclick = closeModal;

  resetZeroBtn.onclick = () => {
    document.getElementById("tokenCorrectInput").value = 0;
  };

  saveBtn.onclick = () => {
    if (!tokenCorrectTargetId) return;
    const val = parseInt(document.getElementById("tokenCorrectInput").value, 10) || 0;
    
    chrome.runtime.sendMessage({
      type: "MANUAL_CORRECT_TOKENS",
      data: { accountId: tokenCorrectTargetId, newTokens: val }
    }, (res) => {
      if (res && res.success) {
        accountsData[tokenCorrectTargetId].tokens = res.tokens;
        updateCardValues();
        closeModal();
      }
    });
  };
}

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
    current.statusMode = "normal";
    current.hasError = false;
    current.isRateLimited = false;
    current.meterLevel = calculateDailyMeter(current.tokens);
  }

  chrome.storage.local.set({ accounts: accountsData });
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

    const idProgVerBadge = document.getElementById(`idProgVerBadge-${id}`);
    if (idProgVerBadge) {
      if (data.currentProgramId) {
        const assignedProg = programsData.find(p => p.id === data.currentProgramId);
        if (assignedProg) {
          const isUncommitted = (!assignedProg.saveHistory || assignedProg.saveHistory.length === 0);
          idProgVerBadge.style.display = "inline-block";
          if (isUncommitted) {
            idProgVerBadge.className = "id-prog-ver-badge uncommitted";
            idProgVerBadge.innerText = "🌱 初回構築中";
          } else {
            idProgVerBadge.className = "id-prog-ver-badge";
            idProgVerBadge.innerText = `🟢 ベース: ${assignedProg.version || 'v1.0.0'}`;
          }
        } else {
          idProgVerBadge.style.display = "none";
        }
      } else {
        idProgVerBadge.style.display = "none";
      }
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

// === タブ2: プログラム管理・エンハンス ===
function renderProgramDashboard() {
  const chartList = document.getElementById("chartList");
  const progCardList = document.getElementById("progCardList");
  const descEl = document.getElementById("chartPeriodDesc");
  chartList.innerHTML = "";
  progCardList.innerHTML = "";

  cleanupAndMigrateSaveHistory();
  updateAppVersionBadge();

  if (programsData.length === 0) {
    if (descEl) descEl.innerHTML = `<span>📅 集計期間: プログラムが未登録です</span>`;
    chartList.innerHTML = `<div style="color: #94a3b8; font-size: 13px;">プログラムが登録されていません。「⚙️ 設定」タブから登録してください。</div>`;
    progCardList.innerHTML = `<div style="color: #94a3b8; font-size: 13px; text-align: center; padding: 20px;">登録されているプログラムがありません。</div>`;
    return;
  }

  const { totals, desc } = calculateAggregatedTokens();
  if (descEl) descEl.innerHTML = `<span>${escapeHtml(desc)}</span>`;

  programsData.forEach((prog) => {
    const plans = prog.enhancePlans || [];
    const notes = prog.inboxNotes || [];
    const history = prog.saveHistory || [];
    const isInitialUncommitted = (history.length === 0);
    const activeVersion = isInitialUncommitted ? "未セーブ" : (prog.version || "v1.0.0");
    const repoDisplayName = prog.githubRepo || "未設定 (セーブ時に入力可能)";
    const isWebPublish = !!prog.isWebPublish;

    const activeWorkingIds = [];
    for (let i = 1; i <= 4; i++) {
      if (accountsData[i] && accountsData[i].currentProgramId === prog.id) {
        activeWorkingIds.push(`ID ${i}`);
      }
    }

    const workBadgeHtml = activeWorkingIds.length > 0
      ? `<span class="prog-work-badge active" id="workBadge-${prog.id}">🔵 ${activeWorkingIds.join(", ")} で作業中</span>`
      : `<span class="prog-work-badge idle" id="workBadge-${prog.id}">⚪ 待機中</span>`;

    const publishBadgeHtml = isWebPublish
      ? `<span class="badge-publish-mode web" title="GitHub Pagesでブラウザ上公開・実行する設定です（index.html必須）">🌐 Web公開設定</span>`
      : `<span class="badge-publish-mode source" title="拡張機能やライブラリ等のソース保管専用です">📦 ソース保管専用</span>`;

    let cardBodyHtml = "";

    if (isInitialUncommitted) {
      cardBodyHtml = `
        <div class="initial-setup-banner">
          <div class="initial-setup-info">
            <span class="initial-setup-title">🌱 初回登録待ち（未コミットの新規プログラム）</span>
            <span class="initial-setup-desc">
              まだGitHubに登録されていません。完成したファイル群を、初回リリース（v1.0.0）としてGitHubへセーブしましょう。<br>
              プッシュ先リポジトリ: <strong style="color: #38bdf8;">${escapeHtml(prog.githubRepo || '未設定（ボタン押下後に指定できます）')}</strong>
            </span>
          </div>
          <button class="initial-setup-btn init-push-btn" data-prog-id="${prog.id}">
            🚀 初回登録（v1.0.0）としてセーブ
          </button>
        </div>
      `;
    } else {
      const activePlans = plans.filter(p => p.status !== "done");

      let plansHtml = "";
      if (activePlans.length === 0) {
        plansHtml = `<div style="font-size: 11px; color: #94a3b8; font-style: italic; padding: 6px 0;">現在ストックされている計画はありません。右上の「＋機能追加」「＋バグ修正」または下のInboxから計画を追加してください。</div>`;
      } else {
        activePlans.forEach(plan => {
          const tagType = plan.verType === "patch" ? "patch" : "minor";
          const tagText = plan.targetVer || (tagType === "patch" ? "BugFix" : "Enhance");
          const isOpen = openedPlanIds.has(plan.id);

          plansHtml += `
            <div class="enhance-item-wrapper ${isOpen ? 'open' : ''}" id="planWrapper-${plan.id}">
              <div class="enhance-item-row" data-plan-id="${plan.id}" data-prog-id="${prog.id}">
                <div class="enhance-item-info">
                  <span class="target-ver-tag ${tagType}">${escapeHtml(tagText)}</span>
                  <span class="enhance-item-title-text" title="${escapeHtml(plan.title)}">${escapeHtml(plan.title)}</span>
                  ${plan.prompt ? `<span class="enhance-badge-prompt">🤖 プロンプト済</span>` : ''}
                </div>
                <div class="enhance-item-actions">
                  <button type="button" class="btn-plan-save-row" data-prog-id="${prog.id}" data-plan-id="${plan.id}" title="完成したコードをGitHubへセーブし、この計画を完了にします">
                    🚀 セーブ
                  </button>
                  <button type="button" class="toggle-expand-btn" data-plan-id="${plan.id}">${isOpen ? '▲ 閉じる' : '▼ 編集・着手'}</button>
                  <button type="button" class="del-plan-btn" data-prog-id="${prog.id}" data-plan-id="${plan.id}" title="計画を削除">✕</button>
                </div>
              </div>

              <div class="enhance-inline-panel" id="inlinePanel-${plan.id}">
                <div class="inline-field-row">
                  <div style="width: 120px;">
                    <label class="field-label">予定Ver</label>
                    <input type="text" class="inline-input inline-ver-input" data-plan-id="${plan.id}" value="${escapeHtml(plan.targetVer || 'v1.0.0')}" style="width: 100%; color: #38bdf8; font-weight: bold;">
                  </div>
                  <div style="flex: 1;">
                    <label class="field-label">計画タイトル・修正要約</label>
                    <input type="text" class="inline-input inline-title-input" data-plan-id="${plan.id}" value="${escapeHtml(plan.title || '')}" style="width: 100%;">
                  </div>
                </div>

                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                    <label class="field-label" style="margin: 0;">🤖 AI Studio用 指示プロンプト (着手時に自動コピー)</label>
                    <button type="button" class="btn-secondary auto-prompt-inline-btn" data-prog-id="${prog.id}" data-plan-id="${plan.id}" style="padding: 2px 9px; font-size: 11px; color: #34d399; border-color: #059669; background: #064e3b;">
                      ✨ AIでブレークダウン＆プロンプト自動起草
                    </button>
                  </div>
                  <textarea class="inline-textarea inline-prompt-area" data-plan-id="${plan.id}" placeholder="AI Studioにそのまま貼り付けられる指示文。上の「✨ AIでブレークダウン」を押すと自動生成されます。">${escapeHtml(plan.prompt || '')}</textarea>
                </div>

                ${plan.aiAdvice ? `<div class="ai-advice-panel" style="margin-top: 2px;">${escapeHtml(plan.aiAdvice)}</div>` : ''}

                <div class="inline-actions-row">
                  <button type="button" class="btn-secondary manual-done-inline-btn" data-prog-id="${prog.id}" data-plan-id="${plan.id}" style="font-size: 11px; padding: 4px 8px; color: #94a3b8;">
                    （手動で完了にする）
                  </button>
                  <div class="inline-btn-group-right">
                    <button type="button" class="btn-secondary save-inline-plan-btn" data-prog-id="${prog.id}" data-plan-id="${plan.id}">💾 内容を保存</button>
                    <button type="button" class="btn-primary start-dispatch-inline-btn" data-prog-id="${prog.id}" data-plan-id="${plan.id}">▶ この計画に着手</button>
                  </div>
                </div>
              </div>
            </div>
          `;
        });
      }

      const isInboxOpen = openedInboxProgIds.has(prog.id);
      let inboxNotesHtml = "";
      if (notes.length === 0) {
        inboxNotesHtml = `<div style="font-size: 11px; color: #64748b; font-style: italic; padding: 4px 0;">まだメモはありません。使っていて気づいた点や違和感を上の窓にサッと殴り書きできます。</div>`;
      } else {
        inboxNotesHtml = notes.map(n => `
          <div class="inbox-note-item">
            <span class="inbox-note-text">${escapeHtml(n.text)}</span>
            <span class="inbox-note-date">${escapeHtml(n.dateStr || '')}</span>
            <button type="button" class="btn-del-inbox-note" data-prog-id="${prog.id}" data-note-id="${n.id}" title="メモを削除">✕</button>
          </div>
        `).join("");
      }

      const latest = history[0];
      const olderList = history.slice(1);

      let historyHtml = `
        <div class="latest-history-box">
          <div class="latest-history-header">
            <div class="latest-history-left">
              <span class="latest-ver-badge">${escapeHtml(latest.version || activeVersion)}</span>
              <span class="latest-commit-title" title="${escapeHtml(latest.commitMsg)}">${escapeHtml(latest.commitMsg)}</span>
            </div>
            <span class="latest-history-date">${escapeHtml(latest.dateStr)}</span>
          </div>
          <div style="color: #94a3b8; font-size: 11px; line-height: 1.4; white-space: pre-wrap; margin-top: 3px;">${escapeHtml(latest.summary || '変更概要なし')}</div>
        </div>
      `;

      if (olderList.length > 0) {
        historyHtml += `
          <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
            <button class="history-accordion-toggle" data-prog-id="${prog.id}">
              ▶ 過去のセーブ履歴を展開 (全 ${olderList.length} 件)
            </button>
          </div>
          <div class="older-history-container" id="olderHistory-${prog.id}">
            ${olderList.map(h => `
              <div class="older-history-item">
                <div class="older-history-header">
                  <div class="older-history-left">
                    <span style="color: #38bdf8; font-weight: bold; white-space: nowrap;">[${escapeHtml(h.version || 'v1.0.0')}]</span>
                    <span style="color: #cbd5e1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(h.commitMsg)}</span>
                  </div>
                  <span style="color: #64748b; font-size: 10.5px; white-space: nowrap;">${escapeHtml(h.dateStr)}</span>
                </div>
                <div style="white-space: pre-wrap; line-height: 1.35; color: #cbd5e1; margin-top: 2px;">${escapeHtml(h.summary || '')}</div>
              </div>
            `).join("")}
          </div>
        `;
      }

      cardBodyHtml = `
        <div class="enhance-section">
          <div class="enhance-head">
            <span>🚀 エンハンス計画（未着手 ${activePlans.length}件）</span>
            ${activePlans.length > 1 ? `<button class="ai-priority-btn" data-prog-id="${prog.id}">🤖 AI優先度チェック：どれから着手すべき？</button>` : ''}
          </div>
          <div class="enhance-list">
            ${plansHtml}
          </div>
        </div>

        <div class="inbox-section ${isInboxOpen ? 'open' : ''}" id="inboxSection-${prog.id}">
          <div class="inbox-head-accordion" data-prog-id="${prog.id}">
            <div class="inbox-head-title">
              <span>💡 気付き・備忘録メモ (Inbox / ストック: ${notes.length}件)</span>
              ${notes.length > 0 && isInboxOpen ? `
                <button type="button" class="btn-inbox-triage" data-prog-id="${prog.id}">
                  ✨ AI仕分け・整理
                </button>
              ` : ''}
            </div>
            <div class="inbox-head-actions">
              <span style="font-size: 11px; color: #38bdf8;">${isInboxOpen ? '▲ 閉じる' : '▼ 開く'}</span>
            </div>
          </div>
          
          <div class="inbox-body-collapsible">
            <div class="inbox-input-row">
              <input type="text" class="inbox-input" data-prog-id="${prog.id}" placeholder="使っていて気づいた点や違和感を殴り書き... (Enterで即追加)">
              <button type="button" class="btn-inbox-add" data-prog-id="${prog.id}">＋ メモ追加</button>
            </div>
            <div class="inbox-notes-list">
              ${inboxNotesHtml}
            </div>
          </div>
        </div>

        <div class="history-section">
          <div class="history-head">
            <span>📜 リリース実績・Change Log (稼働版: ${escapeHtml(activeVersion)})</span>
            <div class="history-head-right">
              <button class="edit-history-btn" data-prog-id="${prog.id}">📜 履歴の確認・補正</button>
            </div>
          </div>
          ${historyHtml}
        </div>

        <div class="prog-card-actions">
          <span style="font-size: 10.5px; color: #475569;">※開発は上の計画から [🚀 セーブ] を推奨</span>
          <button type="button" class="emergency-push-link emergency-save-btn" data-prog-id="${prog.id}">
            ...その他: 計画外の緊急セーブ
          </button>
        </div>
      `;
    }

    const cardEl = document.createElement("div");
    cardEl.className = "prog-manage-card";
    cardEl.id = `progCard-${prog.id}`;
    cardEl.innerHTML = `
      <div class="prog-card-header">
        <div class="prog-card-title-group">
          <span class="prog-card-title">📦 ${escapeHtml(prog.name)}</span>
          <span class="prog-version-badge ${isInitialUncommitted ? 'uncommitted' : ''}">
            ${isInitialUncommitted ? '🌱 初回登録待ち' : `🟢 稼働版: ${escapeHtml(activeVersion)}`}
          </span>
          ${publishBadgeHtml}
          ${workBadgeHtml}
        </div>
        ${!isInitialUncommitted ? `
          <div class="prog-header-actions">
            <button class="btn-quick-add minor add-quick-plan-btn" data-prog-id="${prog.id}" data-type="minor">＋ 機能追加</button>
            <button class="btn-quick-add patch add-quick-plan-btn" data-prog-id="${prog.id}" data-type="patch">＋ バグ修正</button>
          </div>
        ` : ''}
      </div>

      <div class="prog-card-files" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
        <div>📁 <strong>構成ファイル:</strong> <span style="color: #cbd5e1;">${escapeHtml(prog.files || (isInitialUncommitted ? '初回セーブ時に自動同期' : '自動同期'))}</span></div>
        <div style="font-size: 11px; color: #38bdf8;">🔗 リポジトリ: <strong style="color: #f8fafc;">${escapeHtml(repoDisplayName)}</strong></div>
      </div>

      ${cardBodyHtml}
    `;
    progCardList.appendChild(cardEl);
  });

  const maxToken = Math.max(...Object.values(totals), 1);
  const colors = ["#38bdf8", "#10b981", "#facc15", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"];

  programsData.forEach((prog, index) => {
    let tokens = totals[prog.id] || 0;
    let hours = (tokens / 250000).toFixed(1);
    let percent = Math.min(100, Math.round((tokens / maxToken) * 100));
    let color = colors[index % colors.length];

    const chartRow = document.createElement("div");
    chartRow.className = "chart-row";
    chartRow.dataset.progId = prog.id;
    chartRow.title = "クリックすると右側のこのプログラムへスクロールジャンプします";
    chartRow.innerHTML = `
      <div class="chart-meta">
        <span>📦 ${escapeHtml(prog.name)}</span>
        <span style="color: #cbd5e1;">${tokens.toLocaleString()} tk | ${hours}h</span>
      </div>
      <div class="chart-bar-bg">
        <div class="chart-bar-fill" style="width: ${percent}%; background: ${color};"></div>
      </div>
    `;

    chartRow.onclick = () => {
      const targetCard = document.getElementById(`progCard-${prog.id}`);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: "smooth", block: "start" });
        targetCard.classList.remove("jump-target-glow");
        void targetCard.offsetWidth;
        targetCard.classList.add("jump-target-glow");
      }
    };

    chartList.appendChild(chartRow);
  });

  const unassignedTokens = totals["prog_unassigned"] || 0;
  if (unassignedTokens > 0) {
    let uHours = (unassignedTokens / 250000).toFixed(1);
    let uPercent = Math.min(100, Math.round((unassignedTokens / maxToken) * 100));

    const uRow = document.createElement("div");
    uRow.className = "chart-row";
    uRow.style.cursor = "default";
    uRow.innerHTML = `
      <div class="chart-meta">
        <span style="color: #94a3b8;">📦 未分類タスク（検証）</span>
        <span style="color: #cbd5e1;">${unassignedTokens.toLocaleString()} tk | ${uHours}h</span>
      </div>
      <div class="chart-bar-bg">
        <div class="chart-bar-fill" style="width: ${uPercent}%; background: #64748b;"></div>
      </div>
    `;
    chartList.appendChild(uRow);
  }

  attachEnhanceEvents();
  attachInboxEvents();

  document.querySelectorAll(".history-accordion-toggle").forEach(btn => {
    btn.onclick = (e) => {
      const pid = e.target.dataset.progId;
      const targetContainer = document.getElementById(`olderHistory-${pid}`);
      if (targetContainer) {
        targetContainer.classList.toggle("open");
        const isOpen = targetContainer.classList.contains("open");
        btn.innerText = isOpen 
          ? `▼ 過去のセーブ履歴を閉じる` 
          : `▶ 過去のセーブ履歴を展開 (全 ${targetContainer.children.length} 件)`;
      }
    };
  });

  document.querySelectorAll(".init-push-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const pid = e.target.closest("button").dataset.progId;
      currentTargetProg = programsData.find(p => p.id === pid);
      currentTargetPlan = null;
      openSaveModal(currentTargetProg, null);
    });
  });

  document.querySelectorAll(".emergency-save-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const pid = e.target.closest("button").dataset.progId;
      currentTargetProg = programsData.find(p => p.id === pid);
      currentTargetPlan = null;
      openSaveModal(currentTargetProg, null);
    });
  });

  document.querySelectorAll(".edit-history-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const pid = e.target.closest("button").dataset.progId;
      const target = programsData.find(p => p.id === pid);
      openEditHistoryModal(target);
    });
  });
}

function updateProgramWorkBadgesOnly() {
  programsData.forEach(prog => {
    const badgeEl = document.getElementById(`workBadge-${prog.id}`);
    if (!badgeEl) return;

    const activeWorkingIds = [];
    for (let i = 1; i <= 4; i++) {
      if (accountsData[i] && accountsData[i].currentProgramId === prog.id) {
        activeWorkingIds.push(`ID ${i}`);
      }
    }

    if (activeWorkingIds.length > 0) {
      badgeEl.className = "prog-work-badge active";
      badgeEl.innerText = `🔵 ${activeWorkingIds.join(", ")} で作業中`;
    } else {
      badgeEl.className = "prog-work-badge idle";
      badgeEl.innerText = "⚪ 待機中";
    }
  });
}

function attachInboxEvents() {
  document.querySelectorAll(".inbox-head-accordion").forEach(header => {
    header.onclick = (e) => {
      if (e.target.closest(".btn-inbox-triage")) return;
      const pid = header.dataset.progId;
      const section = document.getElementById(`inboxSection-${pid}`);
      if (section) {
        section.classList.toggle("open");
        const isOpen = section.classList.contains("open");
        if (isOpen) {
          openedInboxProgIds.add(pid);
        } else {
          openedInboxProgIds.delete(pid);
        }
        renderProgramDashboard();
      }
    };
  });

  document.querySelectorAll(".btn-inbox-add").forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.progId;
      const input = document.querySelector(`.inbox-input[data-prog-id="${pid}"]`);
      addInboxNote(pid, input?.value);
    };
  });

  document.querySelectorAll(".inbox-input").forEach(input => {
    input.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const pid = input.dataset.progId;
        addInboxNote(pid, input.value);
      }
    };
  });

  document.querySelectorAll(".btn-del-inbox-note").forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.progId;
      const nid = btn.dataset.noteId;
      const prog = programsData.find(p => p.id === pid);
      if (prog && prog.inboxNotes) {
        prog.inboxNotes = prog.inboxNotes.filter(n => n.id !== nid);
        chrome.storage.local.set({ programs: programsData });
        renderProgramDashboard();
      }
    };
  });

  document.querySelectorAll(".btn-inbox-triage").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const pid = btn.dataset.progId;
      const prog = programsData.find(p => p.id === pid);
      openTriageModal(prog);
    };
  });
}

function addInboxNote(progId, text) {
  const clean = (text || "").trim();
  if (!clean) return;

  const prog = programsData.find(p => p.id === progId);
  if (!prog) return;

  if (!prog.inboxNotes) prog.inboxNotes = [];

  const now = new Date();
  const dateFormatted = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

  prog.inboxNotes.unshift({
    id: `note_${Date.now()}`,
    text: clean,
    createdAt: Date.now(),
    dateStr: dateFormatted
  });

  chrome.storage.local.set({ programs: programsData });
  renderProgramDashboard();
}

function attachEnhanceEvents() {
  document.querySelectorAll(".add-quick-plan-btn").forEach(btn => {
    btn.onclick = (e) => {
      const pid = e.target.dataset.progId;
      const verType = e.target.dataset.type || "minor";
      currentTargetProg = programsData.find(p => p.id === pid);
      openQuickPlanModal(currentTargetProg, verType);
    };
  });

  document.querySelectorAll(".btn-plan-save-row").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const pid = btn.dataset.progId;
      const planId = btn.dataset.planId;
      currentTargetProg = programsData.find(p => p.id === pid);
      currentTargetPlan = (currentTargetProg?.enhancePlans || []).find(p => p.id === planId) || null;
      openSaveModal(currentTargetProg, currentTargetPlan);
    };
  });

  document.querySelectorAll(".enhance-item-row").forEach(row => {
    row.onclick = (e) => {
      if (e.target.closest(".btn-plan-save-row") || e.target.closest(".del-plan-btn")) return;
      const planId = row.dataset.planId;
      const wrapper = document.getElementById(`planWrapper-${planId}`);
      if (wrapper) {
        wrapper.classList.toggle("open");
        const isOpen = wrapper.classList.contains("open");
        
        if (isOpen) {
          openedPlanIds.add(planId);
        } else {
          openedPlanIds.delete(planId);
        }

        const toggleBtn = wrapper.querySelector(".toggle-expand-btn");
        if (toggleBtn) {
          toggleBtn.innerText = isOpen ? "▲ 閉じる" : "▼ 編集・着手";
        }
      }
    };
  });

  document.querySelectorAll(".auto-prompt-inline-btn").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const pid = btn.dataset.progId;
      const planId = btn.dataset.planId;
      const titleInput = document.querySelector(`.inline-title-input[data-plan-id="${planId}"]`);
      const promptArea = document.querySelector(`.inline-prompt-area[data-plan-id="${planId}"]`);
      const title = titleInput?.value.trim() || "";

      if (!title) {
        alert("計画タイトルを入力してください。");
        return;
      }
      if (!apiConfig.geminiApiKey) {
        alert("Gemini APIキーが設定されていません。「⚙️ 設定」タブで設定してください。");
        return;
      }

      btn.disabled = true;
      btn.innerText = "⏳ AI起草中...";

      try {
        const aiResult = await generateBreakdownPromptWithAI(title);
        if (promptArea) promptArea.value = aiResult.prompt;
        
        const prog = programsData.find(p => p.id === pid);
        const plan = (prog?.enhancePlans || []).find(p => p.id === planId);
        if (plan) {
          plan.prompt = aiResult.prompt;
          plan.aiAdvice = aiResult.advice;
          chrome.storage.local.set({ programs: programsData });
          renderProgramDashboard();
        }
      } catch (err) {
        alert(`⚠️ AI起草エラー: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.innerText = "✨ AIでブレークダウン＆プロンプト自動起草";
      }
    };
  });

  document.querySelectorAll(".save-inline-plan-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const pid = btn.dataset.progId;
      const planId = btn.dataset.planId;
      const titleInput = document.querySelector(`.inline-title-input[data-plan-id="${planId}"]`);
      const verInput = document.querySelector(`.inline-ver-input[data-plan-id="${planId}"]`);
      const promptArea = document.querySelector(`.inline-prompt-area[data-plan-id="${planId}"]`);

      const prog = programsData.find(p => p.id === pid);
      const plan = (prog?.enhancePlans || []).find(p => p.id === planId);
      if (plan) {
        plan.title = titleInput?.value.trim() || plan.title;
        plan.targetVer = verInput?.value.trim() || plan.targetVer;
        plan.prompt = promptArea?.value.trim() || "";
        chrome.storage.local.set({ programs: programsData });
        renderProgramDashboard();
        alert("✅ 計画の変更を保存しました！");
      }
    };
  });

  document.querySelectorAll(".manual-done-inline-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const pid = btn.dataset.progId;
      const planId = btn.dataset.planId;
      const prog = programsData.find(p => p.id === pid);
      const plan = (prog?.enhancePlans || []).find(p => p.id === planId);
      if (plan && confirm(`この計画「${plan.title}」を手動で完了（卒業）にしますか？\n（未着手一覧から非表示になります）`)) {
        plan.status = "done";
        openedPlanIds.delete(planId);
        chrome.storage.local.set({ programs: programsData });
        renderProgramDashboard();
      }
    };
  });

  document.querySelectorAll(".start-dispatch-inline-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const pid = btn.dataset.progId;
      const planId = btn.dataset.planId;
      const titleInput = document.querySelector(`.inline-title-input[data-plan-id="${planId}"]`);
      const verInput = document.querySelector(`.inline-ver-input[data-plan-id="${planId}"]`);
      const promptArea = document.querySelector(`.inline-prompt-area[data-plan-id="${planId}"]`);

      currentTargetProg = programsData.find(p => p.id === pid);
      currentTargetPlan = (currentTargetProg?.enhancePlans || []).find(p => p.id === planId);

      if (currentTargetPlan) {
        currentTargetPlan.title = titleInput?.value.trim() || currentTargetPlan.title;
        currentTargetPlan.targetVer = verInput?.value.trim() || currentTargetPlan.targetVer;
        currentTargetPlan.prompt = promptArea?.value.trim() || "";
        chrome.storage.local.set({ programs: programsData });
        openDispatchModal(currentTargetProg, currentTargetPlan);
      }
    };
  });

  document.querySelectorAll(".ai-priority-btn").forEach(btn => {
    btn.onclick = (e) => {
      const pid = e.target.dataset.progId;
      currentTargetProg = programsData.find(p => p.id === pid);
      openPriorityModal(currentTargetProg);
    };
  });

  document.querySelectorAll(".del-plan-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const pid = e.target.dataset.progId;
      const planId = e.target.dataset.planId;
      const prog = programsData.find(p => p.id === pid);
      if (prog && prog.enhancePlans && confirm("この計画を削除してもよろしいですか？")) {
        openedPlanIds.delete(planId);
        prog.enhancePlans = prog.enhancePlans.filter(p => p.id !== planId);
        chrome.storage.local.set({ programs: programsData });
        renderProgramDashboard();
      }
    };
  });
}

function openQuickPlanModal(prog, verType = "minor") {
  if (!prog) return;
  currentPlanVerType = verType;
  const currentVer = prog.version || "v1.0.0";
  const nextVer = calculateNextVersion(currentVer, verType);

  const typeLabel = verType === "patch" ? "🐛 バグ修正 (Patch)" : "🚀 機能追加 (Minor)";
  document.getElementById("quickPlanModalTitle").innerText = `【${prog.name}】に計画を追加 (${typeLabel})`;
  document.getElementById("quickPlanTargetVerInput").value = nextVer;
  document.getElementById("quickPlanTitleInput").value = "";

  document.getElementById("quickPlanModalOverlay").classList.add("active");
  document.getElementById("quickPlanTitleInput").focus();
}

async function openPriorityModal(prog) {
  if (!prog) return;
  currentTargetProg = prog;

  const plans = (prog.enhancePlans || []).filter(p => p.status !== "done");
  if (plans.length <= 1) {
    alert("着手待ちの計画が複数ある場合に診断を実行できます。");
    return;
  }

  document.getElementById("priorityModalTitle").innerText = `🤖 【${prog.name}】 AI着手優先度チェック（全 ${plans.length} 件）`;
  const loadingBanner = document.getElementById("priorityLoadingBanner");
  const resultContent = document.getElementById("priorityResultContent");

  loadingBanner.style.display = "block";
  resultContent.innerText = "";
  document.getElementById("priorityModalOverlay").classList.add("active");

  try {
    const advice = await checkPlansPriorityWithAI(prog, plans);
    loadingBanner.style.display = "none";
    resultContent.innerText = advice;
  } catch (err) {
    loadingBanner.style.display = "none";
    resultContent.innerText = `⚠️ 優先度診断エラー: ${err.message}`;
  }
}

async function checkPlansPriorityWithAI(prog, plans) {
  if (!apiConfig.geminiApiKey) {
    throw new Error("Gemini APIキーが設定されていません。「⚙️ 設定」タブでAPIキーを設定してください。");
  }

  const model = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiConfig.geminiApiKey}`;
  const fullSourceCode = await loadFullExtensionSourceCode();

  const plansListText = plans.map((p, idx) => `[計画 ${idx + 1}] [${p.targetVer || '次期版'}] ${p.title} (種別: ${p.verType === 'patch' ? 'バグ修正' : '機能追加'})`).join("\n");

  const prompt = `あなたはプロのシニアテックリード兼プロジェクトマネージャーです。
現在開発中のプログラム「${prog.name}」において、以下の複数のエンハンス計画（未着手）がストックされています。
現在稼働している全ソースコードを熟読した上で、手戻りが最も少なく、依存関係や安全性を考慮した「おすすめの着手順序」をプロの視点で助言してください。

【ストックされている計画一覧】
${plansListText}

【厳格な指示】
HTMLタグやMarkdown装飾記号は一切使わず、以下のフォーマットで簡潔に出力してください。

■ 💡 推奨着手順序:
1. 【最優先】[計画番号] 理由
2. 【第2順位】[計画番号] 理由
...

■ ⚠️ 同時改修時の注意点（コンフリクトやデグレードを避けるための要点 2〜3行）

【現在稼働中のStudioマネージャー 全ソースコード一式】
${fullSourceCode}
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "診断結果を取得できませんでした。";
}

async function openTriageModal(prog) {
  if (!prog) return;
  currentTargetProg = prog;

  const notes = prog.inboxNotes || [];
  if (notes.length === 0) {
    alert("仕分け対象のメモがありません。まずは気になる点を殴り書き入力してください。");
    return;
  }

  const overlay = document.getElementById("triageModalOverlay");
  const loadingBanner = document.getElementById("triageLoadingBanner");
  const introEl = document.getElementById("triageResultIntro");
  const container = document.getElementById("triageSuggestionsContainer");
  const applyBtn = document.getElementById("applyTriageBtn");

  document.getElementById("triageModalTitle").innerText = `✨ 【${prog.name}】 AIアイデア交通整理（メモ ${notes.length} 件）`;
  loadingBanner.style.display = "block";
  introEl.style.display = "none";
  applyBtn.style.display = "none";
  container.innerHTML = "";
  overlay.classList.add("active");

  try {
    currentTriageData = await runAiTriage(prog, notes);
    renderTriageSuggestions(currentTriageData);
    loadingBanner.style.display = "none";
    introEl.style.display = "block";
    applyBtn.style.display = "inline-block";
  } catch (err) {
    loadingBanner.style.display = "none";
    container.innerHTML = `<div style="color: #ef4444; padding: 20px;">⚠️ 仕分け推論エラー: ${err.message}</div>`;
  }
}

async function runAiTriage(prog, notes) {
  if (!apiConfig.geminiApiKey) {
    throw new Error("Gemini APIキーが設定されていません。「⚙️ 設定」タブで設定してください。");
  }

  const model = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiConfig.geminiApiKey}`;

  const currentVer = prog.version || "v1.0.0";
  const nextMinor = calculateNextVersion(currentVer, "minor");
  const nextPatch = calculateNextVersion(currentVer, "patch");

  const existingPlansText = (prog.enhancePlans || []).map(p => `[計画ID:${p.id}] [${p.targetVer}] ${p.title}`).join("\n") || "登録計画なし";
  const notesText = notes.map(n => `[メモID:${n.id}] ${n.text}`).join("\n");

  const prompt = `あなたはプロのシニアテックリード兼プロジェクトマネージャーです。
開発者が殴り書きした【気付き・改善メモ】を、現在登録されている【既存のエンハンス計画】と照合し、
① 既存計画との重複検知（マージ統合提案）
② 小分け vs まとめ（パッケージ化）の新規計画提案
を安全に仕分けてください。

【プログラム名】: ${prog.name}
【現在の稼働バージョン】: ${currentVer}（次期マイナー: ${nextMinor}, 次期パッチ: ${nextPatch}）

【既存のエンハンス計画一覧】
${existingPlansText}

【殴り書きメモ一覧】
${notesText}

【厳格な指示】
必ず以下のJSONフォーマットのみをプレーンテキストで出力してください（Markdownの\`\`\`json記号は含めないでください）。

{
  "suggestions": [
    {
      "action": "merge",
      "targetPlanId": "既存計画ID",
      "noteId": "メモID",
      "reason": "なぜこの既存計画に統合すべきか（理由）",
      "appendToPlan": "計画に追記する要件ドラフト"
    },
    {
      "action": "create",
      "verType": "minor" または "patch",
      "targetVer": "${nextMinor}" または "${nextPatch}",
      "title": "整理された新しい計画タイトル",
      "noteIds": ["メモID1", "メモID2"],
      "costEstimate": "高コスパ(15分)" または "中コスパ(40分)" または "大規模(2時間)",
      "reason": "なぜまとめるか（または小分けにするか）の理由",
      "promptDraft": "AI Studio用の指示プロンプトドラフト"
    }
  ]
}
`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1 }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(rawText);
  } catch (e) {
    console.warn("JSON解析失敗、生テキストから復元試行:", rawText);
    throw new Error("AIの応答を仕分けデータに変換できませんでした。もう一度お試しください。");
  }
}

function renderTriageSuggestions(triageData) {
  const container = document.getElementById("triageSuggestionsContainer");
  container.innerHTML = "";

  const suggestions = triageData?.suggestions || [];
  if (suggestions.length === 0) {
    container.innerHTML = `<div style="color: #94a3b8; text-align: center; padding: 20px;">仕分け対象が見つかりませんでした。</div>`;
    return;
  }

  suggestions.forEach((sug, idx) => {
    const card = document.createElement("div");
    card.className = `triage-item-card ${sug.action === 'merge' ? 'merge' : 'create'}`;

    if (sug.action === "merge") {
      const matchPlan = (currentTargetProg?.enhancePlans || []).find(p => p.id === sug.targetPlanId);
      const planTitle = matchPlan ? `[${matchPlan.targetVer}] ${matchPlan.title}` : "既存計画";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" class="triage-check" data-index="${idx}" checked style="cursor: pointer; transform: scale(1.15);">
            <span class="badge-triage merge">🔗 既存計画へ統合（マージ）</span>
            <strong style="color: #38bdf8; font-size: 12px;">対象: ${escapeHtml(planTitle)}</strong>
          </div>
        </div>
        <div style="font-size: 11.5px; color: #cbd5e1; line-height: 1.45;">💡 <strong>理由:</strong> ${escapeHtml(sug.reason)}</div>
        <div style="font-size: 11px; background: #0f172a; padding: 6px 10px; border-radius: 4px; color: #93c5fd;">
          📝 <strong>追記内容:</strong> ${escapeHtml(sug.appendToPlan)}
        </div>
      `;
    } else {
      const isPatch = sug.verType === "patch";
      const badgeText = isPatch ? "🐛 まとめてバグ修正" : "🚀 新規機能追加";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" class="triage-check" data-index="${idx}" checked style="cursor: pointer; transform: scale(1.15);">
            <span class="badge-triage create">${badgeText}</span>
            <strong style="color: #f8fafc; font-size: 12px;">[${escapeHtml(sug.targetVer)}] ${escapeHtml(sug.title)}</strong>
          </div>
          <span class="badge-cost">⏱️ ${escapeHtml(sug.costEstimate || '工数小')}</span>
        </div>
        <div style="font-size: 11.5px; color: #cbd5e1; line-height: 1.45;">💡 <strong>推奨方針:</strong> ${escapeHtml(sug.reason)}</div>
        ${sug.promptDraft ? `
          <div style="font-size: 11px; background: #0f172a; padding: 6px 10px; border-radius: 4px; color: #a7f3d0; max-height: 60px; overflow-y: auto;">
            🤖 <strong>プロンプト案:</strong> ${escapeHtml(sug.promptDraft)}
          </div>
        ` : ''}
      `;
    }

    container.appendChild(card);
  });
}

function initTriageModalHandlers() {
  const overlay = document.getElementById("triageModalOverlay");
  const closeBtn = document.getElementById("closeTriageModalBtn");
  const cancelBtn = document.getElementById("cancelTriageBtn");
  const applyBtn = document.getElementById("applyTriageBtn");

  const closeModal = () => overlay.classList.remove("active");
  closeBtn.onclick = closeModal;
  cancelBtn.onclick = closeModal;

  applyBtn.onclick = () => {
    if (!currentTargetProg || !currentTriageData) return;

    const checkboxes = document.querySelectorAll(".triage-check");
    const digestedNoteIds = new Set();

    checkboxes.forEach(cb => {
      if (!cb.checked) return;
      const idx = parseInt(cb.dataset.index, 10);
      const sug = currentTriageData.suggestions[idx];
      if (!sug) return;

      if (sug.action === "merge") {
        const plan = (currentTargetProg.enhancePlans || []).find(p => p.id === sug.targetPlanId);
        if (plan) {
          plan.prompt = plan.prompt ? `${plan.prompt}\n\n【追加要件】:\n${sug.appendToPlan}` : sug.appendToPlan;
          if (sug.noteId) digestedNoteIds.add(sug.noteId);
        }
      } else if (sug.action === "create") {
        if (!currentTargetProg.enhancePlans) currentTargetProg.enhancePlans = [];
        currentTargetProg.enhancePlans.unshift({
          id: `plan_${Date.now()}_${idx}`,
          targetVer: sug.targetVer,
          verType: sug.verType || "minor",
          title: sug.title,
          prompt: sug.promptDraft || "",
          aiAdvice: `【工数目安】: ${sug.costEstimate || '中'}\n【仕分け理由】: ${sug.reason}`,
          status: "todo",
          createdAt: Date.now()
        });
        (sug.noteIds || []).forEach(nid => digestedNoteIds.add(nid));
      }
    });

    if (currentTargetProg.inboxNotes) {
      currentTargetProg.inboxNotes = currentTargetProg.inboxNotes.filter(n => !digestedNoteIds.has(n.id));
    }

    chrome.storage.local.set({ programs: programsData });
    renderProgramDashboard();
    closeModal();
    alert(`✅ AI仕分け内容を正式なエンハンス計画へ反映しました！\n（消化されたメモはInboxから整理されました）`);
  };
}

function openDispatchModal(prog, plan) {
  if (!prog || !plan) return;
  document.getElementById("dispatchPlanSummary").innerText = `📌 対象: 【${prog.name}】\n🏷️ 予定: [${plan.targetVer || '次期版'}] ${plan.title}`;
  document.getElementById("dispatchModalOverlay").classList.add("active");
}

function initEnhanceModalHandlers() {
  const quickOverlay = document.getElementById("quickPlanModalOverlay");
  const closeQuickBtn = document.getElementById("closeQuickPlanModalBtn");
  const cancelQuickBtn = document.getElementById("cancelQuickPlanModalBtn");
  const saveQuickBtn = document.getElementById("saveQuickPlanBtn");

  closeQuickBtn.onclick = () => quickOverlay.classList.remove("active");
  cancelQuickBtn.onclick = () => quickOverlay.classList.remove("active");

  saveQuickBtn.onclick = () => {
    const targetVer = document.getElementById("quickPlanTargetVerInput").value.trim() || "v1.0.0";
    const title = document.getElementById("quickPlanTitleInput").value.trim();

    if (!title) {
      alert("やりたいこと・キーワードを入力してください。");
      return;
    }

    if (currentTargetProg) {
      if (!currentTargetProg.enhancePlans) currentTargetProg.enhancePlans = [];
      currentTargetProg.enhancePlans.unshift({
        id: `plan_${Date.now()}`,
        targetVer: targetVer,
        verType: currentPlanVerType,
        title: title,
        prompt: "",
        aiAdvice: "",
        status: "todo",
        createdAt: Date.now()
      });
      chrome.storage.local.set({ programs: programsData });
      renderProgramDashboard();
      quickOverlay.classList.remove("active");
    }
  };

  const priorityOverlay = document.getElementById("priorityModalOverlay");
  const closePriorityBtn = document.getElementById("closePriorityModalBtn");
  const closePriorityResultBtn = document.getElementById("closePriorityResultBtn");
  closePriorityBtn.onclick = () => priorityOverlay.classList.remove("active");
  closePriorityResultBtn.onclick = () => priorityOverlay.classList.remove("active");

  const dispatchOverlay = document.getElementById("dispatchModalOverlay");
  const closeDispatchBtn = document.getElementById("closeDispatchModalBtn");
  closeDispatchBtn.onclick = () => dispatchOverlay.classList.remove("active");

  document.querySelectorAll(".dispatch-pick-btn").forEach(btn => {
    btn.onclick = (e) => {
      const accId = e.target.dataset.account;
      if (!currentTargetProg || !currentTargetPlan) return;

      accountsData[accId].currentProgramId = currentTargetProg.id;
      accountsData[accId].theme = `[${currentTargetPlan.targetVer || '次期版'}] ${currentTargetPlan.title}`;
      if (currentTargetPlan.prompt) {
        accountsData[accId].notes = currentTargetPlan.prompt;
      }

      const textToCopy = currentTargetPlan.prompt || `■ 実装計画: [${currentTargetPlan.targetVer || '次期版'}] ${currentTargetPlan.title}\nこの機能の開発を開始してください。`;
      navigator.clipboard.writeText(textToCopy).then(() => {
        dispatchOverlay.classList.remove("active");
        openedPlanIds.delete(currentTargetPlan.id);
        chrome.storage.local.set({ accounts: accountsData, programs: programsData });
        updateCardValues();
        updateProgramWorkBadgesOnly();
        renderProgramDashboard();

        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        document.querySelector('.tab-btn[data-tab="tab1"]').classList.add("active");
        document.getElementById("tab1").classList.add("active");

        alert(`✅ 【ID ${accId}】に「${currentTargetPlan.title}」をセットしました！\n\nAI Studio用の指示プロンプトをクリップボードにコピー済みです。\nそのままID ${accId} の「このタブを開く」を押して、AI Studioに貼り付け（Ctrl+V）して開発を開始してください！`);
      });
    };
  });
}

async function generateBreakdownPromptWithAI(planTitle) {
  const model = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiConfig.geminiApiKey}`;
  const fullSourceCode = await loadFullExtensionSourceCode();

  const prompt = `あなたはプロのシニアソフトウェアエンジニア兼テックリードです。
ユーザーがキーワードとして入力した【計画タイトル】について、現在稼働している全ソースコードを熟読した上で、
①「AI Studioにそのまま貼り付けて一発で開発を開始できる高品質な指示プロンプト」
②「難易度と改修方針のアドバイス」
の2点を作成してください。

【計画タイトル】: ${planTitle}

【厳格な指示】
以下の「=== PROMPT ===」と「=== ADVICE ===」のセパレーターで区切ってプレーンテキストで出力してください。

=== PROMPT ===
あなたはプロのエンジニアです。
以下の仕様に基づき、改修コードを出力してください。

【改修の目的】: ...
【具体的な改修要件】:
1. ...
2. ...
【厳格ルール】: 既存の正常に動作している仕様・ロジックを勝手に削除・省略せず、指示箇所のみを確実に変更すること。全コードを出力すること。
=== ADVICE ===
■ 難易度判定: ★☆☆（低）〜 ★★★（高）/ 想定時間
■ 改修対象ファイル・箇所: ...
■ ⚠️ 注意点・デグレード防止: ...

【現在稼働中のStudioマネージャー 全ソースコード一式】
${fullSourceCode}
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  const parts = text.split("=== ADVICE ===");
  const promptPart = parts[0]?.replace("=== PROMPT ===", "").trim() || text;
  const advicePart = parts[1]?.trim() || "診断アドバイス完了";

  return { prompt: promptPart, advice: advicePart };
}

function openEditHistoryModal(prog) {
  if (!prog) return;
  currentTargetProg = prog;
  document.getElementById("editHistoryModalTitle").innerText = `📜 【${prog.name}】 GitHubセーブ履歴の確認・バージョン補正`;
  const bodyEl = document.getElementById("editHistoryModalBody");
  bodyEl.innerHTML = "";

  const history = prog.saveHistory || [];

  if (history.length === 0) {
    bodyEl.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 30px;">セーブ履歴がまだありません。</div>`;
  } else {
    history.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "history-card-item";
      card.innerHTML = `
        <div class="history-item-top">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="history-badge-num">第${history.length - index}回</span>
            <label style="font-size: 11.5px; color: #94a3b8;">バージョン:</label>
            <input type="text" class="commit-input history-ver-edit" data-index="${index}" value="${escapeHtml(item.version || 'v1.0.0')}" style="width: 90px; padding: 2px 6px; font-size: 11.5px; color: #38bdf8; font-weight: bold;">
          </div>
          <span class="history-item-date">${escapeHtml(item.dateStr || '')}</span>
        </div>
        <div style="font-size: 12px; font-weight: bold; color: #f8fafc;">${escapeHtml(item.commitMsg || '')}</div>
        <div class="history-summary-body" style="font-size: 11.5px;">${escapeHtml(item.summary || '')}</div>
      `;
      bodyEl.appendChild(card);
    });
  }

  document.getElementById("editHistoryModalOverlay").classList.add("active");
}

function initHistoryModalHandlers() {
  const overlay = document.getElementById("editHistoryModalOverlay");
  const closeBtn = document.getElementById("closeEditHistoryModalBtn");
  const cancelBtn = document.getElementById("cancelEditHistoryBtn");
  const saveBtn = document.getElementById("saveEditedHistoryBtn");

  closeBtn.onclick = () => overlay.classList.remove("active");
  cancelBtn.onclick = () => overlay.classList.remove("active");

  saveBtn.onclick = () => {
    if (!currentTargetProg || !currentTargetProg.saveHistory) return;
    const inputs = document.querySelectorAll(".history-ver-edit");
    inputs.forEach(input => {
      const idx = parseInt(input.dataset.index, 10);
      const val = input.value.trim();
      if (currentTargetProg.saveHistory[idx]) {
        currentTargetProg.saveHistory[idx].version = val;
      }
    });

    if (currentTargetProg.saveHistory.length > 0) {
      currentTargetProg.version = currentTargetProg.saveHistory[0].version || "v1.0.0";
    }

    chrome.storage.local.set({ programs: programsData });
    renderProgramDashboard();
    overlay.classList.remove("active");
    alert("✅ 過去のバージョン情報を正常に補正・保存しました！");
  };
}

// === タブ4: 🧠 開発ナレッジ要約 ===
function renderKnowledgeFilterTabs() {
  const container = document.getElementById("knowledgeFilterTabs");
  if (!container) return;

  const totalCount = knowledgeLogsData.length;
  const countMap = {};
  programsData.forEach(p => countMap[p.id] = 0);
  knowledgeLogsData.forEach(l => {
    if (l.programId && countMap[l.programId] !== undefined) {
      countMap[l.programId]++;
    }
  });

  let html = `
    <button class="filter-pill-btn ${selectedKnowledgeFilter === 'ALL' ? 'active' : ''}" data-prog="ALL">
      <span>すべて</span>
      <span class="filter-count-badge">${totalCount}</span>
    </button>
  `;
  
  programsData.forEach(p => {
    const pCount = countMap[p.id] || 0;
    html += `
      <button class="filter-pill-btn ${selectedKnowledgeFilter === p.id ? 'active' : ''}" data-prog="${p.id}">
        <span>📦 ${escapeHtml(p.name)}</span>
        <span class="filter-count-badge">${pCount}</span>
      </button>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll(".filter-pill-btn").forEach(btn => {
    btn.onclick = (e) => {
      const target = e.target.closest(".filter-pill-btn");
      if (!target) return;
      selectedKnowledgeFilter = target.dataset.prog;
      renderKnowledgeFilterTabs();
      renderKnowledgeList();
    };
  });
}

function highlightSearchText(text, query) {
  if (!text) return "";
  const escaped = escapeHtml(text);
  if (!query) return escaped;

  const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${safeQuery})`, 'gi');
  return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
}

function renderFormattedSummaryBoxes(rawText, query = "") {
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
          <strong style="color: #38bdf8;">🎯 セッションの目的:</strong> ${highlightSearchText(purposeText, query)}
        </div>
      ` : ''}
      <div class="knowledge-split-grid">
        <div class="knowledge-section-box">
          <div class="section-box-header">🛠️ 主な決定事項・コード改修</div>
          <div class="section-box-content">${highlightSearchText(decisionText || '特に記録なし', query)}</div>
        </div>
        <div class="knowledge-section-box">
          <div class="section-box-header">💡 得られたノウハウ・知見・重要キーワード</div>
          <div class="section-box-content">${highlightSearchText(knowhowText || '特に記録なし', query)}</div>
        </div>
      </div>
    `;
  }

  return `<div class="knowledge-purpose-box" style="white-space: pre-wrap;">${highlightSearchText(rawText, query)}</div>`;
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
    const textAll = `${log.title} ${log.programName} ${log.summary} ${log.baseVersion || ''} ${log.chatDate || ''}`.toLowerCase();
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

    const bVer = log.baseVersion || "";
    let bVerClass = "badge-base-version";
    let bVerLabel = "🏷️ Ver未設定 ▼";

    if (bVer === "🌱 初回構築中") {
      bVerClass = "badge-base-version uncommitted";
      bVerLabel = "🌱 初回構築中 ▼";
    } else if (bVer) {
      bVerClass = "badge-base-version";
      bVerLabel = `🟢 ベース: ${escapeHtml(bVer)} ▼`;
    } else {
      bVerClass = "badge-base-version unset";
      bVerLabel = "🏷️ Ver未設定 ▼";
    }

    card.innerHTML = `
      <div class="knowledge-header">
        <div class="knowledge-title-group">
          ${phaseBadgeHtml}
          <button type="button" class="badge-prog prog-change-btn" data-log-id="${log.id}" title="クリックしてこのチャットの所属プログラムを変更" style="cursor: pointer; background: #0c213b; border: 1px solid #0284c7; color: #38bdf8; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
            📦 ${escapeHtml(log.programName || '未分類')} ▼
          </button>
          <button type="button" class="${bVerClass} base-ver-btn" data-log-id="${log.id}" title="クリックしてこのチャットのベースバージョンを変更">${bVerLabel}</button>
          <span class="badge-id">ID ${log.accountId}</span>
          <span class="knowledge-title">${highlightSearchText(log.title, query)}</span>
          <span class="knowledge-dates">${dateText}</span>
        </div>
        <div class="knowledge-actions">
          <button class="order-btn" data-action="up" data-index="${origIdx}" title="上へ移動（最新側へ）">▲ 上へ</button>
          <button class="order-btn" data-action="down" data-index="${origIdx}" title="下へ移動（過去側へ）">▼ 下へ</button>
          <button class="copy-prompt-btn" data-id="${log.id}">📋 引継ぎプロンプトをコピー</button>
          <a class="jump-chat-btn" href="${escapeHtml(log.url)}" target="_blank">🔗 AI Studioを開く</a>
          <button class="del-card-btn" data-id="${log.id}">削除</button>
        </div>
      </div>
      ${renderFormattedSummaryBoxes(log.summary, query)}
    `;

    const progBtn = card.querySelector(".prog-change-btn");
    progBtn.onclick = (e) => {
      e.stopPropagation();
      openProgramPicker(progBtn, log);
    };

    const verBtn = card.querySelector(".base-ver-btn");
    verBtn.onclick = (e) => {
      e.stopPropagation();
      openBaseVersionPicker(verBtn, log);
    };

    card.querySelector('[data-action="up"]').onclick = () => {
      if (origIdx > 0) {
        const temp = knowledgeLogsData[origIdx];
        knowledgeLogsData[origIdx] = knowledgeLogsData[origIdx - 1];
        knowledgeLogsData[origIdx - 1] = temp;
        chrome.storage.local.set({ knowledgeLogs: knowledgeLogsData });
        renderKnowledgeList();
      }
    };

    card.querySelector('[data-action="down"]').onclick = () => {
      if (origIdx < knowledgeLogsData.length - 1) {
        const temp = knowledgeLogsData[origIdx];
        knowledgeLogsData[origIdx] = knowledgeLogsData[origIdx + 1];
        knowledgeLogsData[origIdx + 1] = temp;
        chrome.storage.local.set({ knowledgeLogs: knowledgeLogsData });
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
          renderKnowledgeFilterTabs();
          renderKnowledgeList();
        });
      }
    };

    container.appendChild(card);
  });
}

function openProgramPicker(btnElement, log) {
  const existing = document.getElementById("activeProgSelect");
  if (existing) existing.remove();

  const select = document.createElement("select");
  select.id = "activeProgSelect";
  select.style.cssText = `
    background: #0f172a;
    border: 1px solid #38bdf8;
    color: #38bdf8;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    outline: none;
  `;

  programsData.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.innerText = p.name;
    if (p.id === log.programId) opt.selected = true;
    select.appendChild(opt);
  });

  select.onchange = () => {
    const chosenProg = programsData.find(p => p.id === select.value);
    if (chosenProg) {
      log.programId = chosenProg.id;
      log.programName = chosenProg.name;
      chrome.storage.local.set({ knowledgeLogs: knowledgeLogsData }, () => {
        renderKnowledgeFilterTabs();
        renderKnowledgeList();
      });
    }
  };

  select.onblur = () => {
    setTimeout(() => {
      if (select.parentNode) renderKnowledgeList();
    }, 150);
  };

  btnElement.replaceWith(select);
  select.focus();
}

function openBaseVersionPicker(btnElement, log) {
  const existingSelect = document.getElementById("activeVerSelect");
  if (existingSelect) existingSelect.remove();

  const select = document.createElement("select");
  select.id = "activeVerSelect";
  select.style.cssText = `
    background: #0f172a;
    border: 1px solid #38bdf8;
    color: #f8fafc;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    outline: none;
  `;

  const prog = programsData.find(p => p.id === log.programId);
  const versionSet = new Set();
  if (prog) {
    if (prog.version) versionSet.add(prog.version);
    (prog.saveHistory || []).forEach(h => {
      if (h.version) versionSet.add(h.version);
    });
  }

  let optionsHtml = `<option value="">-- バージョンを選択 --</option>`;
  optionsHtml += `<option value="🌱 初回構築中">🌱 初回構築中 (v1.0.0 以前)</option>`;

  Array.from(versionSet).sort().reverse().forEach(v => {
    optionsHtml += `<option value="${escapeHtml(v)}">🟢 ベース: ${escapeHtml(v)}</option>`;
  });
  optionsHtml += `<option value="UNSET">（未設定に戻す）</option>`;

  select.innerHTML = optionsHtml;
  select.value = log.baseVersion || "";

  select.onchange = () => {
    const newVal = select.value;
    if (newVal === "UNSET") {
      log.baseVersion = "";
    } else {
      log.baseVersion = newVal;
    }
    chrome.storage.local.set({ knowledgeLogs: knowledgeLogsData });
    renderKnowledgeList();
  };

  select.onblur = () => {
    setTimeout(() => {
      if (select.parentNode) renderKnowledgeList();
    }, 150);
  };

  btnElement.replaceWith(select);
  select.focus();
}

// === タブ3: 設定 ===
function renderMasterSettings() {
  const tbody = document.getElementById("masterTableBody");
  tbody.innerHTML = "";

  programsData.forEach((prog, index) => {
    const tr = document.createElement("tr");
    tr.className = `master-row-hoverable ${prog.id === selectedSysinstProgId ? 'selected' : ''}`;
    tr.dataset.progId = prog.id;
    tr.title = "クリックすると上の右側エディタにこのプログラムの固有要件を読み込みます";

    tr.innerHTML = `
      <td style="color: #94a3b8; font-weight: bold; width: 5%;">${index + 1}</td>
      <td style="width: 32%;">
        <input type="text" class="master-input master-name" data-id="${prog.id}" value="${escapeHtml(prog.name)}" placeholder="例: 01_メインシステム">
      </td>
      <td style="width: 35%;">
        <input type="text" class="master-input master-repo" data-id="${prog.id}" value="${escapeHtml(prog.githubRepo || '')}" placeholder="例: your-id/my-project">
      </td>
      <td style="width: 15%; text-align: center;">
        <label style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: #cbd5e1; user-select: none;">
          <input type="checkbox" class="master-web-publish" data-id="${prog.id}" ${prog.isWebPublish ? 'checked' : ''} style="cursor: pointer;">
          <span>有効</span>
        </label>
      </td>
      <td style="width: 13%; text-align: center;">
        <button type="button" class="btn-secondary select-prog-sysinst-btn" data-id="${prog.id}" style="padding: 3px 8px; font-size: 11px;">
          編集 ➜
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".master-row-hoverable").forEach(row => {
    row.onclick = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const pid = row.dataset.progId;
      selectProgForSysInst(pid);
    };
  });

  document.getElementById("githubToken").value = apiConfig.githubToken || "";
  document.getElementById("geminiApiKey").value = apiConfig.geminiApiKey || "";
  document.getElementById("geminiModelName").value = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  
  renderSysInstSplitEditor();
}

function renderSysInstSplitEditor() {
  const commonArea = document.getElementById("commonSystemInstructionArea");
  if (commonArea && document.activeElement !== commonArea) {
    commonArea.value = systemInstructionTemplate || defaultCommonSystemInstruction;
  }

  const picker = document.getElementById("sysinstProgPicker");
  if (picker) {
    picker.innerHTML = "";
    programsData.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.innerText = p.name;
      picker.appendChild(opt);
    });

    if (!programsData.some(p => p.id === selectedSysinstProgId) && programsData.length > 0) {
      selectedSysinstProgId = programsData[0].id;
    }
    picker.value = selectedSysinstProgId;
  }

  updateProgCustomInstArea();
}

function updateProgCustomInstArea() {
  const customArea = document.getElementById("progCustomInstructionArea");
  if (!customArea) return;

  const target = programsData.find(p => p.id === selectedSysinstProgId);
  customArea.value = target ? (target.customInstruction || "") : "";
  customArea.placeholder = target ? `【${target.name}】専用の技術スタック・制約を入力...` : "プログラム固有の要件を入力...";
}

function selectProgForSysInst(progId) {
  selectedSysinstProgId = progId;
  const picker = document.getElementById("sysinstProgPicker");
  if (picker) picker.value = progId;

  document.querySelectorAll(".master-row-hoverable").forEach(r => {
    r.classList.toggle("selected", r.dataset.progId === progId);
  });

  updateProgCustomInstArea();
  
  const customArea = document.getElementById("progCustomInstructionArea");
  if (customArea) {
    customArea.focus();
    customArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}