const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const path = require('path');

const PORT = process.env.PORT || 3000;
// Render panelindən dəyişdirilə bilən təhlükəsizlik şifrəsi
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "proadmin777"; 

app.use(express.static(path.join(__dirname, 'public')));

// Admin Səhifəsinin Yolu
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

let cards = [];
let isBoardFrozen = false;
const cols = 8; 
const cardWidth = 85;
const cardHeight = 125;
const gapX = 30;
const gapY = 35;

// Premium Kart Generatoru
function generateInitialCards() {
    let newCards = [];
    for (let i = 0; i < 64; i++) {
        let col = i % cols;
        let row = Math.floor(i / cols);
        newCards.push({
            id: i,
            name: `Card #${i + 1}`,
            x: col * (cardWidth + gapX) + 40,
            y: row * (cardHeight + gapY) + 40,
            width: cardWidth,
            height: cardHeight,
            imgUrl: `https://picsum.photos/seed/${i + 777}/170/250`
        });
    }
    return newCards;
}

cards = generateInitialCards();
let users = {};

io.on('connection', (socket) => {
    const randomColor = `hsl(${Math.floor(Math.random() * 360)}, 85%, 65%)`;
    const userName = `Гость_${socket.id.substring(0, 4)}`;
    users[socket.id] = { id: socket.id, name: userName, color: randomColor, isAdmin: false };

    // Qoşulan oyunçuya mövcud vəziyyəti ötürürük
    socket.emit('initCards', cards);
    socket.emit('boardFreezeStatus', isBoardFrozen);
    io.emit('usersUpdate', Object.values(users));

    // --- ADMIN FUNKSİYALARI ---
    socket.on('adminLogin', (pass) => {
        if (pass === ADMIN_PASSWORD) {
            users[socket.id].isAdmin = true;
            socket.emit('adminAuthResult', { success: true, message: "Giriş uğurludur!" });
            console.log(`[ADMIN] Səlahiyyət verildi: ${userName}`);
        } else {
            socket.emit('adminAuthResult', { success: false, message: "Yalnış şifrə!" });
        }
    });

    socket.on('adminResetTable', () => {
        if (!users[socket.id]?.isAdmin) return;
        cards = generateInitialCards();
        io.emit('initCards', cards);
        io.emit('systemAnnouncement', { text: "Внимание: Администратор сбросил все карты на стол!" });
    });

    socket.on('adminShuffleTable', () => {
        if (!users[socket.id]?.isAdmin) return;
        cards.forEach(card => {
            card.x = Math.floor(Math.random() * 600) + 50;
            card.y = Math.floor(Math.random() * 400) + 50;
        });
        io.emit('initCards', cards);
        io.emit('systemAnnouncement', { text: "Внимание: Администратор перемешал карты!" });
    });

    socket.on('adminToggleFreeze', () => {
        if (!users[socket.id]?.isAdmin) return;
        isBoardFrozen = !isBoardFrozen;
        io.emit('boardFreezeStatus', isBoardFrozen);
        io.emit('systemAnnouncement', { 
            text: isBoardFrozen ? "Действия на столе заморожены администратором!" : "Стол разблокирован для всех игроков." 
        });
    });

    // --- OYUNÇU HƏRƏKƏTLƏRİ ---
    socket.on('cardMove', (movedCard) => {
        if (isBoardFrozen && !users[socket.id]?.isAdmin) {
            socket.emit('actionRejected', { message: "Masa dondurulub!" });
            return;
        }
        let card = cards.find(c => c.id === movedCard.id);
        if (card) {
            card.x = movedCard.x;
            card.y = movedCard.y;
            socket.broadcast.emit('cardUpdated', card);
        }
    });

    socket.on('sendMessage', (msgText) => {
        const currentUser = users[socket.id];
        if (!currentUser) return;
        io.emit('receiveMessage', {
            sender: currentUser.isAdmin ? `👑 Администратор` : currentUser.name,
            color: currentUser.isAdmin ? '#f59e0b' : currentUser.color,
            text: msgText,
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        });
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
        io.emit('usersUpdate', Object.values(users));
    });
});

http.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PREMIUM PLATFORM SERVIZ ACTIVE ON PORT: ${PORT}`);
});
