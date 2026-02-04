const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- VERİ YÜKLEME ---
let questions = [];
let winnersList = [];

function loadData() {
    try {
        if (fs.existsSync('./questions.json')) {
            questions = JSON.parse(fs.readFileSync('./questions.json', 'utf8'));
        }
        if (fs.existsSync('./winners.json')) {
            winnersList = JSON.parse(fs.readFileSync('./winners.json', 'utf8'));
        }
        console.log("SİSTEM: Veriler yüklendi. Soru:" + questions.length + " Kazanan:" + winnersList.length);
    } catch (err) {
        console.log("HATA: JSON dosyalarında yazım hatası var!");
    }
}
loadData();

const TIKTOK_USERNAME = "quiz..game"; 
const ENTRY_COST = 1; 
let queue = [];
let currentPlayer = null;
let gameActive = false;
let currentQuestionIndex = 0;
let correctAnswers = 0;
let timerId = null;
let currentCorrectAnswer = null;

const GIFT_MAP = { "5655": "A", "6059": "B", "5269": "C", "6056": "D", "Rose": "A", "TikTok": "B", "I Love You": "C", "GG": "D" };
const ENTRY_GIFT_ID = "5487";

app.use(express.static(__dirname));

let tiktokConn = new WebcastPushConnection(TIKTOK_USERNAME);
tiktokConn.connect().then(() => console.log("TikTok Bağlantısı Başarılı!")).catch(e => console.log("Bağlantı Hatası."));

tiktokConn.on('gift', (data) => {
    const giftId = data.giftId.toString();
    if ((giftId === ENTRY_GIFT_ID || data.giftName === 'Donut') && data.repeatCount >= ENTRY_COST) {
        addUserToQueue(data.uniqueId);
    }
    if (gameActive && data.uniqueId === currentPlayer) {
        let answer = GIFT_MAP[giftId] || GIFT_MAP[data.giftName];
        if (answer) handleAnswer(answer);
    }
});

function addUserToQueue(userId) {
    if (!queue.includes(userId) && currentPlayer !== userId) {
        queue.push(userId);
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
    if (correctAnswers >= 7) {
        winnersList.push(currentPlayer);
        if (winnersList.length > 10) winnersList.shift();
        fs.writeFileSync('./winners.json', JSON.stringify(winnersList));
        io.emit('updateWinners', winnersList);
    }
    io.emit('showBoxResult', { name: currentPlayer, score: correctAnswers });
    setTimeout(() => { startNewCycle(); }, 5000);
}

io.on('connection', (socket) => {
    socket.emit('updateWinners', winnersList);
});

server.listen(3000, () => { console.log('SİSTEM HAZIR: http://localhost:3000'); });
