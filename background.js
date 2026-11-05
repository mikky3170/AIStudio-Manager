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

// 17時リセット
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
        currentAccounts[i].tokens = 0;
        currentAccounts[i].meterLevel = 0;
        currentAccounts[i].isManual = false;
        currentAccounts[i].isRateLimited = false;
        currentAccounts[i].startTime = null;
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

// メッセージハンドラ
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPDATE_STATUS") {
    const { accountId, tokens, isRateLimited } = message.data;
    if (accountId < 1 || accountId > 4) return;

    chrome.storage.local.get(["accounts"], (res) => {
      const accounts = res.accounts || getDefaultAccounts();
      const acc = accounts[accountId];

      acc.tokens = Math.max(acc.tokens || 0, tokens);
      acc.tabId = sender.tab ? sender.tab.id : acc.tabId;

      if (!acc.startTime && tokens > 0) {
        acc.startTime = Date.now();
      }

      if (isRateLimited) {
        acc.isRateLimited = true;
        acc.meterLevel = 100;
        acc.isManual = true;
      } else {
        if (!acc.isManual && !acc.isRateLimited && acc.meterLevel === 0) {
          const maxTokens = 1000000;
          const ratio = acc.tokens / maxTokens;
          if (ratio >= 0.8) acc.meterLevel = 100;
          else if (ratio >= 0.6) acc.meterLevel = 80;
          else if (ratio >= 0.4) acc.meterLevel = 60;
          else if (ratio >= 0.2) acc.meterLevel = 40;
          else if (ratio > 0.05) acc.meterLevel = 20;
        }
      }

      accounts[accountId] = acc;
      chrome.storage.local.set({ accounts });
    });
  }

  if (message.type === "SAVE_CHAT_LOG") {
    const { accountId, title, url, messages } = message.data;
    chrome.storage.local.get(["chatLogs", "accounts", "programs"], (res) => {
      const logs = res.chatLogs || [];
      const accounts = res.accounts || getDefaultAccounts();
      const currentAcc = accounts[accountId] || {};
      const programs = res.programs || [];
      const currentProg = programs.find(p => p.id === currentAcc.currentProgramId) || { name: "未分類プログラム" };

      const now = new Date();
      const newLog = {
        id: `log_${Date.now()}`,
        timestamp: Date.now(),
        dateStr: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        accountId: accountId,
        programName: currentProg.name,
        title: title || "AI Studio チャットセッション",
        url: url,
        messages: messages || []
      };

      logs.unshift(newLog);
      chrome.storage.local.set({ chatLogs: logs }, () => {
        sendResponse({ success: true, logId: newLog.id });
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