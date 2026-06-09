const socket = io();
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d', { alpha: false });

const zoomLevelTxt = document.getElementById('zoom-level');
const messagesDiv = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const usersContainer = document.getElementById('users-container');
const freezeBanner = document.getElementById('freeze-banner');
const systemAlert = document.getElementById('system-alert');

// --- INTEGRATED SYNTHESIZED SOUND ENGINE (Web Audio API) ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playAudioEffect(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'pickup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(350, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime + 0.08);
        gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
        osc.start(); osc.stop(audioCtx.currentTime + 0.08);
    } else if (type === 'drop') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(280, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(140, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, audioCtx.currentTime);
        osc.frequency.setValueAtTime(100, audioCtx.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc.start(); osc.stop(audioCtx.currentTime + 0.25);
    }
}

// SMART CAMERA (Düzgün mərkəzləşdirilmiş görünüş)
let camera = { 
    x: window.innerWidth / 2 - 250, 
    y: 50, 
    scale: 0.55 
};

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let cards = [];
let isDraggingCard = false;
let isPanningBoard = false;
let draggedCard = null;
let lastMousePos = { x: 0, y: 0 };
let offsetX = 0, offsetY = 0;
let initialPinchDistance = null;
let initialCameraScale = 1;
let localFreezeStatus = false;

socket.on('initCards', (serverCards) => {
    cards = serverCards.map(c => {
        let img = new Image();
        img.src = c.imgUrl;
        return { ...c, targetX: c.x, targetY: c.y, scale: 1, img: img };
    });
});

socket.on('boardFreezeStatus', (status) => {
    localFreezeStatus = status;
    freezeBanner.style.display = status ? 'block' : 'none';
});

socket.on('systemAnnouncement', (data) => {
    systemAlert.innerText = data.text;
    systemAlert.style.display = 'block';
    playAudioEffect('pickup');
    setTimeout(() => { systemAlert.style.display = 'none'; }, 4000);
});

socket.on('actionRejected', (data) => {
    playAudioEffect('error');
});

socket.on('usersUpdate', (usersList) => {
    usersContainer.innerHTML = '';
    usersList.forEach((u, index) => {
        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.style.backgroundColor = u.color;
        avatar.style.zIndex = usersList.length - index;
        avatar.innerText = u.name.substring(u.name.indexOf('_')+1, u.name.indexOf('_')+5).toUpperCase();
        usersContainer.appendChild(avatar);
    });
});

socket.on('cardUpdated', (updatedCard) => {
    let card = cards.find(c => c.id === updatedCard.id);
    if (card) {
        card.targetX = updatedCard.x;
        card.targetY = updatedCard.y;
        cards = cards.filter(c => c.id !== card.id);
        cards.push(card);
    }
});

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (chatInput.value.trim() !== '') {
        socket.emit('sendMessage', chatInput.value);
        chatInput.value = '';
    }
});

socket.on('receiveMessage', (msgData) => {
    const msgEl = document.createElement('div');
    msgEl.className = 'msg';
    msgEl.innerHTML = `<span class="sender" style="color:${msgData.color}">${msgData.sender}:</span> ${msgData.text} <span class="time">${msgData.time}</span>`;
    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

function drawGrid() {
    const gridSize = 100;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.03)';
    ctx.lineWidth = 1;
    
    const startX = Math.floor(-camera.x / camera.scale / gridSize) * gridSize;
    const startY = Math.floor(-camera.y / camera.scale / gridSize) * gridSize;
    const endX = startX + canvas.width / camera.scale + gridSize;
    const endY = startY + canvas.height / camera.scale + gridSize;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
    for (let y = startY; y <= endY; y += gridSize) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
    ctx.stroke();
}

function isCardVisible(card) {
    const screenX = card.x * camera.scale + camera.x;
    const screenY = card.y * camera.scale + camera.y;
    const screenW = card.width * camera.scale;
    const screenH = card.height * camera.scale;
    return (screenX + screenW > 0 && screenX < canvas.width && screenY + screenH > 0 && screenY < canvas.height);
}

let lastTime = performance.now();

function animate(currentTime) {
    let dt = (currentTime - lastTime) / 16.66; 
    if (dt > 3) dt = 3;
    lastTime = currentTime;

    ctx.fillStyle = '#090c14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.scale, camera.scale);
    
    drawGrid();

    cards.forEach(card => {
        if (card !== draggedCard) {
            card.x += (card.targetX - card.x) * 0.16 * dt;
            card.y += (card.targetY - card.y) * 0.16 * dt;
            card.scale += (1 - card.scale) * 0.2 * dt;
        } else {
            card.scale += (1.12 - card.scale) * 0.2 * dt; 
        }

        if (!isCardVisible(card) && card !== draggedCard) return;

        ctx.save();
        ctx.translate(card.x + card.width / 2, card.y + card.height / 2);
        ctx.scale(card.scale, card.scale);
        ctx.translate(-(card.x + card.width / 2), -(card.y + card.height / 2));

        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(card.x, card.y, card.width, card.height, 10);
        else ctx.rect(card.x, card.y, card.width, card.height);
        
        if (card.img.complete && card.img.naturalWidth !== 0) {
            ctx.save(); ctx.clip();
            ctx.drawImage(card.img, card.x, card.y, card.width, card.height);
            ctx.restore();
        } else {
            ctx.fillStyle = '#111726'; ctx.fill();
        }

        ctx.lineWidth = card === draggedCard ? 3.5 / camera.scale : 1 / camera.scale;
        ctx.strokeStyle = card === draggedCard ? '#38bdf8' : 'rgba(255,255,255,0.12)';
        if (card === draggedCard) {
            ctx.shadowBlur = 15; ctx.shadowColor = '#38bdf8';
        }
        ctx.stroke();
        ctx.restore();
    });

    ctx.restore();
    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

function getPos(clientX, clientY) {
    return { screenX: clientX, screenY: clientY, worldX: (clientX - camera.x) / camera.scale, worldY: (clientY - camera.y) / camera.scale };
}

function startAction(e) {
    initAudio();
    if (e.target.closest('#ui-layer') && e.target.tagName !== 'CANVAS') return;
    
    if (e.touches && e.touches.length === 2) {
        isDraggingCard = false;
        initialPinchDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        initialCameraScale = camera.scale;
        return;
    }

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const pos = getPos(clientX, clientY);
    lastMousePos = { x: pos.screenX, y: pos.screenY };

    let foundCard = false;
    for (let i = cards.length - 1; i >= 0; i--) {
        let card = cards[i];
        if (pos.worldX >= card.x && pos.worldX <= card.x + card.width &&
            pos.worldY >= card.y && pos.worldY <= card.y + card.height) {
            
            if (localFreezeStatus) {
                playAudioEffect('error');
                return;
            }

            isDraggingCard = true;
            draggedCard = card;
            offsetX = pos.worldX - card.x;
            offsetY = pos.worldY - card.y;

            cards.splice(i, 1);
            cards.push(draggedCard);
            foundCard = true;
            playAudioEffect('pickup');
            break;
        }
    }

    if (!foundCard) isPanningBoard = true;
}

function doAction(e) {
    if (e.cancelable && e.target.tagName === 'CANVAS') e.preventDefault();

    if (e.touches && e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (initialPinchDistance) {
            const pinchRatio = dist / initialPinchDistance;
            let newScale = initialCameraScale * pinchRatio;
            newScale = Math.max(0.15, Math.min(newScale, 4));
            
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            camera.x = centerX - (centerX - camera.x) * (newScale / camera.scale);
            camera.y = centerY - (centerY - camera.y) * (newScale / camera.scale);
            camera.scale = newScale;
            zoomLevelTxt.innerText = Math.round(camera.scale * 100) + '%';
        }
        return;
    }

    if (!isDraggingCard && !isPanningBoard) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const pos = getPos(clientX, clientY);

    if (isDraggingCard && draggedCard) {
        if (localFreezeStatus) return;
        draggedCard.x = draggedCard.targetX = pos.worldX - offsetX;
        draggedCard.y = draggedCard.targetY = pos.worldY - offsetY;
        socket.emit('cardMove', { id: draggedCard.id, x: draggedCard.targetX, y: draggedCard.targetY });
    } else if (isPanningBoard) {
        camera.x += pos.screenX - lastMousePos.x;
        camera.y += pos.screenY - lastMousePos.y;
        lastMousePos = { x: pos.screenX, y: pos.screenY };
    }
}

function endAction() {
    if (isDraggingCard) playAudioEffect('drop');
    isDraggingCard = false;
    isPanningBoard = false;
    draggedCard = null;
    initialPinchDistance = null;
}

window.addEventListener('wheel', (e) => {
    if (e.target.closest('#chat-area')) return;
    const delta = e.deltaY * 0.0015;
    let newScale = camera.scale * (1 - delta);
    newScale = Math.max(0.15, Math.min(newScale, 4));
    const mouseX = e.clientX; const mouseY = e.clientY;
    camera.x = mouseX - (mouseX - camera.x) * (newScale / camera.scale);
    camera.y = mouseY - (mouseY - camera.y) * (newScale / camera.scale);
    camera.scale = newScale;
    zoomLevelTxt.innerText = Math.round(camera.scale * 100) + '%';
}, { passive: false });

canvas.addEventListener('mousedown', startAction);
window.addEventListener('mousemove', doAction, { passive: false });
window.addEventListener('mouseup', endAction);
canvas.addEventListener('touchstart', startAction, { passive: false });
window.addEventListener('touchmove', doAction, { passive: false });
canvas.addEventListener('touchend', endAction);
