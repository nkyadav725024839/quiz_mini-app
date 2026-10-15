// script.js (module)
// This version adds client-side encrypted storage for a Gemini API key.
// SECURITY: Prefer server-side secret management for production.
// The code uses Web Crypto (SubtleCrypto) to encrypt the API key with a user passphrase.

import { quizData as defaultQuizData } from './question/questions.js';

let activeQuizData = defaultQuizData; // default
let currentQuestionIdx = 0;
let score = 0;
let wrongAnswers = 0;
let timerInterval;
let timeLeft = 15;
const timeLimit = 15;
let globalPlayerName = "Player";
const answeredState = [];

// Storage key name
const STORAGE_KEY = 'gemini_api_enc_v1';

// runtime unlocked API key (kept in memory only)
let unlockedApiKey = null;

export function initAppEngine() {
    console.log("Bootstrapping Mini App Engine Core...");

    syncProfileData();

    document.getElementById('start-btn').onclick = startQuiz;
    document.getElementById('next-btn').onclick = nextQuestion;
    document.getElementById('prev-btn').onclick = previousQuestion;
    document.getElementById('restart-btn').onclick = restartQuiz;

    const finishBtn = document.getElementById('finish-btn');
    if (finishBtn) {
        finishBtn.onclick = () => {
            clearInterval(timerInterval);
            showResults();
        };
    }

    // Generate + API key UI bindings
    const genBtn = document.getElementById('generate-btn');
    if (genBtn) genBtn.onclick = generateQuestionsFromGemini;

    const saveApiBtn = document.getElementById('save-api-btn');
    if (saveApiBtn) saveApiBtn.onclick = handleSaveApiKey;

    const unlockApiBtn = document.getElementById('unlock-api-btn');
    if (unlockApiBtn) unlockApiBtn.onclick = handleUnlockApiKey;

    const clearApiBtn = document.getElementById('clear-api-btn');
    if (clearApiBtn) clearApiBtn.onclick = handleClearApiKey;

    // show status if saved key exists
    updateApiStatusUI();

    const overlay = document.getElementById('theme-overlay');
    document.getElementById('theme-trigger-btn').onclick = () => overlay.classList.add('open');
    document.getElementById('theme-close-btn').onclick = () => overlay.classList.remove('open');

    document.querySelectorAll('.theme-opt-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.theme-opt-btn').forEach(b => b.classList.remove('data-active'));
            e.target.classList.add('data-active');
            const newTheme = e.target.getAttribute('data-theme');
            document.body.className = '';
            document.body.classList.add(newTheme);
        };
    });
}

function getAvatarUrl(name, photoUrl) {
    if (photoUrl && String(photoUrl).trim() !== '') {
        return photoUrl;
    }

    const safeName = (name || 'Guest Player').trim();
    const initials = safeName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(word => word[0]?.toUpperCase() || '')
        .join('') || 'G';

    return `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=4f46e5&color=fff&bold=true&length=${initials.length}`;
}

function syncProfileData() {
    const tg = window.Telegram?.WebApp;

    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        console.log("Telegram Auth Session Verification Match Found!", user);

        globalPlayerName = user.first_name || "Player";
        if (user.last_name) {
            globalPlayerName += ` ${user.last_name}`;
        }

        const rawUsername = user.username ? `@${user.username}` : "None";
        const rawId = user.id;
        const rawLang = user.language_code ? user.language_code.toUpperCase() : "HI";

        document.getElementById('user-display-name').innerText = user.username ? `@${user.username}` : globalPlayerName;
        document.getElementById('meta-user-name').innerText = globalPlayerName;
        document.getElementById('meta-user-username').innerText = rawUsername;
        document.getElementById('meta-user-id').innerText = rawId;
        document.getElementById('meta-user-lang').innerText = rawLang;

        const avatarImg = document.getElementById('user-avatar');
        avatarImg.src = getAvatarUrl(globalPlayerName, user.photo_url);
        avatarImg.alt = globalPlayerName;

        if (tg.colorScheme) {
            document.body.setAttribute('data-tg-theme', tg.colorScheme);
        }
    } else {
        console.log("Telegram security data wrappers inaccessible. Loading generic local mock metadata sandbox configurations.");
        globalPlayerName = "Anonymous User";
        document.getElementById('user-display-name').innerText = "Guest Player";
        document.getElementById('meta-user-name').innerText = "Guest Mode";
        document.getElementById('meta-user-username').innerText = "@Guest_Account";
        document.getElementById('meta-user-id').innerText = "--------";
        document.getElementById('meta-user-lang').innerText = "HI";
        document.getElementById('user-avatar').src = getAvatarUrl('Guest Player');
    }
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const el = document.getElementById(screenId);
    if (el) el.classList.add('active');
}

function startQuiz() {
    currentQuestionIdx = 0;
    score = 0;
    wrongAnswers = 0;
    answeredState.length = 0;
    switchScreen('quiz-screen');
    loadQuestion();
}

function loadQuestion() {
    clearInterval(timerInterval);
    timeLeft = timeLimit;
    document.getElementById('time-left').innerText = timeLeft;
    const expBox = document.getElementById('explanation-box');
    if (expBox) expBox.style.display = 'none';

    const currentQuiz = activeQuizData[currentQuestionIdx];
    const currentAnswer = answeredState[currentQuestionIdx];
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');

    if (prevBtn) prevBtn.style.display = currentQuestionIdx > 0 ? 'block' : 'none';
    if (nextBtn) nextBtn.style.display = currentAnswer ? 'block' : 'none';
    if (nextBtn) nextBtn.innerText = currentQuestionIdx === activeQuizData.length - 1 ? 'परिणाम देखें ✅' : 'अगला प्रश्न ➡️';

    const qc = document.getElementById('question-counter');
    if (qc) qc.innerText = `प्रश्न: ${currentQuestionIdx + 1}/${activeQuizData.length}`;
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
        const progressPercent = ((currentQuestionIdx + 1) / activeQuizData.length) * 100;
        progressBar.style.width = `${progressPercent}%`;
    }

    const qText = document.getElementById('question-text');
    if (qText) qText.innerText = `[${currentQuestionIdx + 1}/${activeQuizData.length}] ${currentQuiz.question}`;

    const optionsList = document.getElementById('options-list');
    if (!optionsList) return;
    optionsList.innerHTML = '';

    currentQuiz.options.forEach((option, idx) => {
        const li = document.createElement('li');
        li.className = 'option-item';
        li.innerText = option;

        if (currentAnswer) {
            li.classList.add('disabled');

            if (idx === currentAnswer.selectedIdx) {
                li.classList.add(currentAnswer.isCorrect ? 'correct' : 'wrong');
            }

            if (idx === currentQuiz.correct && currentAnswer.selectedIdx !== currentQuiz.correct) {
                li.classList.add('correct');
            }
        }

        li.onclick = () => {
            if (currentAnswer) return;
            selectOption(idx, li);
        };

        optionsList.appendChild(li);
    });

    if (currentAnswer) {
        showExplanation(currentQuiz.explanation, true);
    } else {
        startTimer();
    }
}

function startTimer() {
    timerInterval = setInterval(() => {
        timeLeft--;
        const tEl = document.getElementById('time-left');
        if (tEl) tEl.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            autoTimeOut();
        }
    }, 1000);
}

function selectOption(selectedIdx, selectedElement) {
    if (answeredState[currentQuestionIdx]) {
        return;
    }

    clearInterval(timerInterval);
    const currentQuiz = activeQuizData[currentQuestionIdx];
    const options = document.querySelectorAll('.option-item');
    const isCorrect = selectedIdx === currentQuiz.correct;

    answeredState[currentQuestionIdx] = {
        selectedIdx,
        isCorrect
    };

    options.forEach(opt => opt.classList.add('disabled'));

    if (isCorrect) {
        selectedElement.classList.add('correct');
        score++;
    } else {
        selectedElement.classList.add('wrong');
        const opts = document.querySelectorAll('.option-item');
        if (opts[currentQuiz.correct]) opts[currentQuiz.correct].classList.add('correct');
        wrongAnswers++;
    }

    showExplanation(currentQuiz.explanation, true);
}

function autoTimeOut() {
    if (answeredState[currentQuestionIdx]) {
        return;
    }

    const currentQuiz = activeQuizData[currentQuestionIdx];
    const options = document.querySelectorAll('.option-item');

    answeredState[currentQuestionIdx] = {
        selectedIdx: -1,
        isCorrect: false
    };

    options.forEach(opt => opt.classList.add('disabled'));
    const opts = document.querySelectorAll('.option-item');
    if (opts[currentQuiz.correct]) opts[currentQuiz.correct].classList.add('correct');
    wrongAnswers++;

    showExplanation(`समय समाप्त! सही उत्तर: ${currentQuiz.explanation}`, true);
}

function showExplanation(text, forceShow = false) {
    const expBox = document.getElementById('explanation-box');
    const nextBtn = document.getElementById('next-btn');

    if (text && expBox) {
        expBox.innerHTML = `<b>📖 विवरण:</b> ${text}`;
        expBox.style.display = 'block';
    }

    if (nextBtn) nextBtn.style.display = forceShow || text ? 'block' : 'none';
    if (nextBtn) nextBtn.innerText = currentQuestionIdx === activeQuizData.length - 1 ? 'परिणाम देखें ✅' : 'अगला प्रश्न ➡️';
}

function previousQuestion() {
    if (currentQuestionIdx > 0) {
        currentQuestionIdx--;
        loadQuestion();
    }
}

function nextQuestion() {
    if (currentQuestionIdx < activeQuizData.length - 1) {
        currentQuestionIdx++;
        loadQuestion();
    } else {
        showResults();
    }
}

function showResults() {
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.style.width = '100%';
    switchScreen('result-screen');

    document.getElementById('result-user-name').innerText = globalPlayerName;
    document.getElementById('result-score').innerText = `${score}/${activeQuizData.length}`;
    document.getElementById('stat-correct').innerText = score;
    document.getElementById('stat-wrong').innerText = wrongAnswers;
}

function restartQuiz() {
    switchScreen('start-screen');
}

/* ---------------------------
   Client-side encryption helpers
   --------------------------- */

function bufToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBuf(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
}

async function deriveKey(passphrase, salt, iterations = 200000) {
    const enc = new TextEncoder();
    const passKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations, hash: 'SHA-256' },
        passKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptText(passphrase, plainText) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plainText));
    return {
        salt: bufToBase64(salt.buffer),
        iv: bufToBase64(iv.buffer),
        data: bufToBase64(ct)
    };
}

async function decryptText(passphrase, payload) {
    const dec = new TextDecoder();
    const salt = base64ToBuf(payload.salt);
    const iv = base64ToBuf(payload.iv);
    const data = base64ToBuf(payload.data);
    const key = await deriveKey(passphrase, new Uint8Array(salt));
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, data);
    return dec.decode(plainBuf);
}

/* ---------------------------
   Save / Unlock / Clear API key UI handlers
   --------------------------- */

async function handleSaveApiKey() {
    const apiInput = document.getElementById('api-key-input');
    const passInput = document.getElementById('api-passphrase');
    const status = document.getElementById('api-status');

    if (!apiInput || !passInput) return alert('API key or passphrase input missing.');
    const apiKey = apiInput.value.trim();
    const pass = passInput.value;

    if (!apiKey) return alert('कृपया API key डालें।');
    if (!pass) return alert('कृपया पासफ़्रेज़ डालें (यह encryption में काम आएगा)।');

    try {
        const encrypted = await encryptText(pass, apiKey);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
        apiInput.value = '';
        passInput.value = '';
        unlockedApiKey = null; // locked until user unlocks
        status.innerText = 'API key सुरक्षित रूप से save हो गया है। कृपया Unlock करें।';
        updateApiStatusUI();
    } catch (err) {
        console.error('Encrypt/save failed', err);
        alert('Save failed: ' + err.message);
    }
}

async function handleUnlockApiKey() {
    const passInput = document.getElementById('api-passphrase');
    const status = document.getElementById('api-status');
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return alert('कोई saved API key नहीं मिली।');

    if (!passInput) return alert('पासफ़्रेज़ input missing.');
    const pass = passInput.value;
    if (!pass) return alert('कृपया पासफ़्रेज़ डालें।');

    try {
        const payload = JSON.parse(stored);
        const key = await decryptText(pass, payload);
        unlockedApiKey = key;
        status.innerText = 'API key unlock हो गया — अब आप generate कर सकते हैं।';
        // remove visible api input for security
        document.getElementById('api-key-input').value = '';
    } catch (err) {
        console.error('Unlock failed', err);
        alert('Unlock failed — पासफ़्रेज़ गलत हो सकता है: ' + err.message);
    }
}

function handleClearApiKey() {
    localStorage.removeItem(STORAGE_KEY);
    unlockedApiKey = null;
    const status = document.getElementById('api-status');
    if (status) status.innerText = 'Saved API key हटा दी गई है।';
    updateApiStatusUI();
}

function updateApiStatusUI() {
    const status = document.getElementById('api-status');
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!status) return;
    if (stored) {
        status.innerText = 'Saved API key present (encrypted). Unlock to use.';
    } else {
        status.innerText = 'No saved API key.';
    }
}

/* ---------------------------
   Gemini generation handler (uses unlockedApiKey if present)
   --------------------------- */

async function generateQuestionsFromGemini() {
    const topicEl = document.getElementById('topic-input');
    const countEl = document.getElementById('count-input');
    const status = document.getElementById('gen-status');

    const topic = topicEl ? topicEl.value.trim() : '';
    let count = countEl ? parseInt(countEl.value, 10) : 50;
    if (!topic) {
        alert('कृपया एक टॉपिक दर्ज करें।');
        return;
    }
    if (isNaN(count) || count < 1) count = 5;
    if (count > 100) count = 100;

    if (status) {
        status.style.display = 'block';
        status.innerText = 'Generating questions… (this may take a few seconds)';
    }

    try {
        // If unlockedApiKey present => call Gemini endpoint directly from browser
        if (!unlockedApiKey) {
            // Option A (recommended): If you have a backend endpoint, call it instead (no API key in browser)
            // fetch('/api/generate-questions', { method:'POST', ... })
            // We fallback to trying a server proxy if present
            const proxyResp = await fetch('/api/generate-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, count, language: 'hi' })
            });

            if (proxyResp.ok) {
                const data = await proxyResp.json();
                if (!Array.isArray(data.questions) || data.questions.length === 0) throw new Error('Invalid payload from server proxy.');
                activeQuizData = normalizeQuestions(data.questions);
                if (status) status.innerText = `Generated ${activeQuizData.length} questions ✅ Starting quiz...`;
                setTimeout(() => { if (status) status.style.display = 'none'; startQuiz(); }, 700);
                return;
            } else {
                // If no proxy available or failed, inform user and stop
                const txt = await proxyResp.text().catch(() => 'proxy error');
                throw new Error('No unlocked API key and proxy failed: ' + txt);
            }
        }

        // Direct client-side call to Gemini (use only if unlockedApiKey provided and you understand CORS & security)
        // Endpoint and request payload may differ — adapt to the exact Gemini/Generative AI API you use.
        // Example uses Google Generative Language REST shape (adjust for your model & params).
        const modelEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateText'; // example; replace if needed

        const prompt = `
Generate exactly ${count} multiple choice questions on the topic: "${topic}".
Language: hi (Hindi).
Return only valid JSON array, nothing else. Each array item must be:
{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}
Ensure exactly 4 options per question. "correct" is 0-based index.
Keep explanations short.
`;

        // Payload depends on API; this is a generic example; you must adapt to actual Gemini API request fields.
        const body = {
            // This request shape is illustrative — check Google's current API docs and adjust.
            prompt: prompt,
            maxOutputTokens: 2000,
            temperature: 0.2,
            top_p: 0.95
        };

        const resp = await fetch(modelEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${unlockedApiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const errtxt = await resp.text().catch(() => 'unknown error');
            throw new Error('Gemini API returned error: ' + errtxt);
        }

        // Parse text response - adjust according to actual API response structure
        const json = await resp.json();
        // Example: text may be at json.candidates[0].content[0].text or similar
        let rawText = '';
        if (json?.candidates?.[0]?.content?.[0]?.text) {
            rawText = json.candidates[0].content[0].text;
        } else if (json?.output?.[0]?.content?.[0]?.text) {
            rawText = json.output[0].content[0].text;
        } else {
            rawText = JSON.stringify(json);
        }

        // Try to extract JSON array substring
        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (e) {
            const m = rawText.match(/\[[\s\S]*\]/);
            if (m) parsed = JSON.parse(m[0
