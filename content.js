// [v1.2.0 作業版 Rev.1] トークン抽出の単位(k/M)対応＆URL正規化による正確なトークン検知
// AI Studio 開発ナレッジ自動要約＆同期エンジン
// （手繰り寄せ型巻き戻し ＆ 全会話走査 ＆ 30万tk肥大化警告 ＆ アカウント逆引き ＆ 拡張更新時自己停止ガード搭載）

let scanTimerId = null;
let injectTimerId = null;
let cachedAccountId = null;

// 拡張機能のコンテキストが有効かチェックし、無効化されていたらタイマーを自己破棄する
function isContextValid() {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
    if (scanTimerId) clearInterval(scanTimerId);
    if (injectTimerId) clearInterval(injectTimerId);
    return false;
  }
  return true;
}

// URLを正規化（クエリパラメータやハッシュを除去し、同一チャットの別URL誤認を防止）
function getNormalizedUrl() {
  return window.location.href.split("?")[0].split("#")[0].replace(/\/+$/, "");
}

// アカウント番号の多重判定（URLの /u/X 判定 ＋ バックグラウンド側のタブID逆引き）
async function resolveCurrentAccountId() {
  if (cachedAccountId) return cachedAccountId;

  const match = window.location.pathname.match(/\/u\/(\d+)/);
  if (match) {
    cachedAccountId = parseInt(match[1], 10) + 1;
    return cachedAccountId;
  }

  // URLに /u/X がない場合、自身のtabIdからbackgroundへアカウント番号を逆引き照会
  if (isContextValid()) {
    try {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: "RESOLVE_ACCOUNT_ID" }, res => {
          resolve(res && res.accountId ? res.accountId : null);
        });
      });
      if (response) {
        cachedAccountId = response;
        return cachedAccountId;
      }
    } catch (e) {}
  }

  cachedAccountId = 1;
  return 1;
}

function extractChatTitle() {
  const titleEl = document.querySelector('input[aria-label="Prompt name"], h1, .prompt-title');
  if (titleEl) {
    return titleEl.value || titleEl.innerText || "名称未設定のタスク";
  }
  return document.title.replace(" - Google AI Studio", "").trim() || "作業中タスク";
}

// === トークン数抽出（通常表記 ＆ k/M短縮表記に完全対応） ===
function extractTokens() {
  const uiSelectors = [
    'ms-token-count',
    '[data-test-id="token-count"]',
    '.token-count',
    '.token-counter',
    'ms-run-settings',
    'mat-sidenav',
    'footer',
    'mat-toolbar'
  ];

  for (const selector of uiSelectors) {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      if (el.closest('ms-chat-turn, ms-user-turn, ms-model-turn, .chat-turn-container')) continue;
      const text = el.innerText || el.textContent || "";
      const val = parseTokenStringFromUI(text);
      if (val > 0) return val;
    }
  }
  return 0;
}

function parseTokenStringFromUI(text) {
  if (!text) return 0;

  // 1. スラッシュ形式 (例: "320,123 / 1,048,576" や "320k / 1M")
  const slashMatch = text.match(/([\d,.]+\s*[kmb]?)\s*\/\s*[\d,.]+/i);
  if (slashMatch) {
    return convertUnitStringToNumber(slashMatch[1]);
  }

  // 2. tokens形式 (例: "320,123 tokens" や "320.5k tokens")
  const tokenMatch = text.match(/([\d,.]+\s*[kmb]?)\s*tokens?/i);
  if (tokenMatch) {
    return convertUnitStringToNumber(tokenMatch[1]);
  }

  return 0;
}

function convertUnitStringToNumber(str) {
  if (!str) return 0;
  const clean = str.replace(/,/g, '').trim().toLowerCase();
  
  if (clean.endsWith('m')) {
    const num = parseFloat(clean.replace('m', ''));
    return isNaN(num) ? 0 : Math.round(num * 1000000);
  }
  if (clean.endsWith('k')) {
    const num = parseFloat(clean.replace('k', ''));
    return isNaN(num) ? 0 : Math.round(num * 1000);
  }
  if (clean.endsWith('b')) {
    const num = parseFloat(clean.replace('b', ''));
    return isNaN(num) ? 0 : Math.round(num * 1000000000);
  }

  const num = parseInt(clean, 10);
  return isNaN(num) ? 0 : num;
}

// ステータス定期同期 ＆ 30万tk肥大化警告ボタンの動的更新
async function scanAndSend() {
  if (!isContextValid()) return;

  const accountId = await resolveCurrentAccountId();
  const title = extractChatTitle();
  const tokens = extractTokens();
  const normalizedUrl = getNormalizedUrl();

  updateButtonWarningState(tokens);

  try {
    chrome.runtime.sendMessage({
      type: "UPDATE_STATUS",
      data: {
        accountId: accountId,
        title: title,
        tokens: tokens,
        url: normalizedUrl,
        rawUrl: window.location.href
      }
    }).catch(() => {});
  } catch (e) {
    if (!isContextValid()) return;
  }
}

// 30万トークンを超えたら要約ボタンをオレンジ色の警告状態にする
function updateButtonWarningState(tokens) {
  const btn = document.getElementById("studio-manager-knowledge-btn");
  if (!btn || btn.disabled) return;

  if (tokens >= 300000) {
    const kTokens = Math.round(tokens / 1000);
    btn.innerText = `⚠️ ${kTokens}k tk (F5更新 ➜ 要約＆新チャット推奨)`;
    btn.style.background = "#d97706";
    btn.style.borderColor = "#f59e0b";
  } else {
    btn.innerText = "🧠 ナレッジ要約してマネージャーへ同期";
    btn.style.background = "#0284c7";
    btn.style.borderColor = "#38bdf8";
  }
}

scanAndSend();
scanTimerId = setInterval(scanAndSend, 3000);

// === 【手繰り寄せ型巻き戻し ＆ 全履歴走査エンジン】 ===

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function compressCodeBlocks(text) {
  return text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const lines = code.trim().split("\n");
    if (lines.length <= 6) return match;
    const firstLine = lines[0].substring(0, 70);
    const lastLine = lines[lines.length - 1].substring(0, 70);
    return `\`\`\`${lang}\n${firstLine}\n// ... [コード省略: 計 ${lines.length} 行] ...\n${lastLine}\n\`\`\``;
  });
}

function smartSampleContext(fullText, maxChars = 38000) {
  if (fullText.length <= maxChars) return fullText;
  const headChars = Math.floor(maxChars * 0.3);
  const tailChars = Math.floor(maxChars * 0.7);
  return `${fullText.substring(0, headChars)}\n\n...（中略: 途中経過ログ ${fullText.length - maxChars} 文字を圧縮）...\n\n${fullText.substring(fullText.length - tailChars)}`;
}

async function rewindToTopByHand(updateProgress) {
  updateProgress("頑固なスクロールを手繰り寄せて最上部へ移動中...");

  let prevTopElement = null;
  let noChangeCount = 0;

  for (let i = 0; i < 25; i++) {
    const turns = document.querySelectorAll('ms-chat-turn, ms-prompt-chunk, ms-response-chunk, .chat-turn');
    if (turns.length > 0) {
      const topTurn = turns[0];
      topTurn.scrollIntoView({ behavior: 'instant', block: 'start' });

      if (topTurn === prevTopElement) {
        noChangeCount++;
        if (noChangeCount >= 3) break;
      } else {
        noChangeCount = 0;
      }
      prevTopElement = topTurn;
    }
    await sleep(150);
  }
}

async function extractFullChatHistoryWithHand(updateProgress) {
  const allTexts = [];
  const seenTexts = new Set();

  await rewindToTopByHand(updateProgress);

  updateProgress("てっぺんから下へ全会話を回収中...");
  await sleep(250);

  let prevBottomElement = null;
  let noChangeCount = 0;

  for (let step = 0; step < 40; step++) {
    const turns = document.querySelectorAll('ms-chat-turn, ms-prompt-chunk, ms-response-chunk, .chat-turn');

    turns.forEach(el => {
      if (el.closest('.input-area, ms-chat-input, footer, mat-toolbar')) return;
      if (el.tagName !== 'MS-CHAT-TURN' && el.closest('ms-chat-turn')) return;

      const clone = el.cloneNode(true);
      clone.querySelectorAll('button, svg, mat-icon, mat-menu, ms-thought-chunk, .thought-panel, ms-chat-turn-options').forEach(n => n.remove());

      const textarea = el.querySelector('textarea, input');
      let txt = (textarea && textarea.value) ? textarea.value.trim() : (clone.innerText ? clone.innerText.trim() : "");

      if (txt.length > 2 && !/^Model\s+\d+:\d+$/i.test(txt)) {
        const key = `${txt.substring(0, 60)}_${txt.length}`;
        if (!seenTexts.has(key)) {
          seenTexts.add(key);
          allTexts.push(compressCodeBlocks(txt));
        }
      }
    });

    if (turns.length > 0) {
      const bottomTurn = turns[turns.length - 1];
      bottomTurn.scrollIntoView({ behavior: 'instant', block: 'end' });

      if (bottomTurn === prevBottomElement) {
        noChangeCount++;
        if (noChangeCount >= 2) break;
      } else {
        noChangeCount = 0;
      }
      prevBottomElement = bottomTurn;
    }

    await sleep(150);
  }

  const fullTextCombined = allTexts.join("\n\n---\n\n");
  return smartSampleContext(fullTextCombined);
}

async function requestGeminiApi(modelName, apiKey, promptText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2500
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errMsg = err.error?.message || `HTTP ${res.status}`;
    const errorObj = new Error(errMsg);
    errorObj.status = res.status;
    throw errorObj;
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

async function callGeminiForKnowledgeSummary(chatContext, apiConfig) {
  const primaryModel = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const fallbackModel = "gemini-flash-lite-latest";

  const prompt = `あなたはプロのソフトウェアエンジニア兼ナレッジマネージャーです。
以下に提供する【セッション全体の全会話ログ】を最初から最後までしっかりと読み解き、後から検索して見返しやすい【開発ナレッジカード】を作成してください。

【厳格な指示】
直近の最後のやり取りだけに偏らず、このチャット全体を通して行われた【最初に取り組んだ目的・前半の議論】、【中盤の改修や試行錯誤】、【最終的な決定事項や得られたノウハウ】を、時系列の流れに沿って漏れなく網羅してください。

【厳格な出力フォーマット】
以下の3つの見出し（■）を使って、日本語のプレーンテキストで箇条書きで出力してください。Markdownの太字記号（**）や装飾記号は最小限にしてください。

■ セッションの目的
（このチャット全体で何を開発・検討しようとしたかを1〜2行で簡潔に）

■ 主な決定事項・コード改修
・（セッション全体で決定した仕様や、実装・修正した重要ポイントを時系列順に箇条書きで3〜5行）

■ 💡 得られたノウハウ・知見・重要キーワード
・（会話全体の中で出た開発のコツ、解決策、後から検索したくなるキーワードを箇条書きで3〜5行）

【セッション全体の全会話ログ】
${chatContext}
`;

  try {
    const result = await requestGeminiApi(primaryModel, apiConfig.geminiApiKey, prompt);
    return { text: result, usedModel: primaryModel };
  } catch (err) {
    console.warn(`プライマリモデル (${primaryModel}) でエラー: ${err.message}。フォールバック (${fallbackModel}) を試行します...`);
    try {
      const result = await requestGeminiApi(fallbackModel, apiConfig.geminiApiKey, prompt);
      return { text: result, usedModel: fallbackModel };
    } catch (err2) {
      throw new Error(`全モデルで要約失敗: ${err.message} / ${err2.message}`);
    }
  }
}

function validateSummaryCompleteness(text) {
  if (!text || text.length < 150) return false;

  const hasPurpose = text.includes("■ セッションの目的");
  const hasDecision = text.includes("■ 主な決定事項");
  const hasKnowhow = text.includes("■ 得られたノウハウ") || text.includes("■ 💡 得られたノウハウ");

  if (!hasPurpose || !hasDecision || !hasKnowhow) return false;

  const trimmed = text.trim();
  if (trimmed.endsWith("、") || trimmed.endsWith(",")) return false;

  const decisionPart = text.split(/■\s*主な決定事項[^\n]*/i)[1] || "";
  if (decisionPart.trim().length < 20) return false;

  return true;
}

async function executeKnowledgeSync(btn) {
  if (!isContextValid()) {
    alert("拡張機能が更新されました。最新の状態で利用するため、AI Studioのページを一度再読み込み（F5）してください。");
    return;
  }

  btn.disabled = true;

  const accountId = await resolveCurrentAccountId();
  const title = extractChatTitle();
  const normalizedUrl = getNormalizedUrl();

  const fullText = await extractFullChatHistoryWithHand((msg) => {
    btn.innerText = `⏳ ${msg}`;
  });

  if (!fullText || fullText.length < 10) {
    alert("会話内容が取得できませんでした。AI Studioにメッセージが表示されているかご確認ください。");
    btn.disabled = false;
    btn.innerText = "🧠 ナレッジ要約してマネージャーへ同期";
    return;
  }

  chrome.storage.local.get(["apiConfig"], async (res) => {
    if (!isContextValid()) return;

    const apiConfig = res.apiConfig || {};

    let summaryText = "";
    let usedModel = apiConfig.geminiModelName || "gemini-3.5-flash-lite";

    if (apiConfig.geminiApiKey) {
      btn.innerText = `🤖 ${usedModel} でセッション全体を要約中...`;
      try {
        const aiResponse = await callGeminiForKnowledgeSummary(fullText, apiConfig);
        summaryText = aiResponse.text;
        usedModel = aiResponse.usedModel;

        const isValid = validateSummaryCompleteness(summaryText);
        if (!isValid) {
          console.warn("不完全な要約を検知:", summaryText);
          alert("⚠️ 【要約の途切れを検知しました】\n\n会話が長大化し、ブラウザのメモリ圧迫により要約が途中で途切れてしまった可能性があります。\n\nお手数ですが、一度キーボードの【F5】キーを押してページを再読み込みしてから、もう一度「要約ボタン」を押してください。");
          
          btn.disabled = false;
          btn.innerText = "⚠️ F5更新後に再試行してください";
          btn.style.background = "#d97706";
          return;
        }

      } catch (err) {
        console.error("Gemini API Error:", err);
        summaryText = `【自動要約エラー: ${err.message}】\n\n■ 会話スニペット:\n${fullText.substring(0, 400)}...`;
      }
    } else {
      summaryText = `■ セッションの目的\n${title} の作業セッション\n\n■ 会話スニペット (APIキーを設定すると詳細要約されます)\n${fullText.substring(0, 400)}...\n\n■ 💡 重要キーワード\n・${title}、作業ログ`;
      usedModel = "未連携(スニペット)";
    }

    const now = new Date();
    const dateStr = `${now.getMonth() + 1}/${now.getDate()}`;
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const formattedDate = `${dateStr} ${timeStr}`;

    try {
      chrome.runtime.sendMessage({
        type: "SAVE_KNOWLEDGE_SUMMARY",
        data: {
          accountId: accountId,
          title: title,
          url: normalizedUrl,
          summary: summaryText,
          chatDate: formattedDate,
          updatedAt: formattedDate,
          usedModel: usedModel
        }
      }, () => {
        btn.innerText = "✅ ナレッジ同期完了！";
        setTimeout(() => {
          btn.disabled = false;
          scanAndSend();
        }, 2500);
      });
    } catch (e) {
      console.warn("ナレッジ送信時コンテキスト切断:", e);
    }
  });
}

function injectKnowledgeButton() {
  if (!isContextValid()) return;
  if (document.getElementById("studio-manager-knowledge-btn")) return;

  const btn = document.createElement("button");
  btn.id = "studio-manager-knowledge-btn";
  btn.innerText = "🧠 ナレッジ要約してマネージャーへ同期";
  btn.style.cssText = `
    position: fixed;
    top: 14px;
    right: 90px;
    z-index: 999999;
    background: #0284c7;
    color: white;
    border: 1px solid #38bdf8;
    padding: 8px 15px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    transition: all 0.2s;
  `;

  btn.onmouseover = () => {
    if (btn.style.background !== "rgb(217, 119, 6)") btn.style.background = "#0369a1";
  };
  btn.onmouseout = () => {
    if (btn.style.background !== "rgb(217, 119, 6)") btn.style.background = "#0284c7";
  };
  btn.onclick = () => executeKnowledgeSync(btn);

  document.body.appendChild(btn);
}

setTimeout(injectKnowledgeButton, 1500);
injectTimerId = setInterval(injectKnowledgeButton, 3000);