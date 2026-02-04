const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const readline = require('readline');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- VERİLERİ DOSYALARDAN YÜKLE ---
let questions = [];
let winnersList = [];

function loadData() {
    try {
        questions = JSON.parse(fs.readFileSync('./questions.json', 'utf8'));
        winnersList = JSON.parse(fs.readFileSync('./winners.json', 'utf8'));
        console.log("Veriler yüklendi. Soru sayısı:", questions.length, "Kazananlar:", winnersList.length);
    } catch (err) {
        console.error("Dosya okuma hatası! Dosyaları kontrol et.");
    }
}
loadData();

// --- AYARLAR ---
const TIKTOK_USERNAME = "quiz..game"; 
const ENTRY_COST = 1; // 1 Donat
let queue = [];
let currentPlayer = null;
let gameActive = false;
let currentQuestionIndex = 0;
let correctAnswers = 0;
let timerId = null;
let currentCorrectAnswer = null;

const GIFT_MAP = {
    "5655": "A", "6059": "B", "5269": "C", "6056": "D",
    "Rose": "A", "TikTok": "B", "I Love You": "C", "GG": "D"
};
const ENTRY_GIFT_ID = "5487";

app.use(express.static(__dirname));

// --- TIKTOK BAĞLANTISI ---
let tiktokConn = new WebcastPushConnection(TIKTOK_USERNAME);
tiktokConn.connect().then(() => console.log("TikTok Bağlantısı Başarılı!")).catch(e => console.log("Bağlantı Hatası."));

tiktokConn.on('gift', (data) => {
    const giftId = data.giftId.toString();
    const giftName = data.giftName;
    if ((giftId === ENTRY_GIFT_ID || giftName === 'Donut') && data.repeatCount >= ENTRY_COST) {
        addUserToQueue(data.uniqueId);
    }
    if (gameActive && data.uniqueId === currentPlayer) {
        let answer = GIFT_MAP[giftId] || GIFT_MAP[giftName];
        if (answer) handleAnswer(answer);
    }
});

// --- OYUN MANTIĞI ---
function addUserToQueue(userId) {
    if (!queue.includes(userId) && currentPlayer !== userId) {
        queue.push(userId);
        io.emit('updateQueue', queue.length); // Sıradaki kişi sayısını gönder
        if (!gameActive) startNewCycle();
    }
}

function startNewCycle() {
    if (queue.length > 0) {
        currentPlayer = queue.shift();
        gameActive = true;
        correctAnswers = 0;
        currentQuestionIndex = 0;
        io.emit('startCountdown', { name: currentPlayer });
        setTimeout(() => { sendNextQuestion(); }, 4000); 
    } else {
        gameActive = false;
        currentPlayer = null;
        io.emit('waitingMode');
    }
}

function sendNextQuestion() {
    if (currentQuestionIndex < 10) {
        let qData = questions[Math.floor(Math.random() * questions.length)];
        currentQuestionIndex++;
        currentCorrectAnswer = qData.a;
        io.emit('nextQuestion', { num: currentQuestionIndex, text: qData.q, opts: qData.options });
        clearTimeout(timerId);
        timerId = setTimeout(() => { handleAnswer(null); }, 15000);
    } else {
        finishGame();
    }
}

function handleAnswer(userAnswer) {
    clearTimeout(timerId);
    io.emit('revealAnswer', currentCorrectAnswer);
    if (userAnswer === currentCorrectAnswer) {
        correctAnswers++;
        io.emit('updateScore', { score: correctAnswers });
    }
    setTimeout(() => {
        if (currentQuestionIndex < 10 && gameActive) sendNextQuestion();
        else if (gameActive) finishGame();
    }, 2500);
}

function finishGame() {
    gameActive = false;
    // 7+ doğru bilirse kazananlara ekle ve dosyaya yaz [cite: 2026-02-03]
    if (correctAnswers >= 7) {
        winnersList.push(currentPlayer);
        if (winnersList.length > 10) winnersList.shift(); // Son 10 kişiyi tut [cite: 2026-02-03]
        
        // Dosyaya kalıcı kaydet
        fs.writeFileSync('./winners.json', JSON.stringify(winnersList));
        io.emit('updateWinners', winnersList);
    }

    io.emit('showBoxResult', { name: currentPlayer, score: correctAnswers });
    setTimeout(() => { startNewCycle(); }, 5000);
}

// Tarayıcı bağlandığında güncel kazananlar listesini gönder
io.on('connection', (socket) => {
    socket.emit('updateWinners', winnersList);
});

// --- KLAVYE TESTİ ---
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') process.exit();
    if (key.name === 't') addUserToQueue("Test_User");
});

server.listen(3000, () => {
    console.log('SİSTEM HAZIR: http://localhost:3000');
});
