const socket = io();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const joinBtn = document.getElementById('join');
const colorSelect = document.getElementById('color');

const SIZE = 20;
const GROUND_Y = canvas.height - 50;
const WORLD_WIDTH = 2000;
const SPEED = 6;
const GRAVITY = 0.6;
const JUMP_VEL = -12;
const CLIMB_SPEED = 4;

let playerId = null;
let players = {};
let blocks = [];
let cameraX = 0;
const input = { left: false, right: false, jump: false, up: false };

joinBtn.addEventListener('click', () => {
  const color = colorSelect.value;
  socket.emit('join', color);
  joinBtn.style.display = 'none';
  colorSelect.style.display = 'none';
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
}

function update() {
  const me = players[playerId];
  if (me) {
    handleInput(me);
    applyPhysics(me);
    collideWithPlayers(me);
    socket.emit('update', { x: me.x, y: me.y });
    cameraX = me.x - canvas.width / 2;
    if (cameraX < 0) cameraX = 0;
    if (cameraX > WORLD_WIDTH - canvas.width) cameraX = WORLD_WIDTH - canvas.width;
  }
  draw();
  requestAnimationFrame(update);
}

function drawGoomba(x, y, color) {
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
}

function draw() {
  ctx.fillStyle = '#87CEEB';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#228B22';
  ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
  // Draw blocks
  for (const b of blocks) {
    if (b.type === 'vine') {
      ctx.fillStyle = '#0f0';
      ctx.fillRect(b.x - cameraX + SIZE/2 - 2, b.y, 4, SIZE);
    } else {
      ctx.fillStyle = '#888';
      ctx.fillRect(b.x - cameraX, b.y, SIZE, SIZE);
    }
  }
  for (const [id, p] of Object.entries(players)) {
    drawGoomba(p.x - cameraX, p.y, p.color);
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

canvas.addEventListener('mousedown', (e) => {
  const worldX = snap(cameraX + e.offsetX);
  const worldY = snap(e.offsetY);
  const block = { x: worldX, y: worldY };
  if (e.button === 0) {
    block.type = 'solid';
    socket.emit('placeBlock', block);
  } else if (e.button === 2) {
    block.type = 'vine';
    socket.emit('placeBlock', block);
  } else if (e.button === 1) {
    socket.emit('removeBlock', block);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') input.left = true;
  if (e.key === 'ArrowRight') input.right = true;
  if (e.key === ' ') input.jump = true;
  if (e.key === 'ArrowUp') { input.up = true; input.jump = true; }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') input.left = false;
  if (e.key === 'ArrowRight') input.right = false;
  if (e.key === ' ') input.jump = false;
  if (e.key === 'ArrowUp') { input.up = false; input.jump = false; }
});
