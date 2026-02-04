const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const readline = require('readline');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- AYARLAR ---
const TIKTOK_USERNAME = "KULLANICI_ADINIZ"; // Kendi kullanıcı adını buraya yaz [cite: 2026-02-03]
const ENTRY_COST = 50; 
let queue = [];
let currentPlayer = null;
let winnersList = [];
let gameActive = false;
let currentQuestionIndex = 0;
let correctAnswers = 0;
let timerId = null;
let currentCorrectAnswer = null;

// Hediye ve Şık Eşleşmesi [cite: 2026-02-03]
const GIFT_MAP = {
    "Rose": "A",
    "Finger Heart": "B",
    "Ice Cream": "C",
    "Lightning Bolt": "D",
    "GG": "D"
};

// Örnek Soru Havuzu (Burayı dilediğin kadar çoğaltabilirsin)
const questions = [
    { q: "Hangi okyanus dünyanın en büyüğüdür?", a: "A", options: { A: "Pasifik", B: "Atlas", C: "Hint", D: "Arktik" }},
    { q: "Türkiye'nin başkenti neresidir?", a: "B", options: { A: "İstanbul", B: "Ankara", C: "İzmir", D: "Bursa" }},
    { q: "En çok uydusu olan gezegen hangisidir?", a: "C", options: { A: "Dünya", B: "Mars", C: "Satürn", D: "Venüs" }},
    { q: "Futbolda bir takım kaç kişiyle sahaya çıkar?", a: "D", options: { A: "7", B: "9", C: "10", D: "11" }}
];

// Statik dosyaları (index.html, logo.png) sunmak için
app.use(express.static(__dirname));

// --- TIKTOK BAĞLANTISI ---
let tiktokConn = new WebcastPushConnection(TIKTOK_USERNAME);
tiktokConn.connect().then(() => console.log("TikTok Canlı Yayınına Bağlanıldı!")).catch(e => console.log("Bağlantı Hatası: Henüz yayında olmayabilirsin."));

tiktokConn.on('gift', (data) => {
    // Çay hediyesi ile sıraya girme [cite: 2026-02-03]
    if (data.giftName === 'Tea' && data.repeatCount >= ENTRY_COST) {
        addUserToQueue(data.uniqueId);
    }
    // Yarışmacı hediye atarak cevap verir [cite: 2026-02-03]
    if (gameActive && data.uniqueId === currentPlayer) {
        let answer = GIFT_MAP[data.giftName];
        if (answer) handleAnswer(answer);
    }
});

// --- OYUN MANTIĞI ---
function addUserToQueue(userId) {
    if (!queue.includes(userId) && currentPlayer !== userId) {
        queue.push(userId);
        console.log(`${userId} sıraya eklendi. Sıra: ${queue.length}`);
        if (!gameActive) startNewCycle();
    }
}

function startNewCycle() {
    if (queue.length > 0) {
        currentPlayer = queue.shift();
        gameActive = true;
        correctAnswers = 0;
        currentQuestionIndex = 0;
        
        // 3-2-1 Geri sayımı kutu içinde başlat [cite: 2026-02-03]
        io.emit('startCountdown');
        
        setTimeout(() => {
            sendNextQuestion();
        }, 4000); 
    } else {
        gameActive = false;
        currentPlayer = null;
        io.emit('waitingMode'); // Logo ve bekleme yazısı [cite: 2026-02-03]
    }
}

function sendNextQuestion() {
    if (currentQuestionIndex < 10) {
        let qData = questions[Math.floor(Math.random() * questions.length)];
        currentQuestionIndex++;
        currentCorrectAnswer = qData.a;

        io.emit('nextQuestion', {
            num: currentQuestionIndex,
            text: qData.q,
            opts: qData.options
        });

        // 15 saniyelik cevap süresi [cite: 2026-02-03]
        clearTimeout(timerId);
        timerId = setTimeout(() => {
            handleAnswer(null); // Süre biterse yanlış say
        }, 15000);
    } else {
        finishGame();
    }
}

function handleAnswer(userAnswer) {
    clearTimeout(timerId);
    io.emit('revealAnswer', currentCorrectAnswer); // Doğru şıkkı yeşil yap [cite: 2026-02-03]

    if (userAnswer === currentCorrectAnswer) {
        correctAnswers++;
        io.emit('updateScore', { score: correctAnswers });
    }

    setTimeout(() => {
        if (currentQuestionIndex < 10 && gameActive) sendNextQuestion();
        else if (gameActive) finishGame();
    }, 2500); // 2.5 saniye sonra diğer soruya geç
}

function finishGame() {
    gameActive = false;
    // 7+ doğru bilirse kazananlara ekle (FIFO 10 kişi) [cite: 2026-02-03]
    if (correctAnswers >= 7) {
        if (winnersList.length >= 10) winnersList.shift();
        winnersList.push(currentPlayer);
        io.emit('updateWinners', winnersList);
    }

    io.emit('showBoxResult', { name: currentPlayer, score: correctAnswers });

    setTimeout(() => {
        startNewCycle();
    }, 5000);
}

// --- KLAVYE İLE TEST MODU ---
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') process.exit();

    if (key.name === 't') { // 't' tuşu ile 50 çay atılmış gibi simüle et [cite: 2026-02-03]
        console.log("TEST: Çay atıldı, yarışmacı giriyor...");
        addUserToQueue("Test_User");
    }
    if (['a', 'b', 'c', 'd'].includes(key.name)) { // 'a,b,c,d' ile cevap ver
        if (gameActive) {
            console.log("TEST: Cevap verildi: " + key.name.toUpperCase());
            handleAnswer(key.name.toUpperCase());
        }
    }
});

server.listen(3000, () => {
    console.log('------------------------------------------');
    console.log('SİSTEM HAZIR: http://localhost:3000');
    console.log('KLAVYE TESTİ:');
    console.log('- "t" tuşu: Yarışmacı girişi yapar.');
    console.log('- "a, b, c, d" tuşları: Soruya cevap verir.');
    console.log('------------------------------------------');
});
