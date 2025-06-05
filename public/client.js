const socket = io();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const joinBtn = document.getElementById('join');

const SIZE = 20;
const GROUND_Y = canvas.height - 50;
const SPEED = 6;
const GRAVITY = 0.6;
const JUMP_VEL = -12;

let playerId = null;
let players = {};
const input = { left: false, right: false, jump: false };

joinBtn.addEventListener('click', () => {
  socket.emit('join');
  joinBtn.style.display = 'none';
});

socket.on('init', (data) => {
  playerId = data.id;
  players = data.players;
  players[playerId].vy = 0;
  players[playerId].onGround = false;
  requestAnimationFrame(update);
});

socket.on('playerJoined', ({ id, player }) => {
  players[id] = player;
});

socket.on('playerLeft', (id) => {
  delete players[id];
});

socket.on('state', (serverPlayers) => {
  for (const [id, p] of Object.entries(serverPlayers)) {
    if (id !== playerId) {
      players[id] = p;
    }
  }
});

function handleInput(p) {
  if (input.left) p.x -= SPEED;
  if (input.right) p.x += SPEED;
  if (input.jump && p.onGround) {
    p.vy = JUMP_VEL;
    p.onGround = false;
  }
}

function applyPhysics(p) {
  p.vy = (p.vy || 0) + GRAVITY;
  p.y += p.vy;
  if (p.y + SIZE >= GROUND_Y) {
    p.y = GROUND_Y - SIZE;
    p.vy = 0;
    p.onGround = true;
  }
  if (p.x < 0) p.x = 0;
  if (p.x > canvas.width - SIZE) p.x = canvas.width - SIZE;
}

function update() {
  const me = players[playerId];
  if (me) {
    handleInput(me);
    applyPhysics(me);
    socket.emit('update', { x: me.x, y: me.y });
  }
  draw();
  requestAnimationFrame(update);
}

function drawGoomba(x, y) {
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(x, y + 4, SIZE, SIZE - 4);
  ctx.fillStyle = '#000';
  ctx.fillRect(x + 2, y + SIZE - 4, 6, 4);
  ctx.fillRect(x + SIZE - 8, y + SIZE - 4, 6, 4);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 4, y + 6, 4, 4);
  ctx.fillRect(x + SIZE - 8, y + 6, 4, 4);
  ctx.fillStyle = '#000';
  ctx.fillRect(x + 5, y + 7, 2, 2);
  ctx.fillRect(x + SIZE - 7, y + 7, 2, 2);
}

function draw() {
  ctx.fillStyle = '#87CEEB';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#228B22';
  ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
  for (const [id, p] of Object.entries(players)) {
    drawGoomba(p.x, p.y);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') input.left = true;
  if (e.key === 'ArrowRight') input.right = true;
  if (e.key === ' ' || e.key === 'ArrowUp') input.jump = true;
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') input.left = false;
  if (e.key === 'ArrowRight') input.right = false;
  if (e.key === ' ' || e.key === 'ArrowUp') input.jump = false;
});
