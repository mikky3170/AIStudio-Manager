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
      urlBaselines: {}
    };
  }
  return accounts;
}

// 17時日次リセット判定
function checkDailyReset() {
  chrome.storage.local.get(["lastResetDate", "accounts"], (res) => {
    const now = new Date();
    const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const resetDateKey = new Date(jstNow.getTime() - 17 * 60 * 60 * 1000).toDateString();

    if (!res.lastResetDate) {
      chrome.storage.local.set({ lastResetDate: resetDateKey });
      return;
    }

    if (res.lastResetDate !== resetDateKey) {
      const currentAccounts = res.accounts || getDefaultAccounts();
      for (let i = 1; i <= 4; i++) {
        const acc = currentAccounts[i];
        acc.tokens = 0;
        acc.currentChatTokens = 0;
        acc.urlBaselines = {};
        acc.meterLevel = 0;
        acc.statusMode = "normal";
        acc.isManual = false;
        acc.isRateLimited = false;
        acc.hasError = false;
        acc.startTime = null;
      }
      chrome.storage.local.set({
        accounts: currentAccounts,
        lastResetDate: resetDateKey
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

// 自動計算ロジックは最大80%まで（100%は自動では絶対に出力しない）
function calculateDailyMeter(dailyTokens) {
  if (!dailyTokens || dailyTokens <= 0) return 0;
  if (dailyTokens <= 300000) return 20;
  if (dailyTokens <= 600000) return 40;
  if (dailyTokens <= 900000) return 60;
  return 80;
}

// メッセージハンドラ
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPDATE_STATUS") {
    const { accountId, tokens, url } = message.data;
    if (accountId < 1 || accountId > 4) return;

    chrome.storage.local.get(["accounts"], (res) => {
      const accounts = res.accounts || getDefaultAccounts();
      const acc = accounts[accountId];

      acc.tabId = sender.tab ? sender.tab.id : acc.tabId;
      acc.currentUrl = url || "";
      acc.currentChatTokens = tokens || 0;

      // 差分トラッキングによる本日の累計消費計算
      if (tokens > 0 && url) {
        if (!acc.urlBaselines) acc.urlBaselines = {};

        if (acc.urlBaselines[url] === undefined) {
          acc.urlBaselines[url] = tokens;
        } else {
          const prevToken = acc.urlBaselines[url];
          if (tokens > prevToken) {
            const delta = tokens - prevToken;
            acc.tokens = (acc.tokens || 0) + delta;
            acc.urlBaselines[url] = tokens;
          }
        }

        if (!acc.startTime && acc.tokens > 0) {
          acc.startTime = Date.now();
        }

        // ユーザー様が手動設定した「limited」や「warning」を勝手に巻き戻さない
        if (acc.statusMode !== "limited" && acc.meterLevel !== 100) {
          acc.meterLevel = calculateDailyMeter(acc.tokens);
        }
      }

      accounts[accountId] = acc;
      chrome.storage.local.set({ accounts });
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
        id: "",
        name: "未分類プログラム"
      };

      const cleanUrl = url.split("?")[0].replace(/\/+$/, "");
      const existingIndex = logs.findIndex(l => {
        const logCleanUrl = (l.url || "").split("?")[0].replace(/\/+$/, "");
        return logCleanUrl === cleanUrl;
      });

      const entry = {
        id: existingIndex >= 0 ? logs[existingIndex].id : `know_${Date.now()}`,
        url: url,
        title: title || "無題のチャット",
        accountId: accountId,
        programId: currentProg.id,
        programName: currentProg.name,
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