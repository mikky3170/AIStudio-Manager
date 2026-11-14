// [v1.4.2 作業版 Rev.6] 直近トークン増分レシート状態管理・リアルタイム同期・アコーディオン初期化の実装
const APP_DEFAULT_VERSION = "v1.3.0";

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
    name: "01_Studio マネージャー(AI Studio連携)",
    version: "v1.4.2",
    githubRepo: "your-id/AIStudio-Manager",
    isWebPublish: false,
    customInstruction: "Chrome拡張機能(Manifest V3)の設計規約を遵守すること。バックグラウンドサービスワーカー(background.js)とコンテンツスクリプト(content.js)の通信規約、chrome.storage.localの保存仕様を維持すること。",
    files: "manifest.json, background.js, display.html, app_core.js, app_ui.js, app_concierge.js, content.js",
    tokensWeek: 0,
    tokensMonth: 0,
    hoursWeek: 0,
    lastCommit: "v1.3.0: 安定集計エンジンの確立とバージョン自動着手",
    inboxNotes: [],
    saveHistory: [
      {
        version: "v1.3.0",
        timestamp: Date.now() - 3600000,
        dateStr: "2024/11/6 16:30",
        commitMsg: "v1.3.0: 安定集計エンジンの確立とバージョン自動着手",
        summary: "■ 監視・集計エンジンの堅牢化およびバージョン管理の完全自動化\n・異常値ヒューズ搭載によるリソース配分の誤爆加算の完全根絶\n・着手プロンプトへの予定バージョン自動注入による手戻りゼロ化\n・ガイド詳細完全版の復元およびマスタ永続化の確立"
      },
      {
        version: "v1.2.0",
        timestamp: Date.now() - 7200000,
        dateStr: "2024/11/6 14:00",
        commitMsg: "v1.2.0: スクリプト3分割構成への移行",
        summary: "■ システム構成の最適化とバージョン1.2.0への昇格\n・action.jsをapp_core.js, app_ui.js, app_concierge.jsの3ファイルに分割し保守性を向上\n・構成ファイル名の実態保護とデグレード防止の徹底"
      },
      {
        version: "v1.1.0",
        timestamp: Date.now() - 86400000,
        dateStr: "2024/11/5 15:00",
        commitMsg: "v1.1.0: AIコンシェルジュ搭載",
        summary: "■ AIコンシェルジュ機能の初期搭載\n・画面右下に常駐する専任コンシェルジュパネルと音声波形ビジュアライザーの実装\n・全コードをプロンプトへ注入する推論エンジンの構築"
      }
    ],
    enhancePlans: []
  },
  {
    id: "prog_2",
    name: "02_Thinking Studio（思考構造化 ＆ 発射台ハブ）",
    version: "v1.0.0",
    githubRepo: "",
    isWebPublish: true,
    customInstruction: "ガイド・ドキュメントの章立て体系を崩さず、必ず以下の【標準4層構造】を維持・追記補正すること：\n・第1層：エコシステム全体連携 ＆ 終了定義（ツールの位置付け・出口）\n・第2層：コンセプト ＆ 画面構成（ツールの思想・3ペインの役割）\n・第3層：基本操作フロー（Step1〜Step4の標準的な進め方）\n・第4層：主要機能詳細（音声/推敲、レスキュー、ペルソナ、VOICEVOX、セッション管理等）",
    files: "start_studio.bat, thinking_studio.html",
    tokensWeek: 0,
    tokensMonth: 0,
    hoursWeek: 0,
    lastCommit: "未セーブ",
    inboxNotes: [],
    saveHistory: [],
    enhancePlans: []
  },
  {
    id: "prog_3",
    name: "03_Wish & Action コックピット",
    version: "v1.0.0",
    githubRepo: "",
    isWebPublish: true,
    customInstruction: "懸案・アクション管理コックピットとしてのデータ整合性を維持すること。index.html と data.js の役割分担を守り、1つのCode枠で一括コピーできる状態で出力すること。",
    files: "index.html, data.js",
    tokensWeek: 0,
    tokensMonth: 0,
    hoursWeek: 0,
    lastCommit: "未セーブ",
    inboxNotes: [],
    saveHistory: [],
    enhancePlans: []
  },
  {
    id: "prog_4",
    name: "04_Spec Studio（設計書・マニュアル自動生成）",
    version: "v1.0.0",
    githubRepo: "",
    isWebPublish: true,
    customInstruction: "自動設計書作成システムとしての構造化出力ロジックを維持すること。入力された仕様情報から高精度なMarkdownおよびHTMLドキュメントを生成する処理を堅牢に保つこと。",
    files: "index.html, data.js",
    tokensWeek: 0,
    tokensMonth: 0,
    hoursWeek: 0,
    lastCommit: "未セーブ",
    inboxNotes: [],
    saveHistory: [],
    enhancePlans: []
  },
  {
    id: "prog_5",
    name: "05_将棋王2026",
    version: "v1.0.0",
    githubRepo: "",
    isWebPublish: true,
    customInstruction: "プロのゲームデザイナー兼プログラマーとして対応すること。安土桃山時代の戦国武将のきらびやかで重厚な雰囲気を大切にデザイン・演出すること。",
    files: "index.html, main.js",
    tokensWeek: 0,
    tokensMonth: 0,
    hoursWeek: 0,
    lastCommit: "未セーブ",
    inboxNotes: [],
    saveHistory: [],
    enhancePlans: []
  },
  {
    id: "prog_6",
    name: "06_AIペット クロちゃん",
    version: "v1.0.0",
    githubRepo: "",
    isWebPublish: true,
    customInstruction: "AIペット「クロちゃん」専属プロデザイナー兼プログラマーとして対応すること。\n【優先1】クロちゃんがVOICEVOXのかわいい声で答え、音声とセリフテキストの同期をとって表示すること。飼い主さんとの自然な会話、データの蓄積・更新・連携仕様（データライフサイクル）を100%維持すること。\n【優先2】クロちゃんの可愛いデザイン、スムーズなアニメーションを維持すること。\n【優先3】ニュースやお店探しのGoogleマップ検索などの便利機能を実装すること。",
    files: "index.html, app.js",
    tokensWeek: 0,
    tokensMonth: 0,
    hoursWeek: 0,
    lastCommit: "未セーブ",
    inboxNotes: [],
    saveHistory: [],
    enhancePlans: []
  },
  {
    id: "prog_7",
    name: "07_オセロ王",
    version: "v1.0.0",
    githubRepo: "",
    isWebPublish: true,
    customInstruction: "オセロゲーム専属デザイナー兼プログラマーとして対応すること。AIの先読み思考ルーチン、石の挟み込み判定、盤面デザイン、ゲーム進行ステートの整合性を完全に維持すること。",
    files: "index.html, othello_data.js",
    tokensWeek: 0,
    tokensMonth: 0,
    hoursWeek: 0,
    lastCommit: "未セーブ",
    inboxNotes: [],
    saveHistory: [],
    enhancePlans: []
  },
  {
    id: "prog_8",
    name: "08_大富豪王2026",
    version: "v1.0.0",
    githubRepo: "",
    isWebPublish: true,
    customInstruction: "大富豪Webゲーム「ROYAL CARD GAME」の専属シニアエンジニアとして対応すること。\n・新機能・ロジック提案時は、メリットとともに「大富豪の戦術として裏目に出て自滅する最悪のシナリオ（副作用）を2点以上」提示すること。\n・基幹ロジック（深層学習推論、王MCTS探索エンジン、オートセーブ＆復帰、リアルタイム勝率計算等）を完全保護すること。\n・スマホとタブレットの専用表示レイアウトを維持・適用すること。",
    files: "index.html, config.js, main.js",
    tokensWeek: 0,
    tokensMonth: 0,
    hoursWeek: 0,
    lastCommit: "未セーブ",
    inboxNotes: [],
    saveHistory: [],
    enhancePlans: []
  },
  {
    id: "prog_9",
    name: "09_健康管理くん",
    version: "v1.0.0",
    githubRepo: "",
    isWebPublish: true,
    customInstruction: "コンサル能力とプログラマースキルに加え、医師と栄養士の知見を備えたアドバイザーとして対応すること。日々のバイタル記録、栄養素・カロリー計算、健康アドバイスの医学的・栄養学的妥当性とUIの使いやすさを維持すること。",
    files: "KK_Dashboard.html",
    tokensWeek: 0,
    tokensMonth: 0,
    hoursWeek: 0,
    lastCommit: "未セーブ",
    inboxNotes: [],
    saveHistory: [],
    enhancePlans: []
  },
  {
    id: "prog_10",
    name: "10_共通部品・ツール群（音声、Geminiテスト）",
    version: "v1.0.0",
    githubRepo: "",
    isWebPublish: false,
    customInstruction: "共通部品および技術検証（音声認識、音声合成、Gemini APIテスト、共通ユーティリティ等）の専属エンジニアとして対応すること。他のプログラムへの再利用性とコードの独立性を維持すること。",
    files: "",
    tokensWeek: 0,
    tokensMonth: 0,
    hoursWeek: 0,
    lastCommit: "未セーブ",
    inboxNotes: [],
    saveHistory: [],
    enhancePlans: []
  }
];

const defaultCommonSystemInstruction = `あなたは、私が指示するプログラムの専任シニアエンジニア兼プロジェクトマネージャーです。高いコンサルティング能力と設計・実装スキルを備えています。

【基本行動フロー】
1. 私が質問やアイディア、修正依頼を提示します。まずは内容の理解と、具体的な方針・対応策を提示してください。
2. プログラムの修正作業は、必ず「修正方針の事前提示」を行い、私の「承認（了解）」を得てから全コードを出力してください。
3. 不明点やリスク、複数の選択肢がある場合は、勝手に判断して進めず、方針を含めて逆質問を行い、明確にしてから作業を進めてください。

【仕様変更・デグレード防止の厳格ルール】
1. 既存仕様・コアロジックの100%維持（勝手な改変・省略の完全禁止）:
   明示的な指示がない限り、すでに正常に動作している機能、データ更新・連携ロジック、アルゴリズム、デザイン、内部処理を、AI側の独断で「削除・簡略化・代替・省略」してはならない（「軽量化」「最適化」「リファクタリング」を名目とした勝手な機能削除も固く禁ずる）。
2. 関数の欠落防止とイベント照合:
   HTML側のすべてのボタンやUI要素（onclickやイベントリスナー）に対応する関数が、JavaScript側に1つ残らず存在するか必ず照合すること。
3. コード省略の厳格禁止:
   コードブロック内での「// ... 既存コード ...」や「// 既存の関数」等のコメントによる省略は構文エラーとして一切禁止する。必ずファイルの先頭から末尾まで完全に動作するコードを出力すること。
4. ドキュメント・ガイドの不可侵:
   マニュアルや仕様書、ガイド等を更新する際は、既存の記載内容を勝手に圧縮・削除せず、差分追記原則に従うこと。

【重要：バージョン管理とファイル出力の絶対ルール（代表ファイル1箇所集中）】
1. バージョン番号の管理は、プログラムごとに定められた【代表ファイル1箇所のみ】で行うこと。
   ・Chrome拡張機能: manifest.json の "version" のみ
   ・Webアプリケーション: index.html（画面右下・フッター等のバージョン表示部）のみ
   ・その他のファイル（JavaScript、CSS、サブHTML等）には、バージョン番号を書かない（ヘッダーコメント等でのバージョン記載は不要）。
2. バージョン更新のためだけの無意味なファイル出力は固く禁ずる。
   ロジック・仕様・デザインが実際に修正されたファイルだけを出力すること。修正のないファイルは「ファイル名 (修正なし)」とだけ表示し、コードブロックは絶対に出力しないこと。

【Gemini API連携モデルの厳格固定】
システム内でGemini APIのモデルを指定・実装・提案する際は、必ず以下の2モデルのみを使用すること。
① 第1優先（主軸）: gemini-3.5-flash-lite
② 第2優先（タイムアウト等バックアップ）: gemini-flash-lite-latest
※旧世代モデル（1.5系、2.0系、2.5系）はGoogle側で廃止・404エラーとなるため完全禁止とする。
※gemini-3.8-flash はクォータ消費が激しいため、ユーザーから明示的な指示・承諾がない限り使用禁止とする。

【ファイル出力ルール】
1. 承認後のコード出力:
   - 承認を得て全コードを出力する際は、原則として「1ファイルずつ」出力すること。
   - 修正がある場合:
     1行目に「ファイル名 (修正あり)」とだけ表記し、直後に \`\`\`言語名 でコードブロックを開始して全コードを出力すること。
   - 修正がない場合:
     「ファイル名 (修正なし)」とだけ表示し、コードブロックは出力しないこと。
2. UI崩れ・ボタン消失・Citations防止（重要）:
   - コードブロックを出力した後は、その末尾に挨拶、ステータス解説、まとめ等の後続テキストを一切記述せず、コードブロックを閉じた時点で回答を完全終了すること（解説や報告は、コード出力前の事前提案フェーズですべて完了させておくこと）。`;

// === グローバル状態管理 (State) ===
let accountsData = createInitialAccounts();
let programsData = defaultPrograms;
let knowledgeLogsData = [];
let dailyProgUsageData = {};
let tokenTransactionLogsData = []; // 🧾 直近トークン増分レシートログ
let systemInstructionTemplate = defaultCommonSystemInstruction;
let selectedSysinstProgId = "prog_1";
let apiConfig = {
  githubToken: "",
  geminiApiKey: "",
  geminiModelName: "gemini-3.5-flash-lite"
};

let selectedKnowledgeFilter = "ALL";
let currentPeriod = "today";
let isDataLoaded = false;
let currentTargetProg = null;
let currentTargetPlan = null;
let currentPlanVerType = "minor";
let loadedLocalFiles = [];
let currentTriageData = null;
let tokenCorrectTargetId = null;
let pendingPushPayload = null;

const openedPlanIds = new Set();
const openedInboxProgIds = new Set();

let systemSourceCodeBundle = "";

// === 共通ユーティリティ ===
function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeParseJson(rawText) {
  if (!rawText) return null;
  let text = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(text);
  } catch (err1) {
    try {
      const sanitized = text.replace(/[\r\n]+/g, '\\n');
      return JSON.parse(sanitized);
    } catch (err2) {
      console.warn("safeParseJson failed:", err1, "RawText:", rawText);
      return null;
    }
  }
}

// リポジトリ名入力値の完全正規化（URL形式や前後の空白・.gitを自動除去して owner/repo に整流化）
function cleanRepoFullName(rawStr) {
  if (!rawStr) return "";
  let clean = rawStr.trim();
  clean = clean.replace(/^https?:\/\/github\.com\//i, '');
  clean = clean.replace(/^git@github\.com:/i, '');
  clean = clean.replace(/\.git$/i, '');
  clean = clean.replace(/^\/+|\/+$/g, '');
  const parts = clean.split('/');
  if (parts.length >= 2) {
    return `${parts[0].trim()}/${parts[1].trim()}`;
  }
  return clean;
}

function getPureJstDateString(epochMs) {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const jstDate = new Date(epochMs + JST_OFFSET_MS);
  const y = jstDate.getUTCFullYear();
  const m = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jstDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayResetDateKey() {
  const nowMs = Date.now();
  const targetMs = nowMs - (17 * 60 * 60 * 1000);
  return getPureJstDateString(targetMs);
}

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

function updateAppVersionBadge() {
  const badgeEl = document.getElementById("appVersionBadge");
  if (!badgeEl) return;
  const p1 = programsData.find(p => p.id === "prog_1");
  const actualVer = (p1 && p1.version) ? p1.version : APP_DEFAULT_VERSION;
  badgeEl.innerText = actualVer;
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

function calculateNextVersion(currentVerStr, type = "minor") {
  const clean = (currentVerStr || "v1.0.0").replace(/^v/i, "");
  const parts = clean.split(".").map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);

  let [major, minor, patch] = parts;

  if (type === "patch") {
    patch += 1;
  } else if (type === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else {
    minor += 1;
    patch = 0;
  }

  return `v${major}.${minor}.${patch}`;
}

async function loadFullExtensionSourceCode() {
  if (systemSourceCodeBundle) return systemSourceCodeBundle;

  const files = ["manifest.json", "display.html", "background.js", "content.js", "app_core.js", "app_ui.js", "app_concierge.js"];
  const loaded = [];

  for (const filename of files) {
    try {
      const url = chrome.runtime.getURL(filename);
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        loaded.push(`=== FILE: ${filename} ===\n${text}`);
      }
    } catch (e) {
      console.warn(`ソースコード読み込みスキップ: ${filename}`, e);
    }
  }

  systemSourceCodeBundle = loaded.join("\n\n");
  return systemSourceCodeBundle;
}

function resolveCanonicalProgram(item) {
  const existing = programsData.find(p => p.id === item.programId);
  if (existing) return existing;

  const textToScan = `${item.programName || ''} ${item.title || ''} ${item.summary || ''}`.toLowerCase();

  const prefixMatch = (item.programName || '').match(/^0?([1-9]|10)_/);
  if (prefixMatch) {
    const num = parseInt(prefixMatch[1], 10);
    const target = programsData.find(p => p.id === `prog_${num}`);
    if (target) return target;
  }

  if (textToScan.includes("将棋") || textToScan.includes("王将") || textToScan.includes("駒")) return programsData.find(p => p.id === "prog_5");
  if (textToScan.includes("クロちゃん") || textToScan.includes("ペット") || textToScan.includes("voicevox")) return programsData.find(p => p.id === "prog_6");
  if (textToScan.includes("オセロ") || textToScan.includes("リバーシ") || textToScan.includes("盤面")) return programsData.find(p => p.id === "prog_7");
  if (textToScan.includes("大富豪") || textToScan.includes("royal card") || textToScan.includes("トランプ")) return programsData.find(p => p.id === "prog_8");
  if (textToScan.includes("健康") || textToScan.includes("バイタル") || textToScan.includes("カロリー") || textToScan.includes("栄養")) return programsData.find(p => p.id === "prog_9");
  if (textToScan.includes("思考構造化") || textToScan.includes("発射台") || textToScan.includes("thinking studio")) return programsData.find(p => p.id === "prog_2");
  if (textToScan.includes("wish") || textToScan.includes("action コックピット") || textToScan.includes("懸案")) return programsData.find(p => p.id === "prog_3");
  if (textToScan.includes("spec studio") || textToScan.includes("設計書") || textToScan.includes("マニュアル自動生成")) return programsData.find(p => p.id === "prog_4");
  if (textToScan.includes("studio マネージャー") || textToScan.includes("マネージャー") || textToScan.includes("拡張機能") || textToScan.includes("idモニター")) return programsData.find(p => p.id === "prog_1");

  return programsData.find(p => p.id === "prog_10") || programsData[0];
}

// 🛡️ 履歴・プログラム同期および【99番安全削除 ＆ 10番統合 ＆ 未分類タスクのゼロクリア】エンジン
function cleanupAndMigrateSaveHistory() {
  let hasChanges = false;

  function extractPrefixNum(nameStr) {
    const match = (nameStr || "").match(/^0?(\d{1,2})_/);
    return match ? String(parseInt(match[1], 10)).padStart(2, '0') : null;
  }

  if (!Array.isArray(programsData) || programsData.length === 0) {
    programsData = JSON.parse(JSON.stringify(defaultPrograms));
    chrome.storage.local.set({ programs: programsData });
    return;
  }

  // === 🧹 【99_共通部品・ツール群】の検出と安全マイグレーション ===
  const target99Index = programsData.findIndex(p => 
    p.name.includes("99_共通部品") || 
    p.name.startsWith("99_") || 
    (p.name.includes("共通部品") && p.id !== "prog_10" && p.id.startsWith("prog_17"))
  );

  let target99Id = null;
  if (target99Index !== -1) {
    target99Id = programsData[target99Index].id;
    programsData.splice(target99Index, 1);
    hasChanges = true;
  }

  let prog10 = programsData.find(p => p.id === "prog_10");
  if (!prog10) {
    prog10 = JSON.parse(JSON.stringify(defaultPrograms[9]));
    programsData.push(prog10);
    hasChanges = true;
  }

  // === 📊 日次集計データ（dailyProgUsage）のクリーンアップ ===
  if (dailyProgUsageData && typeof dailyProgUsageData === "object") {
    let usageChanged = false;
    Object.keys(dailyProgUsageData).forEach(dateKey => {
      const usageForDate = dailyProgUsageData[dateKey];
      if (usageForDate && typeof usageForDate === "object") {
        if (target99Id && usageForDate[target99Id]) {
          const val99 = usageForDate[target99Id] || 0;
          usageForDate["prog_10"] = (usageForDate["prog_10"] || 0) + val99;
          delete usageForDate[target99Id];
          usageChanged = true;
        }
        if (usageForDate["prog_unassigned"]) {
          delete usageForDate["prog_unassigned"];
          usageChanged = true;
        }
      }
    });

    if (usageChanged) {
      chrome.storage.local.set({ dailyProgUsage: dailyProgUsageData });
    }
  }

  for (let i = 1; i <= 4; i++) {
    const acc = accountsData[i];
    if (acc && target99Id && acc.currentProgramId === target99Id) {
      acc.currentProgramId = "prog_10";
      hasChanges = true;
    }
  }

  let knowledgeUpdated = false;
  knowledgeLogsData.forEach(log => {
    if (target99Id && log.programId === target99Id) {
      log.programId = "prog_10";
      log.programName = prog10.name;
      knowledgeUpdated = true;
    }
  });

  const oldIdToCanonicalIdMap = {};

  defaultPrograms.forEach(dp => {
    const dpPrefix = extractPrefixNum(dp.name);
    const existingIndex = programsData.findIndex(p => {
      const pPrefix = extractPrefixNum(p.name);
      return (pPrefix && pPrefix === dpPrefix) || p.id === dp.id;
    });

    if (existingIndex === -1) {
      programsData.push(JSON.parse(JSON.stringify(dp)));
      hasChanges = true;
    } else {
      const current = programsData[existingIndex];

      if (current.id !== dp.id && !programsData.some(p => p.id === dp.id)) {
        oldIdToCanonicalIdMap[current.id] = dp.id;
        current.id = dp.id;
        hasChanges = true;
      }

      if (current.isWebPublish === undefined) { current.isWebPublish = dp.isWebPublish; hasChanges = true; }
      if (!current.files && dp.files) { current.files = dp.files; hasChanges = true; }
      if (!current.customInstruction && dp.customInstruction) { current.customInstruction = dp.customInstruction; hasChanges = true; }
      if (!Array.isArray(current.inboxNotes)) { current.inboxNotes = []; hasChanges = true; }
      if (!Array.isArray(current.saveHistory)) { current.saveHistory = dp.saveHistory || []; hasChanges = true; }
      if (!Array.isArray(current.enhancePlans)) { current.enhancePlans = dp.enhancePlans || []; hasChanges = true; }

      if (current.saveHistory && current.saveHistory.length > 0) {
        const latestSaved = current.saveHistory[0].version;
        if (latestSaved && current.version !== latestSaved) {
          current.version = latestSaved;
          hasChanges = true;
        }
      }
    }
  });

  knowledgeLogsData.forEach(log => {
    if (oldIdToCanonicalIdMap[log.programId]) {
      log.programId = oldIdToCanonicalIdMap[log.programId];
      knowledgeUpdated = true;
    }
    const isMapped = programsData.some(p => p.id === log.programId);
    if (!isMapped || log.programId === "prog_unassigned") {
      const targetProg = resolveCanonicalProgram(log);
      if (targetProg) {
        log.programId = targetProg.id;
        log.programName = targetProg.name;
        knowledgeUpdated = true;
      }
    }
  });

  if (knowledgeUpdated) {
    chrome.storage.local.set({ knowledgeLogs: knowledgeLogsData });
  }

  for (let i = 1; i <= 4; i++) {
    const acc = accountsData[i];
    if (acc && acc.currentProgramId) {
      if (oldIdToCanonicalIdMap[acc.currentProgramId]) {
        acc.currentProgramId = oldIdToCanonicalIdMap[acc.currentProgramId];
        hasChanges = true;
      }
    }
  }

  if (hasChanges) {
    chrome.storage.local.set({ programs: programsData, accounts: accountsData });
  }
}

function calculateAggregatedTokens() {
  const nowMs = Date.now();
  const todayKey = getTodayResetDateKey();

  const keys7Days = new Set();
  const keys30Days = new Set();

  for (let i = 0; i < 7; i++) {
    const dMs = nowMs - (i * 24 * 60 * 60 * 1000) - (17 * 60 * 60 * 1000);
    keys7Days.add(getPureJstDateString(dMs));
  }
  for (let i = 0; i < 30; i++) {
    const dMs = nowMs - (i * 24 * 60 * 60 * 1000) - (17 * 60 * 60 * 1000);
    keys30Days.add(getPureJstDateString(dMs));
  }

  const progTotals = {};
  programsData.forEach(p => { progTotals[p.id] = 0; });
  progTotals["prog_unassigned"] = 0;

  const allRecordedDates = Object.keys(dailyProgUsageData || {}).sort();

  allRecordedDates.forEach(dateKey => {
    let isTarget = false;
    if (currentPeriod === "today" && dateKey === todayKey) isTarget = true;
    if (currentPeriod === "week" && keys7Days.has(dateKey)) isTarget = true;
    if (currentPeriod === "month" && keys30Days.has(dateKey)) isTarget = true;
    if (currentPeriod === "total") isTarget = true;

    if (isTarget) {
      const usageForDate = dailyProgUsageData[dateKey] || {};
      for (const [progId, tk] of Object.entries(usageForDate)) {
        if (progTotals[progId] === undefined) progTotals[progId] = 0;
        progTotals[progId] += (tk || 0);
      }
    }
  });

  let descText = "";
  const d7Start = Array.from(keys7Days)[keys7Days.size - 1] || todayKey;
  const d30Start = Array.from(keys30Days)[keys30Days.size - 1] || todayKey;
  const totalStart = allRecordedDates.length > 0 ? allRecordedDates[0] : todayKey;

  if (currentPeriod === "today") {
    descText = `📅 集計期間: 本日 17:00 〜 現在までの稼働実績 (リアルタイム)`;
  } else if (currentPeriod === "week") {
    descText = `📅 集計期間: 過去7日間 (${d7Start.substring(5)} 〜 ${todayKey.substring(5)}) の実測実績`;
  } else if (currentPeriod === "month") {
    descText = `📅 集計期間: 過去30日間 (${d30Start.substring(5)} 〜 ${todayKey.substring(5)}) の実測実績`;
  } else if (currentPeriod === "total") {
    descText = `📅 集計期間: 集計開始日 (${totalStart}) 〜 現在までの全累計実績`;
  }

  return { totals: progTotals, desc: descText };
}

// === 💾 データ保護・完全バックアップ＆復元（エクスポート / インポート） ===
function exportFullBackupData() {
  chrome.storage.local.get(null, (allData) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const filename = `studio_manager_backup_${y}-${m}-${d}.json`;

    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function importFullBackupData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== "object") {
      throw new Error("バックアップファイルの形式が不正です。");
    }

    if (!confirm("⚠️ 【確認】現在のすべてのデータが、選択したバックアップファイルの内容で上書きされます。\n\n復元を実行してもよろしいですか？")) {
      return;
    }

    chrome.storage.local.clear(() => {
      chrome.storage.local.set(data, () => {
        alert("🎉 バックアップファイルから全データを完全復元しました！\n画面を再読み込みして最新状態を反映します。");
        location.reload();
      });
    });
  } catch (err) {
    alert(`❌ 復元に失敗しました: ${err.message}`);
  }
}

// === 🐙 GitHubから全プログラムのバージョン・履歴を一括自動同期復元（完全堅牢版） ===
async function restoreAllProgramsFromGitHub() {
  const tokenInput = document.getElementById("githubToken");
  const currentToken = (tokenInput && tokenInput.value.trim()) || apiConfig.githubToken;

  if (!currentToken) {
    throw new Error("GitHub Tokenが未設定です。「⚙️ 設定」タブの共通API設定欄にトークンを入力してください。");
  }
  apiConfig.githubToken = currentToken;

  // 1. 画面テーブル上の入力欄から、最新のプログラム名・リポジトリ名を直接取り込んで即時反映
  const masterRows = document.querySelectorAll("#masterTableBody tr");
  masterRows.forEach(row => {
    const nameInput = row.querySelector(".master-name");
    const repoInput = row.querySelector(".master-repo");
    const progId = nameInput ? nameInput.dataset.id : null;
    if (progId) {
      const p = programsData.find(item => item.id === progId);
      if (p) {
        if (nameInput && nameInput.value.trim()) p.name = nameInput.value.trim();
        if (repoInput) p.githubRepo = cleanRepoFullName(repoInput.value);
      }
    }
  });

  const reportLines = [];
  let successCount = 0;

  for (const prog of programsData) {
    let repoFullName = cleanRepoFullName(prog.githubRepo);

    if (!repoFullName) {
      reportLines.push(`⚪ 【${prog.name}】: リポジトリ未設定のためスキップ`);
      continue;
    }

    prog.githubRepo = repoFullName;
    const [owner, repo] = repoFullName.split("/");

    if (!owner || !repo) {
      reportLines.push(`⚠️ 【${prog.name}】: リポジトリ名形式が不正 (${repoFullName})`);
      continue;
    }

    let restored = false;

    // ① README.md からの Change Log 解析
    let readmeText = await fetchOldFileFromGitHub(repoFullName, "README.md");
    if (!readmeText) readmeText = await fetchOldFileFromGitHub(repoFullName, "readme.md");

    if (readmeText && readmeText.includes("## 📝 更新履歴 (Change Log)")) {
      const parsedHistory = parseChangeLogFromReadme(readmeText);
      if (parsedHistory.length > 0) {
        prog.saveHistory = parsedHistory;
        prog.version = parsedHistory[0].version || prog.version;
        prog.lastCommit = parsedHistory[0].commitMsg || prog.lastCommit;
        reportLines.push(`✅ 【${prog.name}】: READMEから復元 ➜ ${prog.version} (履歴 ${parsedHistory.length}件)`);
        successCount++;
        restored = true;
      }
    }

    // ② READMEに履歴がない場合は、Gitコミットログ（最新30件）からバージョンと履歴を再構築
    if (!restored) {
      try {
        const commitsUrl = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`;
        const commitsRes = await fetch(commitsUrl, {
          headers: {
            "Authorization": `token ${apiConfig.githubToken}`,
            "Accept": "application/vnd.github.v3+json"
          }
        });

        if (commitsRes.ok) {
          const commits = await commitsRes.json();
          if (Array.isArray(commits) && commits.length > 0) {
            const rebuiltHistory = [];
            let latestFoundVer = null;

            for (const c of commits) {
              const rawMsg = c.commit?.message || "";
              const firstLine = rawMsg.split("\n")[0] || "";
              const bodyLines = rawMsg.split("\n").slice(1).join("\n").trim();
              const verMatch = firstLine.match(/v\d+\.\d+(\.\d+)?/i);
              const verStr = verMatch ? verMatch[0] : (latestFoundVer || "v1.0.0");
              if (verMatch && !latestFoundVer) latestFoundVer = verMatch[0];

              const d = new Date(c.commit?.author?.date || Date.now());
              const dStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

              rebuiltHistory.push({
                version: verStr,
                timestamp: d.getTime(),
                dateStr: dStr,
                commitMsg: firstLine,
                summary: bodyLines || firstLine
              });
            }

            prog.saveHistory = rebuiltHistory;
            prog.version = latestFoundVer || rebuiltHistory[0].version || prog.version || "v1.0.0";
            prog.lastCommit = rebuiltHistory[0].commitMsg;
            reportLines.push(`✅ 【${prog.name}】: コミットログから復元 ➜ ${prog.version} (履歴 ${rebuiltHistory.length}件)`);
            successCount++;
            restored = true;
          } else {
            reportLines.push(`⚠️ 【${prog.name}】: リポジトリ (${repoFullName}) にコミットがありません`);
          }
        } else {
          reportLines.push(`❌ 【${prog.name}】: GitHubアクセス失敗 (HTTP ${commitsRes.status}: ${repoFullName})`);
        }
      } catch (err) {
        reportLines.push(`❌ 【${prog.name}】: 通信エラー (${err.message})`);
      }
    }
  }

  // ストレージへの完全保存と全UIコンポーネントの強制再描画
  chrome.storage.local.set({ programs: programsData, apiConfig });
  updateAppVersionBadge();
  renderProgramDashboard();
  renderMasterSettings();
  if (typeof setupCards === "function") setupCards();
  if (typeof updateCardValues === "function") updateCardValues();

  // 完全なレポートダイアログを表示
  const summaryMsg = `🎉 【GitHub同期復元レポート】\n対象プログラム: 全${programsData.length}件中、${successCount}件の復元に成功しました。\n\n` + reportLines.join("\n");
  alert(summaryMsg);
}

function parseChangeLogFromReadme(readmeContent) {
  const history = [];
  const logSection = readmeContent.split("## 📝 更新履歴 (Change Log)")[1];
  if (!logSection) return history;

  const entries = logSection.split("---");
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/###\s*\[([^\]]+)\]\s*\[([^\]]+)\]\s*([^\n]+)/);
    if (headerMatch) {
      const dateStr = headerMatch[1].trim();
      const version = headerMatch[2].trim();
      const commitMsg = headerMatch[3].trim();
      const summaryPart = trimmed.substring(headerMatch[0].length).trim();

      history.push({
        version: version,
        timestamp: Date.now(),
        dateStr: dateStr,
        commitMsg: commitMsg,
        summary: summaryPart
      });
    }
  }
  return history;
}

// === 💬 アイデア壁打ち（第1段階の頭の整理：自然言語要件化アシスタント） ===
async function runInitialSparring(prog, noteText) {
  const model = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiConfig.geminiApiKey}`;

  const currentVer = prog.version || "v1.0.0";
  const nextMinor = calculateNextVersion(currentVer, "minor");
  const nextPatch = calculateNextVersion(currentVer, "patch");

  const prompt = `あなたはプロのアジャイルプロダクトマネージャー兼テクニカルライターです。
開発者が思いついた【アイデアの卵（殴り書きメモ）】を読み解き、第1段階の頭の整理（タイトル言語化と要件の箇条書き）を行ってください。

【対象プログラム】: ${prog.name} (現在稼働Ver: ${currentVer})
【固有要件・方針】: ${prog.customInstruction || 'なし'}
【アイデアの卵（元のメモ）】:
${noteText}

【厳格な指示（絶対遵守）】
1. ソースコードの内部関数や実装技術をでっち上げて講釈しないでください（コード実体はAI Studioで扱います）。
2. プログラミング用語やシステム用語を使わず、ユーザーが体験する「目的」と「使い勝手の要望」だけを整理してください。
3. タイトルは40文字以内で、何をする機能かがひと目でわかる日本語にしてください。
4. 難易度や工数見積もりは一切出力しないでください。
5. 以下のJSONフォーマットのみを出力してください。

{
  "suggestedTitle": "40文字以内のスッキリした計画タイトル",
  "targetVer": "${nextMinor}" または "${nextPatch}",
  "aiMessage": "💡 要約・スコープ整理:\n・【この機能の目的】: （1〜2行で簡潔に）\n・【実装したい具体的な要件】:\n  1. ...\n  2. ...\n・【今回の判断（安全策）】: （手戻りを避けるため、今回は見送るべき点や注意点など）\n\nこれでよろしければ下の「正式計画へ昇格」を押してください。調整したい点があればご返信ください。"
}
`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
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
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  const parsed = safeParseJson(rawText);

  if (parsed && parsed.suggestedTitle && parsed.aiMessage) {
    return parsed;
  }

  return {
    suggestedTitle: noteText.substring(0, 35),
    targetVer: nextMinor,
    aiMessage: `💡 要約: ${noteText.substring(0, 50)}...\n\n🎯 今回やるべきことと見送ることを整理して計画へ昇格しましょう！`
  };
}

async function continueSparringChat(prog, userReply) {
  const model = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiConfig.geminiApiKey}`;

  const prompt = `あなたはプロのアジャイルプロダクトマネージャーです。
開発者との壁打ち対話です。ユーザーの要望やチューニング指示に基づき、要件箇条書きを再調整し、必要ならタイトルやバージョンも更新してください。

【ユーザーからの指示】:
${userReply}

【厳格な指示】
以下のJSONフォーマットのみを出力してください。

{
  "updatedTitle": "調整後の計画タイトル（変更不要なら現在のタイトル）",
  "updatedVer": "推奨バージョン（変更不要なら現在のバージョン）",
  "aiMessage": "了解しました！ユーザーの要望を反映した要件整理（2〜4行で結論ファースト）。納得できたら「正式計画へ昇格」を押してください。"
}
`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
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
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  const parsed = safeParseJson(rawText);

  if (parsed) {
    return parsed;
  }

  return {
    updatedTitle: null,
    updatedVer: null,
    aiMessage: rawText || "了解しました！方針を更新しました。"
  };
}

// === ✨ AIアイデア交通整理・一括仕分け（Inboxメモの自動トリアージ） ===
async function runAiTriage(prog, notes) {
  if (!apiConfig.geminiApiKey) {
    throw new Error("Gemini APIキーが設定されていません。「⚙️ 設定」タブでAPIキーを設定してください。");
  }

  const model = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiConfig.geminiApiKey}`;

  const currentVer = prog.version || "v1.0.0";
  const activePlans = (prog.enhancePlans || []).filter(p => p.status !== "done");

  const notesListText = notes.map((n, i) => `[メモ${i + 1}] ID:${n.id} 内容: ${n.text}`).join("\n");
  const plansListText = activePlans.length > 0
    ? activePlans.map(p => `[既存計画 ID:${p.id}] Ver:${p.targetVer} タイトル:${p.title} 要件:${p.prompt || '未設定'}`).join("\n")
    : "（現在進行中のエンハンス計画はありません）";

  const prompt = `あなたはプロのシニアプロダクトマネージャーです。
開発者が思いつきで放り込んだ複数の【アイデアの卵・メモ】を分析し、
① 既存のエンハンス計画に追加すべきもの（マージ）
② まとめて新しい機能追加やバグ修正として計画化すべきもの（新規作成）
に分類・交通整理してください。

【対象プログラム】: ${prog.name} (稼働Ver: ${currentVer})
【固有設計方針】: ${prog.customInstruction || 'なし'}

【ストックされているメモ一覧】
${notesListText}

【現在登録されているエンハンス計画一覧】
${plansListText}

【厳格な指示】
以下のJSONフォーマットのみを出力してください。

{
  "suggestions": [
    {
      "action": "merge",
      "noteId": "対象のメモID",
      "targetPlanId": "合流先の既存計画ID",
      "reason": "合流を推奨する明確な理由（1行）",
      "appendToPlan": "既存計画のプロンプトに追記すべき箇条書き要件"
    },
    {
      "action": "create",
      "noteIds": ["まとめ対象のメモID1", "メモID2"],
      "verType": "minor" または "patch",
      "targetVer": "推奨バージョン（例: v1.1.0 または v1.0.1）",
      "title": "40文字以内のスッキリした新計画タイトル",
      "reason": "新規計画化を推奨する理由",
      "promptDraft": "■ 実装の目的:\\n...\\n\\n■ 具体的な実装要件:\\n・...",
      "costEstimate": "工数小" または "工数中"
    }
  ]
}
`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
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
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  const parsed = safeParseJson(rawText);

  if (parsed && Array.isArray(parsed.suggestions)) {
    return parsed;
  }

  const firstNote = notes[0];
  return {
    suggestions: [
      {
        action: "create",
        noteIds: [firstNote.id],
        verType: "minor",
        targetVer: calculateNextVersion(currentVer, "minor"),
        title: firstNote.text.substring(0, 30),
        reason: "単独の機能改善として新規計画化を推奨します。",
        promptDraft: `■ 実装の目的:\n${firstNote.text.substring(0, 30)}\n\n■ 具体的な実装要件:\n・${firstNote.text}`,
        costEstimate: "工数小"
      }
    ]
  };
}

// === ✨ AIでブレークダウン＆プロンプト自動起草（01〜10番完全統一・自然言語要件化） ===
async function generateBreakdownPromptWithAI(planTitle, targetVer = "次期版") {
  const model = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiConfig.geminiApiKey}`;

  const progName = currentTargetProg ? currentTargetProg.name : "対象プログラム";
  const customInst = currentTargetProg ? (currentTargetProg.customInstruction || "") : "";

  const prompt = `あなたはプロのシニアプロダクトマネージャー兼テクニカルライターです。
ユーザーがキーワードとして入力した【計画タイトル】について、予定バージョン【${targetVer}】に合わせて、AI Studioにそのまま貼り付けて開発を開始できる「目的と実装要件の箇条書き指示文」を作成してください。

【対象プログラム】: ${progName}
【計画タイトル】: ${planTitle}
【予定バージョン】: ${targetVer}
【固有要件・設計方針】: ${customInst || '特になし'}

【厳格な指示（絶対遵守）】
1. コード実体を知らない状態で、架空の関数名・変数名・HTML IDをでっち上げてプロンプトに盛り込むことは固く禁じます（ハルシネーションによるデグレード防止）。
2. プログラミングAIが手元のコードを見て正しく判断できるように、「この機能で何を達成したいか（目的）」と「画面や操作でどう振る舞うべきか（仕様要件）」を自然な日本語の箇条書きで明確に定義してください。
3. 難易度や想定時間の見積もりは出力しないでください。
4. 説明や前置きは出力せず、以下のフォーマットのみを出力してください。

■ 実装の目的:
（この改修で達成したいユーザー価値・利便性を1〜2行で簡潔に）

■ 具体的な実装要件:
1. （画面表示やUIに関する具体的な動作要件）
2. （データ処理や連携に関する具体的な動作要件）
3. （エラー時や例外時の安全な挙動に関する要件）
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

  return { prompt: text, advice: "" };
}

// === 🤖 AI着手優先度チェック（タイトル明記 ＆ 美しい構造化カード出力エンジン） ===
async function checkPlansPriorityWithAI(prog, plans) {
  if (!apiConfig.geminiApiKey) {
    throw new Error("Gemini APIキーが設定されていません。「⚙️ 設定」タブでAPIキーを設定してください。");
  }

  const model = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiConfig.geminiApiKey}`;

  const plansListText = plans.map((p, idx) => `[#${idx + 1}] [${p.targetVer || '次期版'}] タイトル:「${p.title}」 (種別: ${p.verType === 'patch' ? 'バグ修正' : '機能追加'})\n要件メモ: ${p.prompt || p.aiAdvice || 'なし'}`).join("\n\n");

  const prompt = `あなたはプロのシニアアジャイルプロダクトマネージャーです。
現在開発中のプログラム「${prog.name}」において、以下の複数のエンハンス計画（未着手）がストックされています。
機能スコープ、依存関係、手戻りの少なさ、ユーザー体験への影響の観点から、
① 各計画の明確な優先順位と「納得できる理由」
② 一緒にやるべき「まとめ提案（パッケージ化）」
③ 盛り込みすぎの計画に対する「小分け提案（分割）」
の3本柱でプロのアドバイスを提供してください。

【対象プログラム】: ${prog.name} (稼働Ver: ${prog.version || 'v1.0.0'})
【固有設計方針】: ${prog.customInstruction || 'なし'}

【診断対象の計画一覧】
${plansListText}

【厳格な指示（絶対遵守）】
1. 回答内では、単に「計画1」などと番号だけで呼ばず、必ず【#番号「タイトル名」】の形式でタイトルを明記してください（例: 【最優先】#1「メニュー追加・体系整理」）。
2. HTMLタグやMarkdown装飾記号は一切使わず、以下の日本語フォーマットに従ってプレーンテキストで出力してください。

■ 💡 推奨着手順序と明確な理由
1. 【最優先】#番号「タイトル名」: （不具合の早期解消、基盤機能の先行、手戻りの少なさなど納得できる根拠を2〜3行）
2. 【第2順位】#番号「タイトル名」: （根拠）
3. 【第3順位】#番号「タイトル名」: （根拠）

■ 📦 まとめ提案（パッケージ化・セット作業推奨）
・（関連する計画があれば「#1と#2は同一画面に関わるためセットで着手するのが効率的です」等。特になければ「特になし。1件ずつ独立して安全に着手可能です」）

■ ✂️ 小分け提案（分割・段階リリース推奨）
・（スコープが大きくリスクが高い計画があれば「#Xは一度にやらず、まず〇〇だけ先行してパッチ版にし、残りは次回に回すのが安全です」等。特になければ「特になし。現在の粒度で適切です」）

■ ⚠️ デグレード防止・手戻り回避の要点
・（開発時に特に注意すべきデグレード防止のコツを2行程度）
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
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  return formatPriorityResultToHtml(rawText);
}

function formatPriorityResultToHtml(rawText) {
  if (!rawText) return `<div class="priority-section-card">診断結果が取得できませんでした。</div>`;

  const rankingMatch = rawText.match(/■\s*💡\s*推奨着手順序[^\n]*([\s\S]*?)(?=■\s*📦\s*まとめ提案|$)/i);
  const bundleMatch = rawText.match(/■\s*📦\s*まとめ提案[^\n]*([\s\S]*?)(?=■\s*✂️\s*小分け提案|$)/i);
  const splitMatch = rawText.match(/■\s*✂️\s*小分け提案[^\n]*([\s\S]*?)(?=■\s*⚠️\s*デグレード防止|$)/i);
  const warningMatch = rawText.match(/■\s*⚠️\s*デグレード防止[^\n]*([\s\S]*?)$/i);

  const rankingText = rankingMatch ? rankingMatch[1].trim() : "";
  const bundleText = bundleMatch ? bundleMatch[1].trim() : "";
  const splitText = splitMatch ? splitMatch[1].trim() : "";
  const warningText = warningMatch ? warningMatch[1].trim() : "";

  const rankingRows = rankingText.split("\n").filter(l => l.trim().length > 0).map((line, idx) => {
    let badgeClass = "slate";
    let badgeLabel = `#${idx + 1}`;
    if (line.includes("最優先") || idx === 0) {
      badgeClass = "gold";
      badgeLabel = "🥇 最優先";
    } else if (line.includes("第2順位") || idx === 1) {
      badgeClass = "blue";
      badgeLabel = "🥈 第2順位";
    } else if (line.includes("第3順位") || idx === 2) {
      badgeClass = "slate";
      badgeLabel = "🥉 第3順位";
    }

    const cleanLine = line.replace(/^\d+[\.\:]\s*【[^】]+】\s*/, '').trim();
    return `
      <div class="priority-step-row">
        <span class="priority-step-badge ${badgeClass}">${badgeLabel}</span>
        <div style="flex: 1; color: #f8fafc;">${escapeHtml(cleanLine || line)}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="priority-section-card ranking">
      <div class="priority-section-header ranking">
        <span>🥇 推奨着手順序と明確な根拠</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${rankingRows || `<div style="font-size: 12px; color: #cbd5e1;">${escapeHtml(rankingText)}</div>`}
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;">
      <div class="priority-section-card bundle">
        <div class="priority-section-header bundle">
          <span>📦 まとめ提案（セット作業）</span>
        </div>
        <div style="font-size: 12px; line-height: 1.55; color: #cbd5e1; white-space: pre-wrap;">${escapeHtml(bundleText || '特になし')}</div>
      </div>

      <div class="priority-section-card split">
        <div class="priority-section-header split">
          <span>✂️ 小分け提案（段階リリース）</span>
        </div>
        <div style="font-size: 12px; line-height: 1.55; color: #cbd5e1; white-space: pre-wrap;">${escapeHtml(splitText || '特になし')}</div>
      </div>
    </div>

    ${warningText ? `
      <div class="priority-section-card warning">
        <div class="priority-section-header warning">
          <span>⚠️ デグレード防止・手戻り回避の要点</span>
        </div>
        <div style="font-size: 12px; line-height: 1.55; color: #fed7aa; white-space: pre-wrap;">${escapeHtml(warningText)}</div>
      </div>
    ` : ''}
  `;
}

// === 🛡️ GitHub事前チェック（プリフライト診断） ===
async function runPreflightInspection(prog, relVersion, files) {
  const issues = [];
  const fileNames = files.map(f => f.name);
  const cleanTargetVer = relVersion.replace(/^v/i, "");

  if (prog.isWebPublish) {
    const hasIndexHtml = fileNames.some(name => name.toLowerCase() === "index.html");
    if (!hasIndexHtml) {
      issues.push({
        type: "danger",
        badge: "⛔ 404エラー確定（Web公開）",
        title: "トップ画面となる「index.html」が含まれていません",
        desc: `【${prog.name}】は設定で「🌐 Web公開」が有効になっていますが、登録ファイルに index.html が見当たりません。\nこのままプッシュすると、GitHub Pages上で「404 Not Found」となりWeb画面が表示されなくなります。\n\n💡 対処法: メインのHTMLファイル名を「index.html」に変更して選択し直してください。`
      });
    }
  }

  files.forEach(f => {
    const hasFullWidth = /[^\u0000-\u007F]/.test(f.name);
    const hasSpace = /\s/.test(f.name);
    if (hasFullWidth || hasSpace) {
      issues.push({
        type: "danger",
        badge: "⛔ 不正ファイル名",
        title: `ファイル「${f.name}」に全角文字または空白が含まれています`,
        desc: `ファイル名に日本語（全角）やスペースが含まれていると、Gitの文字化けやURLエンコード事故（画像・スクリプト読込失敗）の原因になります。\n\n💡 対処法: 半角英数字・アンダースコア・ハイフンのみを使用した名前にリネームしてください。`
      });
    }
  });

  if (prog.id === "prog_1") {
    const manifestFile = files.find(f => f.name.toLowerCase() === "manifest.json");
    if (manifestFile && !manifestFile.isBase64 && manifestFile.content) {
      const match = manifestFile.content.match(/"version"\s*:\s*"([^"]+)"/);
      if (match) {
        const manifestVer = match[1];
        if (manifestVer !== cleanTargetVer) {
          issues.push({
            type: "danger",
            badge: "⛔ 代表ファイル バージョン不一致",
            title: `manifest.jsonのバージョン (${manifestVer}) とリリース予定 (${cleanTargetVer}) が一致していません`,
            desc: `Chrome拡張機能のバージョン管理は代表ファイル「manifest.json」で行います。\n今回登録しようとしているバージョン「${cleanTargetVer}」に合わせて manifest.json 内の "version" を修正してください。`
          });
        }
      }
    }
  } else if (prog.isWebPublish) {
    const indexFile = files.find(f => f.name.toLowerCase() === "index.html");
    if (indexFile && !indexFile.isBase64 && indexFile.content) {
      const verMatch = indexFile.content.match(/(?:id|class)=["'][^"']*(?:ver|version)[^"']*["'][^>]*>v?([0-9.]+)/i);
      if (verMatch) {
        const foundVer = verMatch[1];
        if (foundVer !== cleanTargetVer && foundVer !== relVersion) {
          issues.push({
            type: "warning",
            badge: "⚠️ 代表ファイル バージョン不一致の可能性",
            title: `index.html 内の画面表示バージョン (${foundVer}) がリリース予定 (${cleanTargetVer}) と異なります`,
            desc: `Webアプリの代表ファイル「index.html」内のバージョン表示が「${foundVer}」になっています。\n画面上のバージョン表記を「${relVersion}」に更新したかご確認ください。`
          });
        }
      }
    }
  }

  files.forEach(f => {
    const mbSize = (f.byteSize || 0) / (1024 * 1024);
    if (mbSize > 25) {
      issues.push({
        type: "warning",
        badge: "⚠️ 大容量ファイル",
        title: `ファイル「${f.name}」が 25MB (${mbSize.toFixed(1)} MB) を超えています`,
        desc: "GitHub Contents APIでは大容量ファイルのプッシュ時にタイムアウトが発生する場合があります。動画や巨大アセットは軽量化を推奨します。"
      });
    }
  });

  return issues;
}

function openPreflightModal(issues) {
  const overlay = document.getElementById("preflightModalOverlay");
  const container = document.getElementById("preflightIssuesContainer");
  container.innerHTML = "";

  issues.forEach(iss => {
    const card = document.createElement("div");
    card.className = `preflight-issue-card ${iss.type}`;
    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="preflight-badge ${iss.type}">${escapeHtml(iss.badge)}</span>
        <strong style="color: #f8fafc; font-size: 12.5px;">${escapeHtml(iss.title)}</strong>
      </div>
      <div style="font-size: 11.5px; color: #cbd5e1; line-height: 1.5; white-space: pre-wrap; margin-top: 4px;">${escapeHtml(iss.desc)}</div>
    `;
    container.appendChild(card);
  });

  overlay.classList.add("active");
}

function initPreflightModalHandlers() {
  const overlay = document.getElementById("preflightModalOverlay");
  const closeBtn = document.getElementById("closePreflightModalBtn");
  const cancelBtn = document.getElementById("cancelPreflightBtn");
  const proceedBtn = document.getElementById("proceedPushBtn");

  const closePreflight = () => {
    overlay.classList.remove("active");
    pendingPushPayload = null;
  };

  closeBtn.onclick = closePreflight;
  cancelBtn.onclick = closePreflight;

  proceedBtn.onclick = () => {
    if (pendingPushPayload) {
      const { owner, repo, repoInputVal, relVersion, commitMsg, summary } = pendingPushPayload;
      overlay.classList.remove("active");
      pendingPushPayload = null;
      proceedGitHubPush(owner, repo, repoInputVal, relVersion, commitMsg, summary);
    }
  };
}

// === GitHubセーブモーダル ＆ API通信 ===
function initModalHandlers() {
  const overlay = document.getElementById("saveModalOverlay");
  const dropzone = document.getElementById("dropzone");
  const fileSelector = document.getElementById("fileSelector");
  const closeBtn = document.getElementById("closeModalBtn");
  const cancelBtn = document.getElementById("cancelModalBtn");
  const executeBtn = document.getElementById("executePushBtn");
  const reGenBtn = document.getElementById("reGenerateSummaryBtn");

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

  executeBtn.onclick = executeGitHubPush;
  reGenBtn.onclick = analyzeDiffAndGenerateSummary;

  document.querySelectorAll(".btn-ver-quick").forEach(btn => {
    btn.onclick = (e) => {
      const type = e.target.dataset.type;
      const baseVer = currentTargetProg?.version || "v1.0.0";
      const nextVer = calculateNextVersion(baseVer, type);
      document.getElementById("modalReleaseVersionInput").value = nextVer;

      const commitInput = document.getElementById("commitMessageInput");
      if (commitInput.value) {
        commitInput.value = commitInput.value.replace(/^v\d+\.\d+(\.\d+)?:\s*/i, `${nextVer}: `);
      }
    };
  });
}

function openSaveModal(prog, plan = null) {
  currentTargetProg = prog;
  currentTargetPlan = plan;
  loadedLocalFiles = [];
  pendingPushPayload = null;

  const isInitial = (!prog.saveHistory || prog.saveHistory.length === 0);

  let defaultVersion = "v1.4.1";
  if (isInitial) {
    defaultVersion = "v1.0.0";
  } else if (plan) {
    defaultVersion = plan.targetVer || calculateNextVersion(prog.version || "v1.0.0", plan.verType || "minor");
  } else {
    defaultVersion = calculateNextVersion(prog.version || "v1.0.0", "patch");
  }

  const verLabel = document.getElementById("modalVersionLabel");
  const quickBtnGroup = document.getElementById("quickVerBtnGroup");

  if (isInitial) {
    document.getElementById("modalProgTitle").innerText = `🌱 【${prog.name}】を初回登録（v1.0.0）としてGitHubへセーブ`;
    verLabel.innerText = "🏷️ リリースバージョン (初回登録: v1.0.0 固定)";
    quickBtnGroup.style.display = "none";
  } else if (plan) {
    document.getElementById("modalProgTitle").innerText = `🚀 【${prog.name}】 計画「${plan.title}」をGitHubへセーブ`;
    verLabel.innerText = `🏷️ リリースバージョン (予定: ${defaultVersion})`;
    quickBtnGroup.style.display = "flex";
  } else {
    document.getElementById("modalProgTitle").innerText = `⚠️ 【${prog.name}】 計画外の緊急セーブ`;
    verLabel.innerText = `🏷️ リリースバージョン (稼働版: ${prog.version || 'v1.0.0'})`;
    quickBtnGroup.style.display = "flex";
  }

  document.getElementById("modalRepoInput").value = prog.githubRepo || "";
  document.getElementById("modalReleaseVersionInput").value = defaultVersion;
  document.getElementById("selectedFilesList").innerHTML = "";
  document.getElementById("commitMessageInput").value = plan ? `${defaultVersion}: ${plan.title}` : "";
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

  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.mp3', '.wav', '.ogg', '.m4a', '.zip', '.pdf'];
  const filesArray = Array.from(fileList);

  for (const file of filesArray) {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const isBinary = binaryExtensions.includes(ext);

    if (isBinary) {
      const base64Content = await readFileAsBase64(file);
      loadedLocalFiles.push({ name: file.name, content: base64Content, isBase64: true, byteSize: file.size });
      listEl.innerHTML += `<div>🖼️/🎵 ${file.name} (${(file.size / 1024).toFixed(1)} KB・バイナリ)</div>`;
    } else {
      const text = await readFileAsText(file);
      loadedLocalFiles.push({ name: file.name, content: text, isBase64: false, byteSize: file.size });
      listEl.innerHTML += `<div>📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB・テキスト)</div>`;
    }
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

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function analyzeDiffAndGenerateSummary() {
  const banner = document.getElementById("statusBanner");
  banner.className = "status-banner active";
  banner.innerText = `⏳ 前回コードを確認し、${apiConfig.geminiModelName || 'gemini-3.5-flash-lite'} で差分を要約中...`;

  const repo = document.getElementById("modalRepoInput").value.trim();
  const relVersion = document.getElementById("modalReleaseVersionInput").value.trim() || "v1.4.1";

  if (!apiConfig.githubToken || !repo) {
    banner.innerText = "⚠️ 上の入力欄に「対象リポジトリ名」、設定タブに「GitHubトークン」を入力してください。";
    return;
  }

  const isInitial = (!currentTargetProg?.saveHistory || currentTargetProg.saveHistory.length === 0);
  const planContext = isInitial
    ? `【開発の主目的（初回登録）】: ${currentTargetProg?.name} の初回リリース・ベース機能の登録 (${relVersion})`
    : (currentTargetPlan 
        ? `【開発の主目的（計画）】: [${currentTargetPlan.targetVer || relVersion}] ${currentTargetPlan.title}\n【要件指示】: ${currentTargetPlan.prompt || 'なし'}`
        : `【開発の主目的（計画外緊急）】: ${currentTargetProg?.name} の機能改修 (${relVersion})`);

  try {
    const diffs = [];
    for (const f of loadedLocalFiles) {
      if (f.isBase64) {
        diffs.push(`【アセットファイル(画像/音声): ${f.name}】（バイナリ更新）`);
        continue;
      }
      const oldCode = await fetchOldFileFromGitHub(repo, f.name);
      if (oldCode === null) {
        diffs.push(`【新規追加ファイル: ${f.name}】\n内容の一部:\n${f.content.substring(0, 500)}...`);
      } else if (oldCode !== f.content) {
        diffs.push(`【変更ファイル: ${f.name}】\n差分スニペット:\n${createSnippetDiff(oldCode, f.content)}`);
      }
    }

    const diffContext = diffs.join("\n\n");

    if (apiConfig.geminiApiKey) {
      banner.innerText = `🤖 ${apiConfig.geminiModelName} がユーザー視点で分かりやすい変更概要を作成中...`;
      const aiResult = await callGeminiAPI(diffContext, planContext, relVersion, isInitial);
      document.getElementById("commitMessageInput").value = aiResult.commitMessage;
      document.getElementById("changeSummaryArea").value = aiResult.summary;
    } else {
      document.getElementById("commitMessageInput").value = isInitial
        ? `${relVersion}: 初回リリース・基盤機能の実装`
        : (currentTargetPlan ? `${relVersion}: ${currentTargetPlan.title}` : `${relVersion}: ${currentTargetProg.name} の機能改修`);
      document.getElementById("changeSummaryArea").value = `■ 実装・登録された主要ファイル一覧:\n${loadedLocalFiles.map(f => `- ${f.name}`).join("\n")}\n\n※Gemini APIキーを設定すると、ユーザー視点の分かりやすい変更概要が自動起草されます。`;
    }

    banner.innerText = "✅ 差分解析と要約ドラフトの作成が完了しました！内容を確認・微調整してください。";
    document.getElementById("reGenerateSummaryBtn").style.display = "inline-block";
  } catch (err) {
    console.error(err);
    banner.innerText = `⚠️ 差分解析中にエラーが発生しました: ${err.message}`;
  }
}

async function fetchOldFileFromGitHub(repoFullName, path) {
  if (!repoFullName || !path) return null;
  const cleanRepo = cleanRepoFullName(repoFullName);
  const [owner, repo] = cleanRepo.split("/");
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

async function callGeminiAPI(diffText, planContext, relVersion, isInitial = false) {
  const model = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiConfig.geminiApiKey}`;

  const prompt = `あなたはプロのシニアプロダクトマネージャー兼テクニカルライターです。
開発者が立てた【開発の主目的（計画）】と、変更された【コード差分】を熟読し、システムを利用するエンドユーザーやプロダクト責任者がひと目で理解できる、分かりやすく魅力的な日本語の変更概要（Change Log）を作成してください。

【厳格な禁止事項（絶対遵守）】
1. 内部ファイル名（例: KK_Dashboard.html, index.html, main.js, styles.css, manifest.json等）は絶対に出力しないでください。「画面」「入力パネル」「ダッシュボード」「操作部」などの自然な日本語に置き換えてください。
2. 開発ライブラリ名や技術用語（例: Chart.js, canvas-confetti, CDN, CSSスタイル定義, DOM操作, API連携等）は絶対に出力しないでください。「推移グラフ」「アニメーション演出」「洗練されたデザイン」「リアルタイムデータ同期」などのユーザーが得られる機能価値・体験に置き換えてください。
3. 英語のJSON記号やキー名（{, }, commitMessage, feat: など）は一切含めないでください。

【出力フォーマット】
1行目: ${relVersion}: [1行の分かりやすいコミットメッセージ（必ず先頭にバージョン番号を含める）]
2行目以降: 「・」で始まる変更点の箇条書き（3〜5項目）

【内容の記述ルール】
${isInitial ? `
■ 初回リリース（v1.0.0）の場合:
・「〜を新規作成しました」「〜を導入しました」という開発者視点の報告ではなく、「このシステムを使うことで何ができるのか」「どんな健康体験・ゲーム体験・便利さがあるのか」というコア機能やユーザーメリットを中心に記述してください。
・日常使いでの安心感や、今後の拡張性に触れた前向きな文言を含めてください。
` : `
■ バージョンアップ（機能改修・機能追加）の場合:
・「元々あった機能から、何がどう便利になったのか（ビフォーアフターの変化）」を具体的に記述してください。
・新しく追加された機能の魅力や、不具合修正による操作感・安心感の向上を分かりやすく伝えてください。
`}

${planContext}

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
    .trim();

  const lines = rawText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  let commitMsg = lines[0] || `${relVersion}: 機能改修`;
  if (!commitMsg.startsWith(relVersion)) {
    commitMsg = `${relVersion}: ${commitMsg}`;
  }
  const summary = lines.slice(1).join("\n") || lines[0] || "・各種機能の実装および使いやすさの向上";

  return {
    commitMessage: commitMsg.replace(/^["'・\s]+|["'\s]+$/g, ''),
    summary: summary
  };
}

async function executeGitHubPush() {
  const repoInputVal = document.getElementById("modalRepoInput").value.trim();
  const relVersion = document.getElementById("modalReleaseVersionInput").value.trim() || "v1.4.1";
  const commitMsg = document.getElementById("commitMessageInput").value.trim();
  const summary = document.getElementById("changeSummaryArea").value.trim();

  if (!repoInputVal || !commitMsg || loadedLocalFiles.length === 0) {
    alert("必須項目（リポジトリ名、コミットメッセージ、ファイル選択）を確認してください。");
    return;
  }

  const cleanRepo = cleanRepoFullName(repoInputVal);
  const [owner, repo] = cleanRepo.split("/");
  if (!owner || !repo) {
    alert("リポジトリ名の形式が不正です（例: user/repo または https://github.com/user/repo）。");
    return;
  }

  if (currentTargetProg) {
    const issues = await runPreflightInspection(currentTargetProg, relVersion, loadedLocalFiles);
    if (issues.length > 0) {
      pendingPushPayload = { owner, repo, repoInputVal: cleanRepo, relVersion, commitMsg, summary };
      openPreflightModal(issues);
      return;
    }
  }

  proceedGitHubPush(owner, repo, cleanRepo, relVersion, commitMsg, summary);
}

async function proceedGitHubPush(owner, repo, repoInputVal, relVersion, commitMsg, summary) {
  const banner = document.getElementById("statusBanner");
  banner.className = "status-banner active";
  banner.innerText = "🚀 GitHubへ接続中...";

  if (currentTargetProg) {
    currentTargetProg.githubRepo = repoInputVal;
  }

  try {
    await ensureRepositoryExists(owner, repo);

    const now = new Date();
    const dateFormatted = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newLogEntry = `### [${dateFormatted}] [${relVersion}] ${commitMsg}\n\n${summary}\n\n---\n`;

    let oldReadme = await fetchOldFileFromGitHub(repoInputVal, "README.md") || "";
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
    const allFilesToPush = [...filteredFiles, { name: "README.md", content: updatedReadme, isBase64: false }];

    banner.innerText = `📦 ファイル群をコミット中 (全 ${allFilesToPush.length} ファイル)...`;
    for (const file of allFilesToPush) {
      await pushSingleFileToGitHub(owner, repo, file.name, file.content, commitMsg, file.isBase64);
    }

    if (!currentTargetProg.saveHistory) currentTargetProg.saveHistory = [];
    currentTargetProg.saveHistory.unshift({
      version: relVersion,
      timestamp: now.getTime(),
      dateStr: dateFormatted,
      commitMsg: commitMsg,
      summary: summary
    });

    currentTargetProg.lastCommit = commitMsg;
    currentTargetProg.version = relVersion;
    currentTargetProg.files = loadedLocalFiles.map(f => f.name).join(", ");

    if (currentTargetPlan) {
      currentTargetPlan.status = "done";
      openedPlanIds.delete(currentTargetPlan.id);
    } else if (currentTargetProg.enhancePlans) {
      const matchPlan = currentTargetProg.enhancePlans.find(p => p.targetVer === relVersion && p.status !== "done");
      if (matchPlan) {
        matchPlan.status = "done";
        openedPlanIds.delete(matchPlan.id);
      }
    }

    chrome.storage.local.set({ programs: programsData });
    renderProgramDashboard();

    banner.innerText = "🎉 GitHubへのプッシュが正常に完了しました！";
    setTimeout(() => {
      document.getElementById("saveModalOverlay").classList.remove("active");
      alert(`✅ GitHubへのセーブが完了しました！\nリポジトリ: ${owner}/${repo}\nバージョン: ${relVersion}\nコミット: ${commitMsg}\n（対象計画は完了としてChange Logへ昇格しました）`);
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

async function pushSingleFileToGitHub(owner, repo, path, content, commitMessage, isAlreadyBase64 = false) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  let sha = undefined;
  const getRes = await fetch(url, { headers: { "Authorization": `token ${apiConfig.githubToken}`, "Accept": "application/vnd.github.v3+json" } });
  if (getRes.ok) {
    const data = await getRes.json();
    sha = data.sha;
  }

  let base64Content = "";
  if (isAlreadyBase64) {
    base64Content = content;
  } else {
    const utf8Bytes = new TextEncoder().encode(content);
    let binary = "";
    utf8Bytes.forEach(b => binary += String.fromCharCode(b));
    base64Content = btoa(binary);
  }

  const putRes = await fetch(url, {
    method: "PUT",
    headers: { "Authorization": `token ${apiConfig.githubToken}`, "Content-Type": "application/json", "Accept": "application/vnd.github.v3+json" },
    body: JSON.stringify({ message: `${commitMessage} (${path})`, content: base64Content, sha: sha })
  });

  if (!putRes.ok) throw new Error(`${path} のプッシュ失敗`);
}

// === タブナビゲーション ===
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
        updateActiveModelBadge();
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
    const newId = `prog_${Date.now()}`;
    programsData.push({
      id: newId,
      name: `新規プログラム_${programsData.length + 1}`,
      githubRepo: "",
      isWebPublish: false,
      customInstruction: "",
      version: "v1.0.0",
      files: "",
      tokensWeek: 0,
      tokensMonth: 0,
      hoursWeek: 0,
      lastCommit: "未セーブ",
      inboxNotes: [],
      saveHistory: [],
      enhancePlans: []
    });
    selectedSysinstProgId = newId;
    renderMasterSettings();
  });

  document.getElementById("saveMasterBtn").addEventListener("click", () => {
    const rows = document.querySelectorAll("#masterTableBody tr");
    rows.forEach((row) => {
      const nameInput = row.querySelector(".master-name");
      const repoInput = row.querySelector(".master-repo");
      const isWebInput = row.querySelector(".master-web-publish");
      const progId = nameInput ? nameInput.dataset.id : null;

      if (progId) {
        const targetProg = programsData.find(p => p.id === progId);
        if (targetProg) {
          targetProg.name = nameInput.value.trim() || targetProg.name;
          targetProg.githubRepo = cleanRepoFullName(repoInput.value);
          targetProg.isWebPublish = isWebInput.checked;
        }
      }
    });

    chrome.storage.local.set({ programs: programsData });
    setupCards();
    renderKnowledgeFilterTabs();
    renderSysInstSplitEditor();
    alert("✅ プログラムマスタを正常に保存しました！");
  });

  document.getElementById("saveCommonSysInstBtn").addEventListener("click", () => {
    const area = document.getElementById("commonSystemInstructionArea");
    systemInstructionTemplate = area ? area.value.trim() : defaultCommonSystemInstruction;
    chrome.storage.local.set({ systemInstructionTemplate }, () => {
      alert("✅ 全プログラム共通のSystem Instruction（基本開発ルール）を保存しました！");
    });
  });

  document.getElementById("saveProgCustomInstBtn").addEventListener("click", () => {
    const area = document.getElementById("progCustomInstructionArea");
    const target = programsData.find(p => p.id === selectedSysinstProgId);
    if (target) {
      target.customInstruction = area ? area.value.trim() : "";
      chrome.storage.local.set({ programs: programsData });
      renderMasterSettings();
      alert(`✅ 【${target.name}】の固有要件を保存しました！`);
    }
  });

  const sysPicker = document.getElementById("sysinstProgPicker");
  if (sysPicker) {
    sysPicker.addEventListener("change", (e) => {
      selectProgForSysInst(e.target.value);
    });
  }

  document.getElementById("saveApiConfigBtn").addEventListener("click", () => {
    apiConfig.githubToken = document.getElementById("githubToken").value.trim();
    apiConfig.geminiApiKey = document.getElementById("geminiApiKey").value.trim();
    apiConfig.geminiModelName = document.getElementById("geminiModelName").value.trim() || "gemini-3.5-flash-lite";

    chrome.storage.local.set({ apiConfig }, () => {
      updateActiveModelBadge();
      alert("✅ 共通API設定を保存しました！");
    });
  });

  const searchInput = document.getElementById("knowledgeSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderKnowledgeList();
    });
  }
}

// === システム全体のブートストラップ ＆ 変更監視エンジン ===
function bootstrap() {
  console.log(`🚀 Studioマネージャー v1.4.2 起動完了`);

  initNavigation();
  initModalHandlers();
  initPreflightModalHandlers();
  initEnhanceModalHandlers();
  initHistoryModalHandlers();
  initTriageModalHandlers();
  initSparringModalHandlers();
  initTokenCorrectModalHandlers();
  initBackupAndRestoreHandlers();
  initReceiptAccordion(); // 🧾 レシートアコーディオンの初期化
  initConciergeHandlers();
  updateCountdown();

  loadFullExtensionSourceCode();

  chrome.storage.local.get(["accounts", "programs", "knowledgeLogs", "dailyProgUsage", "tokenTransactionLogs", "systemInstructionTemplate", "apiConfig"], (res) => {
    if (res.programs && res.programs.length > 0) programsData = res.programs;
    if (res.knowledgeLogs) knowledgeLogsData = res.knowledgeLogs;
    if (res.dailyProgUsage) dailyProgUsageData = res.dailyProgUsage;
    if (res.tokenTransactionLogs) tokenTransactionLogsData = res.tokenTransactionLogs; // 🧾 レシートログの読み込み
    
    const currentStoredTemplate = res.systemInstructionTemplate || "";
    const isOldTemplate = (
      !currentStoredTemplate ||
      currentStoredTemplate.includes("Studioマネージャーの専任プロジェクトリーダー") ||
      !currentStoredTemplate.includes("【Gemini API連携モデルの厳格固定】")
    );

    if (isOldTemplate) {
      systemInstructionTemplate = defaultCommonSystemInstruction;
      chrome.storage.local.set({ systemInstructionTemplate });
    } else {
      systemInstructionTemplate = currentStoredTemplate;
    }

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
    updateAppVersionBadge();
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
      if (changes.systemInstructionTemplate) {
        systemInstructionTemplate = changes.systemInstructionTemplate.newValue || defaultCommonSystemInstruction;
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
              accountsData[i].currentProgramId = newAccounts[i].currentProgramId;
            }
          }
          updateCardValues();
          updateProgramWorkBadgesOnly();
        }
      }
      if (changes.dailyProgUsage) {
        dailyProgUsageData = changes.dailyProgUsage.newValue || {};
        renderProgramDashboard();
      }
      if (changes.tokenTransactionLogs) {
        tokenTransactionLogsData = changes.tokenTransactionLogs.newValue || [];
        if (typeof renderTokenReceiptLogs === "function") renderTokenReceiptLogs();
      }
      if (changes.knowledgeLogs) {
        knowledgeLogsData = changes.knowledgeLogs.newValue || [];
        renderKnowledgeFilterTabs();
        renderKnowledgeList();
      }
      if (changes.programs) {
        programsData = changes.programs.newValue || [];
        updateAppVersionBadge();
        renderProgramDashboard();
      }
    }
  });
}

function syncBackgroundStats() {
  chrome.storage.local.get(["accounts", "dailyProgUsage", "tokenTransactionLogs"], (res) => {
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
      updateProgramWorkBadgesOnly();
    }
    if (res.dailyProgUsage) {
      dailyProgUsageData = res.dailyProgUsage;
    }
    if (res.tokenTransactionLogs) {
      tokenTransactionLogsData = res.tokenTransactionLogs;
      if (typeof renderTokenReceiptLogs === "function") renderTokenReceiptLogs();
    }
  });
}

// 🛡️ 全分割スクリプトおよびDOMツリーの完全ロードを待機して安全に起動
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}