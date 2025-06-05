const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Player and world state
const players = {}; // id -> { x, y, color, name }
const blocks = []; // [{x, y, type, color, indestructible}]
const projectiles = []; // {id, owner, x, y, vx, vy}
const SIZE = 20;
const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 2500;
const GROUND_Y = WORLD_HEIGHT - 50;
const SPAWN_X = WORLD_WIDTH / 2 - SIZE * 2;
const SPAWN_Y = 0;
const CHECK_INTERVAL = 50;
const PROJECTILE_SPEED = 10;
const SHOOT_COOLDOWN = 1000;
const lastShoot = {}; // id -> timestamp

function addBlock(x, y, type = 'solid', color = '#888', indestructible = false) {
  blocks.push({ x, y, type, color, indestructible });
}

const buttons = []; // {id,x,y,pressed}
const turrets = []; // {id,x,y,health}
let buttonsPressed = 0;
let templeOpen = false;
let templeDoor = null;
const turretCooldown = {}; // id -> timestamp

function addRectangle(x, y, w, h, color = '#888', indestructible = false) {
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      // skip interior
      if (i > 0 && i < w - 1 && j > 0 && j < h - 1) continue;
      addBlock(x + i * SIZE, y - j * SIZE, 'solid', color, indestructible);
    }
  }
}

function buildWorld() {
  const spawnWidth = 6;
  const spawnHeight = 2;
  for (let i = 0; i < spawnWidth; i++) {
    for (let j = 0; j < spawnHeight; j++) {
      addBlock(SPAWN_X + i * SIZE, GROUND_Y - (j + 1) * SIZE, 'solid', '#ffff00', true);
    }
  }

  // large wooden house
  addRectangle(500, GROUND_Y, 10, 8, '#a0522d');
  buttons.push({ id: 1, x: 540, y: GROUND_Y - 6 * SIZE, pressed: false });

  // tall stone tower
  addRectangle(1100, GROUND_Y, 12, 10, '#999');
  buttons.push({ id: 2, x: 1160, y: GROUND_Y - 8 * SIZE, pressed: false });

  // metal warehouse
  addRectangle(1700, GROUND_Y, 8, 6, '#555');

  // mine entrance
  const shaftX1 = WORLD_WIDTH - 120;
  const shaftX2 = WORLD_WIDTH - 80;
  for (let y = GROUND_Y; y < WORLD_HEIGHT - SIZE; y += SIZE) {
    addBlock(shaftX1, y, 'solid', '#654321');
    addBlock(shaftX2, y, 'solid', '#654321');
  }

  // lab deep in mine
  const labY = WORLD_HEIGHT - 8 * SIZE;
  addRectangle(shaftX1 - 6 * SIZE, labY, 10, 6, '#444');
  buttons.push({ id: 3, x: shaftX1 - 2 * SIZE, y: labY - 4 * SIZE, pressed: false });
  turrets.push({ id: 't1', x: shaftX1 + 2 * SIZE, y: labY - 2 * SIZE, health: 2 });

  // floating cloud islands
  for (let x = 800; x < 1200; x += SIZE) {
    addBlock(x, GROUND_Y - 20 * SIZE, 'solid', '#f0f8ff');
  }
  for (let x = 2200; x < 2300; x += SIZE) {
    addBlock(x, GROUND_Y - 25 * SIZE, 'solid', '#f0f8ff');
  }

  // golden temple island (closed with door)
  for (let x = 2000; x < 2080; x += SIZE) {
    addBlock(x, GROUND_Y - 23 * SIZE, 'solid', '#f0f8ff');
  }
  addRectangle(2020, GROUND_Y - 23 * SIZE, 4, 4, '#ffd700', true);
  templeDoor = { x: 2038, y: GROUND_Y - 24 * SIZE };
  addBlock(templeDoor.x, templeDoor.y, 'solid', '#ffd700', true);
}

buildWorld();

function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
}

function randomSpawn() {
  return { x: SPAWN_X, y: SPAWN_Y };
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function respawnPlayer(id) {
  const pos = randomSpawn();
  const p = players[id];
  if (!p) return;
  p.x = pos.x;
  p.y = pos.y;
  io.emit('playerRespawn', { id, x: p.x, y: p.y });
}

io.on('connection', (socket) => {
  console.log('user connected', socket.id);

  socket.on('join', ({ color, name }) => {
    const spawn = randomSpawn();
    players[socket.id] = {
      x: spawn.x,
      y: spawn.y,
      color: color || randomColor(),
      name: name || 'Player'
    };
    socket.emit('init', { id: socket.id, players, blocks, buttons, turrets, templeOpen });
    socket.broadcast.emit('playerJoined', { id: socket.id, player: players[socket.id] });
  });

  socket.on('update', (pos) => {
    const player = players[socket.id];
    if (!player) return;
    player.x = Math.max(0, Math.min(WORLD_WIDTH - SIZE, pos.x));
    player.y = Math.max(0, Math.min(WORLD_HEIGHT - SIZE, pos.y));
    players[socket.id] = player;
    socket.broadcast.emit('state', players);
  });

  socket.on('placeBlock', (block) => {
    if (!block) return;
    block.x = Math.max(0, Math.min(WORLD_WIDTH - SIZE, Math.floor(block.x / SIZE) * SIZE));
    block.y = Math.max(0, Math.min(WORLD_HEIGHT - SIZE, Math.floor(block.y / SIZE) * SIZE));
    block.type = block.type === 'vine' ? 'vine' : 'solid';
    const exists = blocks.find(b => b.x === block.x && b.y === block.y);
    if (!exists) {
      blocks.push(block);
      io.emit('blockPlaced', block);
    }
  });

  socket.on('removeBlock', (block) => {
    block.x = Math.floor(block.x / SIZE) * SIZE;
    block.y = Math.floor(block.y / SIZE) * SIZE;
    const index = blocks.findIndex(b => b.x === block.x && b.y === block.y);
    if (index !== -1 && !blocks[index].indestructible) {
      const b = blocks.splice(index, 1)[0];
      io.emit('blockRemoved', b);
    }
  });

  socket.on('pressButton', () => {
    const p = players[socket.id];
    if (!p) return;
    const btn = buttons.find(b => !b.pressed && rectsOverlap(p.x, p.y, SIZE, SIZE, b.x, b.y, SIZE, SIZE));
    if (btn) {
      btn.pressed = true;
      buttonsPressed += 1;
      io.emit('buttonPressed', btn.id);
      if (buttonsPressed >= 3 && !templeOpen) {
        // remove door block
        const index = blocks.findIndex(b => b.x === templeDoor.x && b.y === templeDoor.y);
        if (index !== -1) {
          const b = blocks.splice(index, 1)[0];
          io.emit('blockRemoved', b);
        }
        templeOpen = true;
        io.emit('templeOpened');
      }
    }
  });

  socket.on('shoot', (target) => {
    const p = players[socket.id];
    if (!p) return;
    const now = Date.now();
    if (lastShoot[socket.id] && now - lastShoot[socket.id] < SHOOT_COOLDOWN) return;
    lastShoot[socket.id] = now;
    const startX = p.x + SIZE / 2;
    const startY = p.y + SIZE / 2;
    const dx = target.x - startX;
    const dy = target.y - startY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    projectiles.push({
      id: Date.now() + Math.random(),
      owner: socket.id,
      x: startX,
      y: startY,
      vx: (dx / dist) * PROJECTILE_SPEED,
      vy: (dy / dist) * PROJECTILE_SPEED
    });
  });

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    delete players[socket.id];
    socket.broadcast.emit('playerLeft', socket.id);
  });
});


function updateProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.x += pr.vx;
    pr.y += pr.vy;
    if (pr.x < 0 || pr.y < 0 || pr.x > WORLD_WIDTH || pr.y > WORLD_HEIGHT) {
      projectiles.splice(i, 1);
      continue;
    }
    const bi = blocks.findIndex(b => rectsOverlap(pr.x, pr.y, 2, 2, b.x, b.y, SIZE, SIZE));
    if (bi !== -1 && !blocks[bi].indestructible) {
      const b = blocks.splice(bi, 1)[0];
      io.emit('blockRemoved', b);
      projectiles.splice(i, 1);
      continue;
    }
    for (const [id, p] of Object.entries(players)) {
      if (id === pr.owner) continue;
      if (rectsOverlap(pr.x, pr.y, 2, 2, p.x, p.y, SIZE, SIZE)) {
        respawnPlayer(id);
        projectiles.splice(i, 1);
        break;
      }
    }
    for (const t of turrets) {
      if (rectsOverlap(pr.x, pr.y, 2, 2, t.x, t.y, SIZE, SIZE)) {
        t.health -= 1;
        if (t.health <= 0) {
          const idx = turrets.indexOf(t);
          turrets.splice(idx, 1);
          io.emit('turretDestroyed', t.id);
        }
        projectiles.splice(i, 1);
        break;
      }
    }
  }
  io.emit('projectiles', projectiles);
}

function updateTurrets() {
  for (const t of turrets) {
    const now = Date.now();
    if (turretCooldown[t.id] && now - turretCooldown[t.id] < 1500) continue;
    turretCooldown[t.id] = now;
    // find nearest player
    let target = null;
    let distSq = Infinity;
    for (const [id, p] of Object.entries(players)) {
      const dx = p.x - t.x;
      const dy = p.y - t.y;
      const ds = dx * dx + dy * dy;
      if (ds < distSq) { distSq = ds; target = p; }
    }
    if (target) {
      const dx = target.x - t.x;
      const dy = target.y - t.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      projectiles.push({
        id: Date.now() + Math.random(),
        owner: 'turret_' + t.id,
        x: t.x,
        y: t.y,
        vx: (dx / d) * PROJECTILE_SPEED,
        vy: (dy / d) * PROJECTILE_SPEED
      });
    }
  }
}

setInterval(() => {
  updateProjectiles();
  updateTurrets();
}, CHECK_INTERVAL);

server.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
