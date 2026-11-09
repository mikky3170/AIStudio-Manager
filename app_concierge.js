// [v1.2.0 作業版 Rev.1] 専任AIコンシェルジュ・音声認識・音量ビジュアライザー・システム全体のブートストラップ実行

let conciergeChatHistory = [];
let speechRecognizer = null;
let isRecording = false;
let audioContext = null;
let audioStream = null;
let analyserNode = null;
let waveAnimFrameId = null;

let speechFinalTranscript = "";
let speechInterimTranscript = "";

function initConciergeHandlers() {
  const floatingBtn = document.getElementById("conciergeFloatingBtn");
  const panel = document.getElementById("conciergePanel");
  const closeFloatingBtn = document.getElementById("conciergeCloseBtn");
  const resetBtn = document.getElementById("conciergeResetBtn");
  const sendBtn = document.getElementById("conciergeSendBtn");
  const inputEl = document.getElementById("conciergeInput");
  const micBtn = document.getElementById("conciergeMicBtn");
  const dragHeader = document.getElementById("conciergeDragHeader");

  floatingBtn.onclick = () => {
    panel.classList.toggle("active");
    if (panel.classList.contains("active")) {
      inputEl.focus();
    }
  };

  closeFloatingBtn.onclick = () => panel.classList.remove("active");

  resetBtn.onclick = () => {
    conciergeChatHistory = [];
    const container = document.getElementById("conciergeMessages");
    container.innerHTML = `
      <div class="chat-bubble assistant">
        <div>
          会話履歴をクリアしました。<br>
          仕様やコード、操作方法について、いつでもお気軽にお話しください！
        </div>
      </div>
    `;
  };

  sendBtn.onclick = () => handleConciergeSubmit();
  
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleConciergeSubmit();
    }
  });

  document.querySelectorAll(".chip-btn").forEach(chip => {
    chip.onclick = (e) => {
      const query = e.target.dataset.query;
      inputEl.value = query;
      handleConciergeSubmit();
    };
  });

  initConciergeDrag(panel, dragHeader);
  initSpeechRecognitionWithVisualizer(micBtn, inputEl);
}

function initConciergeDrag(panel, dragHeader) {
  let isDragging = false;
  let startX = 0, startY = 0;
  let initialLeft = 0, initialTop = 0;

  dragHeader.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = panel.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    panel.style.bottom = "auto";
    panel.style.right = "auto";
    panel.style.left = `${initialLeft}px`;
    panel.style.top = `${initialTop}px`;

    document.body.style.userSelect = "none";
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    let newLeft = initialLeft + deltaX;
    let newTop = initialTop + deltaY;

    const maxLeft = window.innerWidth - panel.offsetWidth - 10;
    const maxTop = window.innerHeight - panel.offsetHeight - 10;

    newLeft = Math.max(10, Math.min(newLeft, maxLeft));
    newTop = Math.max(10, Math.min(newTop, maxTop));

    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = "";
    }
  });
}

function initSpeechRecognitionWithVisualizer(micBtn, inputEl) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    micBtn.title = "このブラウザは音声認識に対応していません（Google Chrome推奨）";
    micBtn.style.opacity = "0.5";
    micBtn.onclick = () => alert("お使いのブラウザは音声認識APIに対応していません。Chrome最新版をご利用ください。");
    return;
  }

  speechRecognizer = new SpeechRecognition();
  speechRecognizer.lang = "ja-JP";
  speechRecognizer.interimResults = true;
  speechRecognizer.continuous = true;

  speechRecognizer.onstart = async () => {
    isRecording = true;
    speechFinalTranscript = "";
    speechInterimTranscript = "";
    micBtn.classList.add("recording");
    micBtn.innerText = "🛑";
    showConciergeStatus("🎙️ お話しください（話し終わったらもう一度 🛑 ボタンを押して確定）");
    startAudioVisualizer();
  };

  speechRecognizer.onresult = (event) => {
    speechInterimTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        speechFinalTranscript += event.results[i][0].transcript;
      } else {
        speechInterimTranscript += event.results[i][0].transcript;
      }
    }
  };

  speechRecognizer.onerror = (event) => {
    console.error("SpeechRecognition Error:", event.error);
    hideConciergeStatus();
    stopRecording(micBtn);
  };

  speechRecognizer.onend = () => {
    if (isRecording) {
      finishAndCleanseSpeech(inputEl, micBtn);
    }
  };

  micBtn.onclick = () => {
    if (isRecording) {
      finishAndCleanseSpeech(inputEl, micBtn);
    } else {
      try {
        speechRecognizer.start();
      } catch (err) {
        console.error("音声認識の開始に失敗:", err);
      }
    }
  };
}

async function finishAndCleanseSpeech(inputEl, micBtn) {
  isRecording = false;
  micBtn.classList.remove("recording");
  micBtn.innerText = "🎙️";
  stopAudioVisualizer();

  try {
    speechRecognizer.stop();
  } catch (e) {}

  const fullRawText = (speechFinalTranscript + " " + speechInterimTranscript).trim();
  if (!fullRawText) {
    hideConciergeStatus();
    return;
  }

  showConciergeStatus("✨ 文脈から誤認識を修復し、美しい文章に清書中...");

  try {
    const formatted = await cleanseAndFormatSpeechText(fullRawText);
    const currentVal = inputEl.value.trim();
    inputEl.value = currentVal ? `${currentVal} ${formatted}` : formatted;
    hideConciergeStatus();
    inputEl.focus();
  } catch (err) {
    console.warn("音声整形エラー:", err);
    const currentVal = inputEl.value.trim();
    inputEl.value = currentVal ? `${currentVal} ${fullRawText}` : fullRawText;
    hideConciergeStatus();
  }
}

async function startAudioVisualizer() {
  const waveContainer = document.getElementById("voiceWaveContainer");
  const bars = [
    document.getElementById("wBar1"),
    document.getElementById("wBar2"),
    document.getElementById("wBar3"),
    document.getElementById("wBar4"),
    document.getElementById("wBar5")
  ];

  waveContainer.classList.add("active");

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(audioStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 64;
    source.connect(analyserNode);

    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

    function updateWave() {
      if (!isRecording) return;
      analyserNode.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;

      bars.forEach((bar, idx) => {
        const factor = 1 + Math.sin(Date.now() / 80 + idx) * 0.35;
        const barHeight = Math.max(4, Math.min(22, (avg / 4) * factor));
        bar.style.height = `${barHeight}px`;
      });

      waveAnimFrameId = requestAnimationFrame(updateWave);
    }

    updateWave();
  } catch (err) {
    console.warn("マイク音量ビジュアライザー起動スキップ:", err);
  }
}

function stopAudioVisualizer() {
  const waveContainer = document.getElementById("voiceWaveContainer");
  waveContainer.classList.remove("active");

  if (waveAnimFrameId) cancelAnimationFrame(waveAnimFrameId);
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }
  if (audioContext && audioContext.state !== "closed") {
    audioContext.close();
    audioContext = null;
  }
}

function stopRecording(micBtn) {
  isRecording = false;
  micBtn.classList.remove("recording");
  micBtn.innerText = "🎙️";
  stopAudioVisualizer();
}

async function cleanseAndFormatSpeechText(rawSpeech) {
  if (!apiConfig.geminiApiKey) {
    return rawSpeech
      .replace(/^(えーっと?|あのー?|そのー?|ええと|なんか|まあ)\s*/g, '')
      .replace(/、\s*(えーっと?|あのー?|そのー?|ええと|なんか)\s*/g, '、')
      .trim();
  }

  const model = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiConfig.geminiApiKey}`;

  const prompt = `あなたはプロのテクニカルライターです。
以下は音声認識で文字起こしされたユーザーの発言です。

【厳格な指示】
1. 絶対に要約・省略・意味の改変をしないでください。
2. 「えーと」「あのー」「その」「えっと」「なんか」等の不要なフィラー（言い淀み・口癖）をすべて除去してください。
3. 全体の文脈から誤認識を推測して正しく修復してください。
4. 適切な句読点（、。）を補い、自然で美しい日本語の話し言葉/質問文に体裁を整えてください。
5. 説明や前置き、引用符（"）は一切出力せず、整形後のテキストのみを1行で出力してください。

【ユーザーの音声発言】
${rawSpeech}
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

  if (!res.ok) throw new Error("音声整形APIエラー");
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || rawSpeech;
  return text.replace(/^["'「]+|["'」]+$/g, '').trim();
}

function showConciergeStatus(msg) {
  const bar = document.getElementById("conciergeStatusBar");
  const text = document.getElementById("conciergeStatusText");
  text.innerText = msg;
  bar.classList.add("active");
}

function hideConciergeStatus() {
  const bar = document.getElementById("conciergeStatusBar");
  bar.classList.remove("active");
}

function appendChatMessage(role, text, isDeepDiveAnswer = false) {
  const container = document.getElementById("conciergeMessages");
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;

  let cleanText = text
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '');

  cleanText = cleanText.replace(/<\/?(?:strong|code|b|span|div|p|i|em)[^>]*>/gi, '');
  const textHtml = escapeHtml(cleanText).replace(/\n/g, '<br>');

  if (role === "assistant") {
    const showMoreBtn = !isDeepDiveAnswer;

    bubble.innerHTML = `
      <div>${textHtml}</div>
      ${showMoreBtn ? `
        <button type="button" class="btn-bubble-more" title="この回答の背景や具体的な手順を詳しく深掘りします">
          📖 もっと詳しく解説
        </button>
      ` : ''}
    `;

    if (showMoreBtn) {
      const moreBtn = bubble.querySelector(".btn-bubble-more");
      if (moreBtn) {
        moreBtn.onclick = () => {
          moreBtn.style.display = "none";
          const inputEl = document.getElementById("conciergeInput");
          inputEl.value = "先ほどの回答について、背景や手順を含めてもっと詳しく教えて";
          handleConciergeSubmit();
        };
      }
    }
  } else {
    bubble.innerHTML = `<div>${textHtml}</div>`;
  }

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

async function handleConciergeSubmit() {
  const inputEl = document.getElementById("conciergeInput");
  const text = inputEl.value.trim();
  if (!text) return;

  const isDeepDive = text.includes("もっと詳しく") || text.includes("詳細");

  appendChatMessage("user", text);
  inputEl.value = "";
  
  showConciergeStatus("ただいまマニュアルを一生懸命調べておりますので、もうしばらくお待ちください。");

  if (!apiConfig.geminiApiKey) {
    appendChatMessage("assistant", "⚠️ Gemini APIキーが設定されていません。画面右上の「⚙️ 設定」タブを開き、AI Studioで発行したAPIキーを保存してください。");
    hideConciergeStatus();
    return;
  }

  conciergeChatHistory.push({ role: "user", text: text });
  if (conciergeChatHistory.length > 8) conciergeChatHistory.shift();

  try {
    const aiAnswer = await callGeminiForConcierge(text);
    conciergeChatHistory.push({ role: "assistant", text: aiAnswer });
    appendChatMessage("assistant", aiAnswer, isDeepDive);
  } catch (err) {
    console.error("Concierge Error:", err);
    appendChatMessage("assistant", `⚠️ エラーが発生しました: ${err.message}`);
  } finally {
    hideConciergeStatus();
  }
}

async function callGeminiForConcierge(latestQuery) {
  const model = apiConfig.geminiModelName || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiConfig.geminiApiKey}`;

  const fullSourceCode = await loadFullExtensionSourceCode();

  let urgentWarnings = [];
  for (let i = 1; i <= 4; i++) {
    const a = accountsData[i] || {};
    const curTokens = a.currentChatTokens || 0;
    const isBloated = curTokens >= 300000;
    const isLimited = a.statusMode === "limited" || a.meterLevel === 100;
    const isWarning = a.statusMode === "warning";

    if (isLimited) urgentWarnings.push(`ID ${i} が【リミット到達・停止】状態`);
    if (isBloated) urgentWarnings.push(`ID ${i} のチャットが ${Math.round(curTokens / 1000)}k トークンに肥大化中（要約＆新チャット引越し推奨）`);
    if (isWarning) urgentWarnings.push(`ID ${i} が【エラー警戒】状態`);
  }

  const warningsInstruction = urgentWarnings.length > 0
    ? `【※重要：現在発生している緊急警告】\n以下の異常事態が発生しているため、回答の末尾で必ず1行添えて自然に注意喚起してください:\n` + urgentWarnings.map(w => `- ${w}`).join("\n")
    : "【現在全IDの稼働状況は良好です。IDに関する言及・挨拶は一切不要です（完全に触れず無言を保つこと）】";

  const isDeepDive = latestQuery.includes("もっと詳しく") || latestQuery.includes("詳細");

  const lengthRule = isDeepDive
    ? "・ユーザーが詳細解説を求めています。背景、具体的な操作手順、コードの関連箇所を含めて丁寧に詳しく解説してください。"
    : "・【最重要】原則として「3〜4行以内」で結論と要点のみをズバリ答えてください。長い背景講釈や前置きは完全にカットしてください。";

  const systemInstruction = `あなたはChrome拡張機能「Studioマネージャー」の全ソースコードを作成・管理している【専任リードエンジニア兼プロジェクトマネージャー】です。
現在稼働している【全ソースコードおよびマニュアル（display.html内のガイド）】をすべて把握しています。

【プロの回答ルール（厳格遵守）】
1. 結論ファースト: 最初の1文でズバリ結論・ボタンの場所・方法を答えてください。
2. 簡潔さの徹底:
${lengthRule}
3. 【最重要】HTMLタグやMarkdown記号の完全禁止:
   - <strong>, <code>, <b> などのHTMLタグは絶対に出力しないでください。
   - ボタン名や強調したい用語は、日本語の『 』や【 】や [ ] を使ってください（例: 『＋機能追加』ボタン、[▶ 着手] など）。
4. 画面上の表現で自然に案内する:
   - ユーザーに見えている実際の日本語名を使って案内してください。

${warningsInstruction}

【現在稼働中のStudioマネージャー 全ソースコード一式】
${fullSourceCode}
`;

  const contents = [
    { role: "user", parts: [{ text: systemInstruction }] },
    { role: "model", parts: [{ text: "了解しました。Studioマネージャーの全コードとマニュアルを完全に把握しています。HTMLタグは一切使わず、日本語の括弧で強調し、原則3〜4行で結論から端的に回答します。" }] }
  ];

  conciergeChatHistory.forEach(turn => {
    contents.push({
      role: turn.role === "user" ? "user" : "model",
      parts: [{ text: turn.text }]
    });
  });

  const body = {
    contents: contents,
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
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "回答を取得できませんでした。";
}

// === システム全体のブートストラップ ＆ 変更監視エンジン ===
function bootstrap() {
  console.log(`🚀 Studioマネージャー v1.2.0 起動完了`);

  initNavigation();
  initModalHandlers();
  initPreflightModalHandlers();
  initEnhanceModalHandlers();
  initHistoryModalHandlers();
  initTriageModalHandlers();
  initTokenCorrectModalHandlers();
  initConciergeHandlers();
  updateCountdown();

  loadFullExtensionSourceCode();

  chrome.storage.local.get(["accounts", "programs", "knowledgeLogs", "dailyProgUsage", "systemInstructionTemplate", "apiConfig"], (res) => {
    if (res.programs && res.programs.length > 0) programsData = res.programs;
    if (res.knowledgeLogs) knowledgeLogsData = res.knowledgeLogs;
    if (res.dailyProgUsage) dailyProgUsageData = res.dailyProgUsage;
    
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
  chrome.storage.local.get(["accounts", "dailyProgUsage"], (res) => {
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
  });
}

bootstrap();