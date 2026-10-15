// script.js - BHAAG 1
import { quizData } from './question/questions.js';
// 1. ESM ke zariye official Google Gen AI SDK ko import kiya
import { GoogleGenAI } from "https://esm.run";

// ⚠️ APNI GEMINI API KEY YAHAAN DAALEIN (Google AI Studio se generate karein)
// Sahi tarika (Quotes ke sath):
const GEMINI_API_KEY = "AQ.Ab8RN6K0rcU8hvfzJkR9H-PKw6ofCVzBu2BePkd58GzKucuB9w";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// 2. Static quizData ko backup me rakh kar dynamic array banayi
let dynamicQuizData = [];

let currentQuestionIdx = 0;
let score = 0;
let wrongAnswers = 0;
let timerInterval;
let timeLeft = 15;
const timeLimit = 15;
let globalPlayerName = "Player";
const answeredState = [];

export function initAppEngine() {
    console.log("Bootstrapping Mini App Engine Core...");

    syncProfileData();

    // Purana standard button jo local file se chalega
    document.getElementById('start-btn').onclick = () => {
        dynamicQuizData = [...quizData]; // Local questions ko dynamic array me load kiya
        startQuiz();
    };
    
    // ✨ AI Quiz Generation Button Trigger
    const aiBtn = document.getElementById('ai-generate-btn');
    if (aiBtn) {
        aiBtn.onclick = generateAIQuiz;
    }

    document.getElementById('next-btn').onclick = nextQuestion;
    document.getElementById('prev-btn').onclick = previousQuestion;
    document.getElementById('restart-btn').onclick = restartQuiz;
    
    // Finish button - finish anytime and show results
    const finishBtn = document.getElementById('finish-btn');
    if (finishBtn) {
        finishBtn.onclick = () => {
            clearInterval(timerInterval);
            showResults();
        };
    }

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

// ✨ Gemini API Call aur Data Extraction
async function generateAIQuiz() {
    const topicInput = document.getElementById('topic-search-input');
    const generateBtn = document.getElementById('ai-generate-btn');

    if (!topicInput || !topicInput.value.trim()) {
        alert("कृपया पहले कोई टॉपिक का नाम टाइप करें!");
        return;
    }

    const topic = topicInput.value.trim();
    generateBtn.disabled = true;
    generateBtn.innerText = "⏳ AI क्विज़ बना रहा है... कृपया रुकें...";

    // Strict prompt schema jo JSON output engine ko force karega
    const prompt = `Create a quiz with exactly 5 multiple choice questions on the topic: "\${topic}". 
    The questions, options, and explanations must be written in neat, clear Hindi (using proper Devanagari script).
    You must respond ONLY with a raw, valid JSON array matching this exact schema structural definition:
    [
      {
        "question": "Question text in Hindi here?",
        "options": ["Option 0", "Option 1", "Option 2", "Option 3"],
        "correct": 0, 
        "explanation": "Brief clean explanation in Hindi of why this option is correct."
      }
    ]
    Crucial Instructions: 
    1. The "correct" value must be an integer between 0 and 3 representing the index of the right option.
    2. Do NOT wrap your output in markdown code blocks like \`\`\`json. Return only the raw JSON string.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        let jsonText = response.text.trim();
        
        // Safety Clean: Agar model markdown format backticks deta hai toh use trim karein
        if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
        }

        const parsedData = JSON.parse(jsonText);
        
        if (Array.isArray(parsedData) && parsedData.length > 0) {
            dynamicQuizData = parsedData; 
            startQuiz(); 
        } else {
            throw new Error("Invalid structure format");
        }

    } catch (error) {
        console.error("Gemini Engine Exception Error: ", error);
        alert("क्विज़ जनरेट करने में समस्या आई। कृपया फिर से कोशिश करें या कोई दूसरा टॉपिक लिखें।");
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerText = "✨ AI से क्विज़ जनरेट करें";
    }
                                                        }
// script.js - BHAAG 2
function getAvatarUrl(name, photoUrl) {
    if (photoUrl && String(photoUrl).trim() !== '') {
        return photoUrl;
    }

    const safeName = (name || 'Guest Player').trim();
    const initials = safeName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(word => word?.toUpperCase() || '')
        .join('') || 'G';

    return `https://ui-avatars.com{encodeURIComponent(safeName)}&background=4f46e5&color=fff&bold=true&length=${initials.length}`;
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
    document.getElementById(screenId).classList.add('active');
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
    document.getElementById('explanation-box').style.display = 'none';

    const currentQuiz = dynamicQuizData[currentQuestionIdx];
    const currentAnswer = answeredState[currentQuestionIdx];
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');

    prevBtn.style.display = currentQuestionIdx > 0 ? 'block' : 'none';
    nextBtn.style.display = currentAnswer ? 'block' : 'none';
    nextBtn.innerText = currentQuestionIdx === dynamicQuizData.length - 1 ? 'परिणाम देखें ✅' : 'अगला प्रश्न ➡️';

    document.getElementById('question-counter').innerText = `प्रश्न: ${currentQuestionIdx + 1}/${dynamicQuizData.length}`;
    
    const progressPercent = ((currentQuestionIdx + 1) / dynamicQuizData.length) * 100;
    document.getElementById('progress-bar').style.width = `${progressPercent}%`;

    document.getElementById('question-text').innerText = `[${currentQuestionIdx + 1}/${dynamicQuizData.length}] ${currentQuiz.question}`;

    const optionsList = document.getElementById('options-list');
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
        document.getElementById('time-left').innerText = timeLeft;

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
    const currentQuiz = dynamicQuizData[currentQuestionIdx];
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
        options[currentQuiz.correct].classList.add('correct');
        wrongAnswers++;
    }

    showExplanation(currentQuiz.explanation, true);
}

function autoTimeOut() {
    if (answeredState[currentQuestionIdx]) {
        return;
    }

    const currentQuiz = dynamicQuizData[currentQuestionIdx];
    const options = document.querySelectorAll('.option-item');

    answeredState[currentQuestionIdx] = {
        selectedIdx: -1,
        isCorrect: false
    };

    options.forEach(opt => opt.classList.add('disabled'));
    options[currentQuiz.correct].classList.add('correct');
    wrongAnswers++;

    showExplanation(`समय समाप्त! सही उत्तर: ${currentQuiz.explanation}`, true);
}

function showExplanation(text, forceShow = false) {
    const expBox = document.getElementById('explanation-box');
    const nextBtn = document.getElementById('next-btn');

    if (text) {
        expBox.innerHTML = `<b>📖 विवरण:</b> ${text}`;
        expBox.style.display = 'block';
    }

    nextBtn.style.display = forceShow || text ? 'block' : 'none';
    nextBtn.innerText = currentQuestionIdx === dynamicQuizData.length - 1 ? 'परिणाम देखें ✅' : 'अगला प्रश्न ➡️';
}

function previousQuestion() {
    if (currentQuestionIdx > 0) {
        currentQuestionIdx--;
        loadQuestion();
    }
}

function nextQuestion() {
    if (currentQuestionIdx < dynamicQuizData.length - 1) {
        currentQuestionIdx++;
        loadQuestion();
    } else {
        showResults();
    }
}

function showResults() {
    document.getElementById('progress-bar').style.width = '100%';
    switchScreen('result-screen');

    document.getElementById('result-user-name').innerText = globalPlayerName;
    document.getElementById('result-score').innerText = `${score}/${dynamicQuizData.length}`;
    document.getElementById('stat-correct').innerText = score;
    document.getElementById('stat-wrong').innerText = wrongAnswers;
}

function restartQuiz() {
    switchScreen('start-screen');
}
