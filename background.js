// [v1.4.0 作業版 Rev.1] ナレッジ要約保存時のベースバージョン確定セーブ履歴(saveHistory[0])厳格同期

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("display.html") });
});

function getDefaultAccounts() {
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
      notes: "",
      urlBaselines: {},
      lastChatUrl: ""
    };
  }
  return accounts;
}

// UTCタイムスタンプから純粋なJST日付文字列 (YYYY-MM-DD) を1本で決定論的に算出
function getPureJstDateString(epochMs) {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const jstDate = new Date(epochMs + JST_OFFSET_MS);
  const y = jstDate.getUTCFullYear();
  const m = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jstDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 17時基準のJST業務日付キー (純粋ミリ秒計算により、タイムゾーン二重適用のバグを完全根絶)
function getTodayResetDateKey() {
  const nowMs = Date.now();
  const targetMs = nowMs - (17 * 60 * 60 * 1000);
  return getPureJstDateString(targetMs);
}

// 17時日次リセット判定（17:00跨ぎの誤爆加算を完全防止 ＆ ベースライン辞書は永続維持）
function checkDailyReset() {
  chrome.storage.local.get(["lastResetDate", "accounts", "dailyProgUsage"], (res) => {
    const todayKey = getTodayResetDateKey();

    if (!res.lastResetDate) {
      chrome.storage.local.set({ lastResetDate: todayKey });
      return;
    }

    if (res.lastResetDate !== todayKey) {
      const currentAccounts = res.accounts || getDefaultAccounts();

      for (let i = 1; i <= 4; i++) {
        const acc = currentAccounts[i];
        acc.tokens = 0; // 本日の累計トークンのみリセット
        
        // 🛡️ 過去チャットのベースライン辞書はクリアせず維持（17時跨ぎで過去チャットを開いた際の誤爆加算を完全防止）
        if (!acc.urlBaselines) acc.urlBaselines = {};
        if (acc.currentUrl && acc.currentChatTokens > 0) {
          acc.urlBaselines[acc.currentUrl] = acc.currentChatTokens;
        }

        acc.meterLevel = 0;
        acc.statusMode = "normal";
        acc.isManual = false;
        acc.isRateLimited = false;
        acc.hasError = false;
        acc.startTime = null;
      }

      chrome.storage.local.set({
        accounts: currentAccounts,
        lastResetDate: todayKey
      });
    }
  });
}

chrome.alarms.create("resetAlarm", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "resetAlarm") {
    checkDailyReset();
  }
});

function calculateDailyMeter(dailyTokens) {
  if (!dailyTokens || dailyTokens <= 0) return 0;
  if (dailyTokens <= 300000) return 20;
  if (dailyTokens <= 600000) return 40;
  if (dailyTokens <= 900000) return 60;
  return 80;
}

// メッセージハンドラ（誤爆加算ゼロの堅牢差分検知 ＆ アカウント逆引き ＆ 異常値ヒューズ保護）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 🔍 タブIDからアカウントIDを正確に逆引き（URLに /u/X がない場合のアカウント誤認を完全防止）
  if (message.type === "RESOLVE_ACCOUNT_ID") {
    const tabId = sender.tab ? sender.tab.id : null;
    chrome.storage.local.get(["accounts"], (res) => {
      const accounts = res.accounts || getDefaultAccounts();
      let matchedAccountId = null;

      if (tabId) {
        for (let i = 1; i <= 4; i++) {
          if (accounts[i] && accounts[i].tabId === tabId) {
            matchedAccountId = i;
            break;
          }
        }
      }

      sendResponse({ accountId: matchedAccountId });
    });
    return true;
  }

  if (message.type === "UPDATE_STATUS") {
    const { accountId, tokens, url } = message.data;
    if (accountId < 1 || accountId > 4) return;

    // URLの厳格正規化（クエリ・ハッシュ・末尾スラッシュの差異による別URL誤認を物理遮断）
    const cleanUrl = (url || "").split("?")[0].split("#")[0].replace(/\/+$/, "");

    chrome.storage.local.get(["accounts", "dailyProgUsage"], (res) => {
      const accounts = res.accounts || getDefaultAccounts();
      const dailyProgUsage = res.dailyProgUsage || {};
      const acc = accounts[accountId];
      const todayKey = getTodayResetDateKey();

      acc.tabId = sender.tab ? sender.tab.id : acc.tabId;
      acc.currentUrl = cleanUrl;
      acc.currentChatTokens = tokens || 0;

      if (!acc.urlBaselines) acc.urlBaselines = {};

      if (tokens > 0 && cleanUrl) {
        // 🚀 New Chatから固有URLへの昇格検知（初速トークン切り捨て事故の完全防止）
        const isPromotedFromNewChat = (
          acc.lastChatUrl &&
          acc.lastChatUrl.includes("/prompts/new_chat") &&
          !cleanUrl.includes("/prompts/new_chat")
        );

        if (isPromotedFromNewChat) {
          const previousBase = acc.urlBaselines[acc.lastChatUrl] || 0;
          acc.urlBaselines[cleanUrl] = previousBase;
          delete acc.urlBaselines[acc.lastChatUrl];
        }

        // 🛡️ 初めて検知されたURLの場合の判定
        if (acc.urlBaselines[cleanUrl] === undefined) {
          // 過去チャットを一覧から開いた場合：その時点のトークンをベースラインに登録（誤爆加算ゼロを完全死守）
          acc.urlBaselines[cleanUrl] = tokens;
        } else {
          const prevToken = acc.urlBaselines[cleanUrl];

          if (tokens > prevToken) {
            const delta = tokens - prevToken;

            // 🛡️ 【最重要防壁：異常値ヒューズ】
            // 1回の検知スキャン（3秒間）で20万トークンを超える異常な急増が発生した場合、
            // それは会話による増加ではなく「チャットの切り替えや読み込みのズレ」と断定し、加算を物理遮断する！
            const MAX_REALISTIC_DELTA_PER_TURN = 200000;

            if (delta <= MAX_REALISTIC_DELTA_PER_TURN) {
              acc.tokens = (acc.tokens || 0) + delta;
              acc.urlBaselines[cleanUrl] = tokens;

              if (!dailyProgUsage[todayKey]) dailyProgUsage[todayKey] = {};
              const targetProgId = acc.currentProgramId || "prog_unassigned";
              dailyProgUsage[todayKey][targetProgId] = (dailyProgUsage[todayKey][targetProgId] || 0) + delta;
            } else {
              console.warn(`[ヒューズ作動] 異常なトークン急増を検知 (delta: ${delta} tk)。誤爆防止のため加算を遮断し、ベースラインのみを同期しました。`);
              acc.urlBaselines[cleanUrl] = tokens;
            }

          } else if (tokens < prevToken) {
            // プロンプト編集や一部巻き戻しでトークンが減った場合のベースライン補正
            acc.urlBaselines[cleanUrl] = tokens;
          }
        }

        acc.lastChatUrl = cleanUrl;

        if (!acc.startTime && acc.tokens > 0) {
          acc.startTime = Date.now();
        }

        if (acc.statusMode !== "limited" && acc.meterLevel !== 100) {
          acc.meterLevel = calculateDailyMeter(acc.tokens);
        }
      } else if (cleanUrl) {
        acc.lastChatUrl = cleanUrl;
      }

      accounts[accountId] = acc;
      chrome.storage.local.set({ accounts, dailyProgUsage });
    });
  }

  // 🛠️ 手動トークン補正・リセット処理
  if (message.type === "MANUAL_CORRECT_TOKENS") {
    const { accountId, newTokens } = message.data;
    if (accountId >= 1 && accountId <= 4) {
      chrome.storage.local.get(["accounts"], (res) => {
        const accounts = res.accounts || getDefaultAccounts();
        const acc = accounts[accountId];
        acc.tokens = Math.max(0, parseInt(newTokens, 10) || 0);
        if (acc.statusMode !== "limited" && acc.meterLevel !== 100) {
          acc.meterLevel = calculateDailyMeter(acc.tokens);
        }
        chrome.storage.local.set({ accounts }, () => {
          sendResponse({ success: true, tokens: acc.tokens });
        });
      });
      return true;
    }
  }

  // 🔄 IDモニターでプログラム変更時、開いているAI Studioタブへ即座に更新通知
  if (message.type === "NOTIFY_PROGRAM_CHANGED") {
    const { accountId, programId } = message.data;
    chrome.tabs.query({ url: "https://aistudio.google.com/*" }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: "APPLY_PROGRAM_SYSTEM_INSTRUCTION",
          data: { accountId, programId }
        }).catch(() => {});
      });
    });
  }

  // 🧠 開発ナレッジ要約の保存
  if (message.type === "SAVE_KNOWLEDGE_SUMMARY") {
    const { accountId, title, url, summary, chatDate, updatedAt, usedModel } = message.data;

    chrome.storage.local.get(["knowledgeLogs", "accounts", "programs"], (res) => {
      const logs = res.knowledgeLogs || [];
      const accounts = res.accounts || getDefaultAccounts();
      const currentAcc = accounts[accountId] || {};
      const programs = res.programs || [];
      const currentProg = programs.find(p => p.id === currentAcc.currentProgramId) || {
        id: "prog_unassigned",
        name: "未分類タスク（検証）"
      };

      let autoBaseVersion = "未設定";
      if (currentProg.id !== "prog_unassigned") {
        const hasHistory = currentProg.saveHistory && currentProg.saveHistory.length > 0;
        if (hasHistory) {
          // 🛡️ B案：未セーブの計画中Verではなく、GitHubセーブ履歴の確定最新（saveHistory[0].version）を絶対のベースとする
          autoBaseVersion = currentProg.saveHistory[0].version || "v1.0.0";
        } else {
          autoBaseVersion = "🌱 初回構築中";
        }
      }

      const cleanUrl = (url || "").split("?")[0].split("#")[0].replace(/\/+$/, "");
      const existingIndex = logs.findIndex(l => {
        const logCleanUrl = (l.url || "").split("?")[0].split("#")[0].replace(/\/+$/, "");
        return logCleanUrl === cleanUrl;
      });

      const entry = {
        id: existingIndex >= 0 ? logs[existingIndex].id : `know_${Date.now()}`,
        url: cleanUrl,
        title: title || "無題のチャット",
        accountId: accountId,
        programId: currentProg.id,
        programName: currentProg.name,
        baseVersion: existingIndex >= 0 ? (logs[existingIndex].baseVersion || autoBaseVersion) : autoBaseVersion,
        summary: summary,
        chatDate: chatDate || updatedAt,
        updatedAt: updatedAt,
        usedModel: usedModel || "gemini-3.5-flash-lite",
        timestamp: Date.now()
      };

      if (existingIndex >= 0) {
        logs.splice(existingIndex, 1);
        logs.unshift(entry);
      } else {
        logs.unshift(entry);
      }

      chrome.storage.local.set({ knowledgeLogs: logs }, () => {
        sendResponse({ success: true, updated: existingIndex >= 0, id: entry.id });
      });
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  checkDailyReset();
  chrome.storage.local.get(["accounts"], (res) => {
    if (!res.accounts) {
      chrome.storage.local.set({ accounts: getDefaultAccounts() });
    }
  });
});