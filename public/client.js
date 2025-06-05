const socket = io();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const joinBtn = document.getElementById('join');
const colorSelect = document.getElementById('color');
const nameInput = document.getElementById('name');

const SIZE = 20;
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1000;
const GROUND_Y = WORLD_HEIGHT - 50;
const SPEED = 6;
const GRAVITY = 0.6;
const JUMP_VEL = -12;
const CLIMB_SPEED = 4;

let playerId = null;
let players = {};
let blocks = [];
let cameraX = 0;
let cameraY = 0;
let mouse = { x: 0, y: 0 };
const input = { left: false, right: false, jump: false, up: false };
let projectiles = [];
const clouds = Array.from({ length: 5 }, () => ({
  x: Math.random() * WORLD_WIDTH,
  y: Math.random() * 150 + 20,
  vx: 0.2 + Math.random() * 0.2
}));

joinBtn.addEventListener('click', () => {
  const color = colorSelect.value;
  const name = nameInput.value.trim() || 'Player';
  socket.emit('join', { color, name });
  joinBtn.style.display = 'none';
  colorSelect.style.display = 'none';
  nameInput.style.display = 'none';
});

socket.on('init', (data) => {
  playerId = data.id;
  players = data.players;
  blocks = data.blocks || [];
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

socket.on('blockPlaced', (block) => {
  blocks.push(block);
});

socket.on('blockRemoved', (block) => {
  const idx = blocks.findIndex(b => b.x === block.x && b.y === block.y);
  if (idx !== -1) blocks.splice(idx, 1);
});

socket.on('state', (serverPlayers) => {
  for (const [id, p] of Object.entries(serverPlayers)) {
    if (id !== playerId) {
      players[id] = p;
    }
  }
});

socket.on('projectiles', (list) => {
  projectiles = list;
});


socket.on('playerRespawn', ({ id, x, y }) => {
  if (players[id]) {
    players[id].x = x;
    players[id].y = y;
    players[id].vy = 0;
    players[id].onGround = false;
  }
});

function handleInput(p) {
  p.vx = 0;
  if (input.left) p.vx = -SPEED;
  if (input.right) p.vx = SPEED;
  if (input.jump && p.onGround) {
    p.vy = JUMP_VEL;
    p.onGround = false;
  }
}

function applyPhysics(p) {
  const onVine = blocks.some(b => b.type === 'vine' && rectsOverlap(p.x, p.y, SIZE, SIZE, b.x, b.y, SIZE, SIZE));

  if (onVine && input.up) {
    p.vy = -CLIMB_SPEED;
  } else {
    p.vy = (p.vy || 0) + GRAVITY;
  }

  // Horizontal movement
  p.x += p.vx || 0;
  for (const b of blocks) {
    if (b.type !== 'solid') continue;
    if (rectsOverlap(p.x, p.y, SIZE, SIZE, b.x, b.y, SIZE, SIZE)) {
      if (p.vx > 0) p.x = b.x - SIZE;
      if (p.vx < 0) p.x = b.x + SIZE;
    }
  }

  if (p.x < 0) p.x = 0;
  if (p.x > WORLD_WIDTH - SIZE) p.x = WORLD_WIDTH - SIZE;

  // Vertical movement
  p.y += p.vy;
  p.onGround = false;
  for (const b of blocks) {
    if (b.type !== 'solid') continue;
    if (rectsOverlap(p.x, p.y, SIZE, SIZE, b.x, b.y, SIZE, SIZE)) {
      if (p.vy > 0) {
        p.y = b.y - SIZE;
        p.onGround = true;
      } else if (p.vy < 0) {
        p.y = b.y + SIZE;
      }
      p.vy = 0;
    }
  }

  if (p.y + SIZE >= GROUND_Y) {
    p.y = GROUND_Y - SIZE;
    p.vy = 0;
    p.onGround = true;
  }
  if (p.y < 0) {
    p.y = 0;
    p.vy = 0;
  }
}

function update() {
  const me = players[playerId];
  if (me) {
    handleInput(me);
    applyPhysics(me);
    collideWithPlayers(me);
    socket.emit('update', { x: me.x, y: me.y });
    cameraX = me.x - canvas.width / 2;
    cameraY = me.y - canvas.height / 2;
    if (cameraX < 0) cameraX = 0;
    if (cameraX > WORLD_WIDTH - canvas.width) cameraX = WORLD_WIDTH - canvas.width;
    if (cameraY < 0) cameraY = 0;
    if (cameraY > WORLD_HEIGHT - canvas.height) cameraY = WORLD_HEIGHT - canvas.height;
  }
  for (const c of clouds) {
    c.x += c.vx;
    if (c.x > WORLD_WIDTH) c.x = -50;
  }
  draw();
  requestAnimationFrame(update);
}

function drawGoomba(x, y, color, name) {
  ctx.fillStyle = color || '#8B4513';
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
  if (name === 'Fleekshots') {
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 1, y + 8, SIZE - 2, 4);
  }
}

function draw() {
  ctx.fillStyle = '#87CEEB';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // clouds
  ctx.fillStyle = '#fff';
  for (const c of clouds) {
    ctx.beginPath();
    ctx.ellipse(c.x - cameraX, c.y - cameraY, 20, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#228B22';
  ctx.fillRect(0, GROUND_Y - cameraY, canvas.width, canvas.height - (GROUND_Y - cameraY));
  // Draw blocks
  for (const b of blocks) {
    if (b.type === 'vine') {
      ctx.fillStyle = '#0f0';
      ctx.fillRect(b.x - cameraX + SIZE/2 - 2, b.y - cameraY, 4, SIZE);
    } else {
      ctx.fillStyle = b.color || '#888';
      ctx.fillRect(b.x - cameraX, b.y - cameraY, SIZE, SIZE);
    }
  }
  for (const [id, p] of Object.entries(players)) {
    drawGoomba(p.x - cameraX, p.y - cameraY, p.color, p.name);
    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x - cameraX + SIZE / 2, p.y - cameraY - 2);
  }

  ctx.fillStyle = 'red';
  for (const pr of projectiles) {
    ctx.beginPath();
    ctx.arc(pr.x - cameraX, pr.y - cameraY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

}

function snap(value) {
  return Math.floor(value / SIZE) * SIZE;
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function collideWithPlayers(p) {
  for (const [id, op] of Object.entries(players)) {
    if (id === playerId) continue;
    if (rectsOverlap(p.x, p.y, SIZE, SIZE, op.x, op.y, SIZE, SIZE)) {
      const overlapX = Math.min(p.x + SIZE, op.x + SIZE) - Math.max(p.x, op.x);
      const overlapY = Math.min(p.y + SIZE, op.y + SIZE) - Math.max(p.y, op.y);
      if (overlapX < overlapY) {
        if (p.x < op.x) p.x -= overlapX;
        else p.x += overlapX;
      } else {
        if (p.y < op.y) {
          p.y -= overlapY;
          p.onGround = true;
        } else {
          p.y += overlapY;
        }
        p.vy = 0;
      }
    }
  }
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousemove', (e) => {
  mouse.x = e.offsetX;
  mouse.y = e.offsetY;
});

canvas.addEventListener('mousedown', (e) => {
  const worldX = snap(cameraX + e.offsetX);
  const worldY = snap(cameraY + e.offsetY);
  const block = { x: worldX, y: worldY };
  if (e.button === 0) {
    block.type = 'solid';
    socket.emit('placeBlock', block);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') input.left = true;
  if (e.key === 'ArrowRight') input.right = true;
  if (e.key === ' ') input.jump = true;
  if (e.key === 'ArrowUp') { input.up = true; input.jump = true; }
  if (e.key === 'r' || e.key === 'R') {
    const worldX = snap(cameraX + mouse.x);
    const worldY = snap(cameraY + mouse.y);
    socket.emit('placeBlock', { x: worldX, y: worldY, type: 'vine' });
  }
  if (e.key === 'q' || e.key === 'Q') {
    socket.emit('shoot', { x: cameraX + mouse.x, y: cameraY + mouse.y });
  }
  if (e.key === 'y' || e.key === 'Y') {
    const worldX = snap(cameraX + mouse.x);
    const worldY = snap(cameraY + mouse.y);
    socket.emit('removeBlock', { x: worldX, y: worldY });
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') input.left = false;
  if (e.key === 'ArrowRight') input.right = false;
  if (e.key === ' ') input.jump = false;
  if (e.key === 'ArrowUp') { input.up = false; input.jump = false; }
});
