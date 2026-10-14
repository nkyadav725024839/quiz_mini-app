// script.js
import { quizData } from './question/questions.js';

let currentQuestionIdx = 0;
let score = 0;
let wrongAnswers = 0;
let timerInterval;
let timeLeft = 15;
const timeLimit = 15;
let globalPlayerName = "Player";

export function initAppEngine() {
    console.log("Bootstrapping Mini App Engine Core...");

    syncProfileData();

    document.getElementById('start-btn').onclick = startQuiz;
    document.getElementById('next-btn').onclick = nextQuestion;
    document.getElementById('restart-btn').onclick = restartQuiz;

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

// ====================================================================
// 🎮 QUIZ PLAYGROUND ENGINE MECHANICS
// ====================================================================
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
    switchScreen('quiz-screen');
    loadQuestion();
}

function loadQuestion() {
    clearInterval(timerInterval);
    timeLeft = timeLimit;
    document.getElementById('time-left').innerText = timeLeft;
    document.getElementById('next-btn').style.display = 'none';
    document.getElementById('explanation-box').style.display = 'none';

    const currentQuiz = quizData[currentQuestionIdx];

    document.getElementById('question-counter').innerText = `प्रश्न: ${currentQuestionIdx + 1}/${quizData.length}`;
    const progressPercent = (currentQuestionIdx / quizData.length) * 100;
    document.getElementById('progress-bar').style.width = `${progressPercent}%`;

    document.getElementById('question-text').innerText = `[${currentQuestionIdx + 1}/${quizData.length}] ${currentQuiz.question}`;

    const optionsList = document.getElementById('options-list');
    optionsList.innerHTML = '';

    currentQuiz.options.forEach((option, idx) => {
        const li = document.createElement('li');
        li.className = 'option-item';
        li.innerText = option;
        li.onclick = () => selectOption(idx, li);
        optionsList.appendChild(li);
    });

    startTimer();
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
    clearInterval(timerInterval);
    const currentQuiz = quizData[currentQuestionIdx];
    const options = document.querySelectorAll('.option-item');

    options.forEach(opt => opt.classList.add('disabled'));

    if (selectedIdx === currentQuiz.correct) {
        selectedElement.classList.add('correct');
        score++;
    } else {
        selectedElement.classList.add('wrong');
        options[currentQuiz.correct].classList.add('correct');
        wrongAnswers++;
    }

    showExplanation(currentQuiz.explanation);
}

function autoTimeOut() {
    const currentQuiz = quizData[currentQuestionIdx];
    const options = document.querySelectorAll('.option-item');

    options.forEach(opt => opt.classList.add('disabled'));
    options[currentQuiz.correct].classList.add('correct');
    wrongAnswers++;

    showExplanation(`समय समाप्त! सही उत्तर: ${currentQuiz.explanation}`);
}

function showExplanation(text) {
    const expBox = document.getElementById('explanation-box');
    if (text) {
        expBox.innerHTML = `<b>📖 विवरण:</b> ${text}`;
        expBox.style.display = 'block';
    }
    document.getElementById('next-btn').style.display = 'block';
}

function nextQuestion() {
    currentQuestionIdx++;
    if (currentQuestionIdx < quizData.length) {
        loadQuestion();
    } else {
        showResults();
    }
}

function showResults() {
    document.getElementById('progress-bar').style.width = '100%';
    switchScreen('result-screen');

    document.getElementById('result-user-name').innerText = globalPlayerName;
    document.getElementById('result-score').innerText = `${score}/${quizData.length}`;
    document.getElementById('stat-correct').innerText = score;
    document.getElementById('stat-wrong').innerText = wrongAnswers;
}

function restartQuiz() {
    switchScreen('start-screen');
        }
