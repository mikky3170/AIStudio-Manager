// AI Studioの画面から情報・リミットエラーを収集し、バーチャルスクロールを走査して完全なHTMLを出力するスクリプト

function extractAccountIndex() {
  const match = window.location.pathname.match(/\/u\/(\d+)/);
  if (match) {
    return parseInt(match[1], 10) + 1; // /u/0 -> 1
  }
  return 1;
}

function extractChatTitle() {
  const titleEl = document.querySelector('input[aria-label="Prompt name"], h1, .prompt-title');
  if (titleEl) {
    return titleEl.value || titleEl.innerText || "名称未設定のタスク";
  }
  return document.title.replace(" - Google AI Studio", "").trim() || "作業中タスク";
}

function extractTokens() {
  const fullText = document.body ? (document.body.textContent || "") : "";
  const match = fullText.match(/([\d,]+)\s*(?:tokens|\/\s*[\d,]+)/i);
  if (match) {
    return parseInt(match[1].replace(/,/g, ''), 10);
  }
  return 0;
}

function checkRateLimit() {
  if (!document.body) return false;
  const fullText = document.body.textContent || "";
  return fullText.includes("reached your rate limit") || 
         fullText.includes("try again later") || 
         fullText.includes("Quota exceeded") || 
         fullText.includes("Resource has been exhausted");
}

let lastReportedLimited = false;

function scanAndSend() {
  const accountId = extractAccountIndex();
  const title = extractChatTitle();
  const tokens = extractTokens();
  const isLimited = checkRateLimit();

  if (isLimited && !lastReportedLimited) {
    lastReportedLimited = true;
  } else if (!isLimited && lastReportedLimited) {
    lastReportedLimited = false;
  }

  chrome.runtime.sendMessage({
    type: "UPDATE_STATUS",
    data: {
      accountId: accountId,
      title: title,
      tokens: tokens,
      isRateLimited: isLimited,
      url: window.location.href
    }
  }).catch(() => {});
}

scanAndSend();
setInterval(scanAndSend, 2000);

// === 【バーチャルスクロール完全走査】全ターン収集＆美麗HTML出力 ===

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function findScrollContainer() {
  // バーチャルスクロールViewportまたはスクロール可能なコンテナを検出
  const viewport = document.querySelector('cdk-virtual-scroll-viewport, ms-chat-view, .chat-viewport');
  if (viewport) return viewport;

  // なければスクロールバーを持つ親要素を探索
  const allDivs = document.querySelectorAll('div, main');
  for (const div of allDivs) {
    const style = window.getComputedStyle(div);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && div.scrollHeight > div.clientHeight && div.clientHeight > 300) {
      return div;
    }
  }
  return document.documentElement;
}

async function collectAllChatTurns(updateProgress) {
  const scrollContainer = findScrollContainer();
  const originalScrollTop = scrollContainer.scrollTop;
  const turnsMap = new Map(); // key: turnId or unique text, value: turn object

  updateProgress("チャットの先頭へ移動中...");
  scrollContainer.scrollTop = 0;
  await sleep(400);

  let prevScrollTop = -1;
  const step = 450;
  let noChangeCount = 0;

  while (true) {
    // 現在DOMに描画されているターンを取得
    const turns = document.querySelectorAll('ms-chat-turn, .chat-turn-container');
    
    turns.forEach((turn, idx) => {
      // ユーザー発言かモデル発言か判定
      const isUser = turn.querySelector('[data-turn-role="User"]') !== null || 
                     turn.classList.contains('user') ||
                     turn.getAttribute('data-turn-role') === 'User';
      
      const role = isUser ? 'User' : 'Model';
      const turnId = turn.id || turn.getAttribute('id') || `turn_${turnsMap.size}_${idx}`;

      // コンテンツ要素
      const contentEl = turn.querySelector('.turn-content, ms-prompt-chunk, .cmark-node') || turn;
      const text = contentEl.innerText ? contentEl.innerText.trim() : "";

      // 中身が空でない（バーチャルスクロールのダミー枠でない）場合のみ記録
      if (text.length > 0 && !turnsMap.has(turnId)) {
        // 不要なボタン・SVGを除去したクリーンHTMLを作成
        const clone = turn.cloneNode(true);
        clone.querySelectorAll('svg, defs, button, ms-chat-turn-options, .actions-container, .actions, mat-menu').forEach(el => el.remove());

        // 思考プロセス（Thoughts）の存在確認
        const thoughtEl = clone.querySelector('ms-thought-chunk, .thought-panel');
        let thoughtHtml = "";
        if (thoughtEl) {
          thoughtHtml = `<div class="thought-box"><strong>💭 Thinking Process:</strong><br>${thoughtEl.innerHTML}</div>`;
          thoughtEl.remove();
        }

        turnsMap.set(turnId, {
          id: turnId,
          role: role,
          thoughtHtml: thoughtHtml,
          bodyHtml: clone.innerHTML
        });
      }
    });

    const currentScrollTop = scrollContainer.scrollTop;
    const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    const percent = maxScroll > 0 ? Math.min(100, Math.round((currentScrollTop / maxScroll) * 100)) : 100;
    
    updateProgress(`ログ走査中... (${percent}%)`);

    if (currentScrollTop === prevScrollTop || currentScrollTop >= maxScroll) {
      noChangeCount++;
      if (noChangeCount >= 2) break; // 最下部到達
    } else {
      noChangeCount = 0;
    }

    prevScrollTop = currentScrollTop;
    scrollContainer.scrollTop += step;
    await sleep(100); // 描画待機
  }

  // 元のスクロール位置に戻す
  scrollContainer.scrollTop = originalScrollTop;

  return Array.from(turnsMap.values());
}

async function exportChatAsHtml(btn) {
  const title = extractChatTitle();
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

  const collectedTurns = await collectAllChatTurns((msg) => {
    btn.innerText = `⏳ ${msg}`;
  });

  if (collectedTurns.length === 0) {
    alert("チャットのメッセージを取得できませんでした。画面が表示されているかご確認ください。");
    return;
  }

  // 収集したターンをクリーンなHTMLブロックに再構成
  let chatBodyHtml = "";
  collectedTurns.forEach(turn => {
    const isUser = turn.role === "User";
    const bubbleClass = isUser ? "bubble-user" : "bubble-model";
    const authorName = isUser ? "👤 あなた (User)" : "🤖 AI Studio (Model)";

    chatBodyHtml += `
      <div class="chat-row ${isUser ? 'right' : 'left'}">
        <div class="author-name">${authorName}</div>
        ${turn.thoughtHtml}
        <div class="chat-bubble ${bubbleClass}">
          ${turn.bodyHtml}
        </div>
      </div>
    `;
  });

  const fullHtmlContent = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} - AI Studio 会話ログ</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      padding: 30px 20px;
      display: flex;
      justify-content: center;
      line-height: 1.6;
    }
    .container {
      width: 100%;
      max-width: 960px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .header-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 20px 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .header-card h1 { font-size: 20px; color: #38bdf8; margin-bottom: 6px; }
    .header-card .meta { font-size: 12px; color: #94a3b8; }

    .chat-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .chat-row {
      display: flex;
      flex-direction: column;
      width: 100%;
    }
    .chat-row.right { align-items: flex-end; }
    .chat-row.left { align-items: flex-start; }

    .author-name {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      margin-bottom: 4px;
      padding: 0 4px;
    }

    .chat-bubble {
      width: fit-content;
      max-width: 88%;
      padding: 14px 18px;
      border-radius: 12px;
      font-size: 13px;
      word-break: break-word;
      line-height: 1.6;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    }
    .bubble-user {
      background: #1e3a8a !important;
      border: 1px solid #2563eb !important;
      color: #f8fafc !important;
      border-bottom-right-radius: 2px;
    }
    .bubble-model {
      background: #1e293b !important;
      border: 1px solid #334155 !important;
      color: #e2e8f0 !important;
      border-bottom-left-radius: 2px;
    }

    .thought-box {
      background: #162032;
      border: 1px dashed #475569;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 8px;
      font-size: 12px;
      color: #94a3b8;
      max-width: 88%;
    }

    /* コードブロック整形 */
    pre {
      background: #090d16 !important;
      border: 1px solid #334155 !important;
      border-radius: 8px !important;
      padding: 12px !important;
      margin: 10px 0 !important;
      overflow-x: auto !important;
      color: #cbd5e1 !important;
      font-family: Consolas, Monaco, "Courier New", monospace !important;
      font-size: 12px !important;
    }
    code { font-family: Consolas, Monaco, "Courier New", monospace !important; }
    
    /* 余計な空ブロックや高さ固定を消去 */
    div[style*="height"] { height: auto !important; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-card">
      <h1>💬 ${escapeHtml(title)}</h1>
      <div class="meta">保存日時: ${now.toLocaleString()} | ソース: ${escapeHtml(window.location.href)} | 発言数: ${collectedTurns.length}</div>
    </div>
    <div class="chat-container">
      ${chatBodyHtml}
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([fullHtmlContent], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const cleanTitle = title.replace(/[\\/:*?"<>|]/g, "_").substring(0, 30);
  a.href = url;
  a.download = `AIStudio_${cleanTitle}_${dateStr}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// === 画面右上に「💾 チャットをHTML保存」ボタンを設置 ===
function injectSaveButton() {
  if (document.getElementById("studio-manager-save-btn")) return;

  const btn = document.createElement("button");
  btn.id = "studio-manager-save-btn";
  btn.innerText = "💾 チャットをHTML保存";
  btn.style.cssText = `
    position: fixed;
    top: 14px;
    right: 90px;
    z-index: 999999;
    background: #0284c7;
    color: white;
    border: 1px solid #38bdf8;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    transition: all 0.2s;
  `;

  btn.onmouseover = () => btn.style.background = "#0369a1";
  btn.onmouseout = () => btn.style.background = "#0284c7";

  btn.onclick = async () => {
    btn.disabled = true;
    try {
      await exportChatAsHtml(btn);
      btn.innerText = "✅ ダウンロード完了！";
    } catch (e) {
      console.error(e);
      btn.innerText = "❌ エラー発生";
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.innerText = "💾 チャットをHTML保存";
      }, 2500);
    }
  };

  document.body.appendChild(btn);
}

setTimeout(injectSaveButton, 1500);
setInterval(injectSaveButton, 3000);