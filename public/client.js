const socket = io();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const joinBtn = document.getElementById('join');

let playerId = null;
let players = {};

joinBtn.addEventListener('click', () => {
  socket.emit('join');
  joinBtn.style.display = 'none';
});

socket.on('init', (data) => {
  playerId = data.id;
  players = data.players;
  draw();
});

socket.on('playerJoined', ({ id, player }) => {
  players[id] = player;
});

socket.on('playerLeft', (id) => {
  delete players[id];
});

socket.on('state', (serverPlayers) => {
  players = serverPlayers;
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const [id, p] of Object.entries(players)) {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 20, 20);
  }
  requestAnimationFrame(draw);
}

document.addEventListener('keydown', (e) => {
  if (!playerId) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    const dir = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right'
    }[e.key];
    socket.emit('move', dir);
  }
});
