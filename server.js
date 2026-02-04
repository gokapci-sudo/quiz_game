const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- YAPILANDIRMA ---
const TIKTOK_USERNAME = "KULLANICI_ADINIZ"; // Burayı değiştirin!
const ENTRY_COST = 50; 
let queue = [];
let currentPlayer = null;
let winnersList = [];
let gameActive = false;
let currentQuestionIndex = 0;
let correctAnswers = 0;
let timerId = null;

// Hediye Eşleşmeleri [cite: 2026-02-03]
const GIFT_MAP = {
    "Rose": "A",
    "Finger Heart": "B",
    "Ice Cream": "C",
    "Lightning Bolt": "D",
    "GG": "D"
};

// Soru Havuzu Örneği
const questions = [
    { q: "Hangi okyanus dünyanın en büyüğüdür?", a: "A", options: { A: "Pasifik", B: "Atlas", C: "Hint", D: "Arktik" }},
    { q: "Türkiye'nin başkenti neresidir?", a: "B", options: { A: "İstanbul", B: "Ankara", C: "İzmir", D: "Bursa" }},
    // Buraya dilediğin kadar soru ekleyebilirsin...
];

let tiktokConn = new WebcastPushConnection(TIKTOK_USERNAME);
tiktokConn.connect().then(() => console.log("TikTok Bağlantısı Başarılı!")).catch(console.error);

tiktokConn.on('gift', (data) => {
    // 1. Giriş Kontrolü (Çay) [cite: 2026-02-03]
    if (data.giftName === 'Tea' && data.repeatCount >= ENTRY_COST) {
        if (!queue.includes(data.uniqueId) && currentPlayer !== data.uniqueId) {
            queue.push(data.uniqueId);
            if (!gameActive) startNewCycle();
        }
    }

    // 2. Cevap Kontrolü (A, B, C, D) [cite: 2026-02-03]
    if (gameActive && data.uniqueId === currentPlayer) {
        let answer = GIFT_MAP[data.giftName];
        if (answer) {
            handleAnswer(answer);
        }
    }
});

function startNewCycle() {
    if (queue.length > 0) {
        currentPlayer = queue.shift();
        gameActive = true;
        correctAnswers = 0;
        currentQuestionIndex = 0;
        
        // 3-2-1 Geri Sayım Başlat [cite: 2026-02-03]
        io.emit('startCountdown', { name: currentPlayer });
        
        setTimeout(() => {
            sendNextQuestion();
        }, 4000); // Geri sayım bitince ilk soruyu gönder
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
        
        io.emit('nextQuestion', {
            num: currentQuestionIndex,
            text: qData.q,
            opts: qData.options
        });

        // 15 Saniyelik Süre Başlat [cite: 2026-02-03]
        clearTimeout(timerId);
        timerId = setTimeout(() => {
            handleAnswer(null); // Süre biterse yanlış say
        }, 15000);

        currentCorrectAnswer = qData.a;
    } else {
        finishGame();
    }
}

function handleAnswer(userAnswer) {
    clearTimeout(timerId);
    
    // Doğru şıkkı ekranda yak [cite: 2026-02-03]
    io.emit('revealAnswer', currentCorrectAnswer);

    if (userAnswer === currentCorrectAnswer) {
        correctAnswers++;
    }

    // 2 saniye bekle ve sonraki soruya geç
    setTimeout(() => {
        if (currentQuestionIndex < 10) sendNextQuestion();
        else finishGame();
    }, 2000);
}

function finishGame() {
    gameActive = false;
    // Kazananlar listesi (7+ doğru, FIFO 10 kişi) [cite: 2026-02-03]
    if (correctAnswers >= 7) {
        if (winnersList.length >= 10) winnersList.shift();
        winnersList.push(currentPlayer);
        io.emit('updateWinners', winnersList);
    }

    io.emit('showBoxResult', { name: currentPlayer, score: correctAnswers });
    
    // 5 saniye sonra yeni yarışmacı veya bekleme modu
    setTimeout(() => {
        startNewCycle();
    }, 5000);
}

server.listen(3000, () => console.log('Sistem http://localhost:3000 adresinde yayında!'));
