// === Twitch Verbindung ===
let TwitchChannel;
let currentTheme = 'sommer';
let client;

// === Chatnamen & Spielerlisten ===
let chatUsers = new Set();
let activeNames = new Set();
let scoreboard = {};
let finishedCharacters = [];
let unnamedCharactersWaitingForChatName = [];

// === Spielvariablen ===
const FIELD_SIZE = 70;
const CHARACTER_SIZE = 50;
const SPAWN_PROTECTION_DURATION = 1000;
let canvas, ctx;

// === Bilder ===
let characterImg = new Image();
let pokerImg = new Image();
let endImg = new Image();
let crownImg = new Image();
let portalImg = new Image();
let ladderImg = new Image();
let snakeImg = new Image();
let boardFields = [];

// === Bilder-Pfade ===
const IMAGE_SOURCES = {
  sommer: {
    character: 'assets/img/sommer/character.png',
    poker: 'assets/img/sommer/poker.png',
    end: 'assets/img/sommer/end.png',
    crown: 'assets/img/sommer/crown.png',
    portal: 'assets/img/sommer/portal.png',
    walk: 'assets/img/sommer/walk.png',
    ladder: 'assets/img/sommer/ladder.png',
    snake: 'assets/img/sommer/snake.png',
    start: 'assets/img/sommer/start.png',
    finish: 'assets/img/sommer/finish.png'
  },
  christmas: {
    character: 'assets/img/christmas/winter_character.png',
    poker: 'assets/img/christmas/winter_poker.png',
    end: 'assets/img/christmas/winter_finish.png',
    crown: 'assets/img/christmas/winter_crown.png',
    portal: 'assets/img/christmas/winter_portal.png',
    walk: 'assets/img/christmas/winter_walk.png',
    ladder: 'assets/img/christmas/winter_ladder.png',
    snake: 'assets/img/christmas/winter_snake.png',
    start: 'assets/img/christmas/winter_start.png',
    finish: 'assets/img/christmas/winter_finish.png'
  }
};

// === Figurenliste ===
let maennchenListe = [];

// === Hilfsfunktionen ===
function getRandomColor() {
  return '#' + Math.floor(Math.random()*16777215).toString(16);
}

function getFieldCoordinates(fieldNumber) {
  if (fieldNumber < 1) fieldNumber = 1;
  if (fieldNumber > 100) fieldNumber = 100;
  const boardCols = 10;
  const rowFromBottom = Math.ceil(fieldNumber / boardCols);
  const rowFromTop = 10 - rowFromBottom;
  let col = (rowFromBottom % 2 !== 0) ?
    (fieldNumber - 1) % boardCols :
    boardCols - 1 - ((fieldNumber - 1) % boardCols);
  const startX = (canvas.width - boardCols * FIELD_SIZE) / 2;
  const startY = (canvas.height - boardCols * FIELD_SIZE) / 2;
  return {
    x: startX + col * FIELD_SIZE + FIELD_SIZE / 2 - CHARACTER_SIZE / 2,
    y: startY + rowFromTop * FIELD_SIZE + FIELD_SIZE / 2 - CHARACTER_SIZE / 2
  };
}

// === Spielfigur ===
class Maennchen {
  constructor(fieldNumber = 1, assignedName = null) {
    this.currentField = fieldNumber;
    const coords = getFieldCoordinates(this.currentField);
    this.x = coords.x;
    this.y = coords.y;
    this.width = CHARACTER_SIZE;
    this.height = CHARACTER_SIZE;
    this.name = assignedName || null;
    this.nameColor = this.name ? getRandomColor() : 'gray';
    if (this.name) activeNames.add(this.name);
    else unnamedCharactersWaitingForChatName.push(this);
  }

  moveToField(targetField) {
    this.currentField = targetField > 100 ? 100 : targetField;
    const coords = getFieldCoordinates(this.currentField);
    this.x = coords.x;
    this.y = coords.y;
  }

  draw() {
    ctx.drawImage(characterImg, this.x, this.y, this.width, this.height);
    if (this.name) {
      ctx.fillStyle = this.nameColor;
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(this.name, this.x + this.width/2, this.y - 5);
    }
  }
}

// === Spiel-Rendering ===
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  boardFields.forEach(f => {
    if (f.image) ctx.drawImage(f.image, f.x, f.y, FIELD_SIZE, FIELD_SIZE);
    else {
      ctx.fillStyle = '#ccc';
      ctx.fillRect(f.x, f.y, FIELD_SIZE, FIELD_SIZE);
    }
    ctx.strokeStyle = '#000';
    ctx.strokeRect(f.x, f.y, FIELD_SIZE, FIELD_SIZE);
  });

  maennchenListe.forEach(m => m.draw());
  requestAnimationFrame(animate);
}

// === Würfel-Logik (synchron) ===
let diceRollInterval = null;
const DICE_ROLL_DELAY = 5000;

function startDiceRollLoop() {
  if (diceRollInterval) clearInterval(diceRollInterval);
  diceRollInterval = setInterval(() => {
    if (maennchenListe.length === 0) return;
    console.log(`[SYNC] Starte neuen Wurf für ${maennchenListe.length} Spieler...`);
    maennchenListe.forEach(char => {
      const roll = Math.floor(Math.random() * 6) + 1;
      console.log(`[SYNC] ${char.name || 'Unbenannt'} würfelt ${roll}`);
      char.moveToField(char.currentField + roll);
    });
  }, DICE_ROLL_DELAY);
}

// === Initialisierung ===
function initializeGameCore() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Felder vorbereiten
  for (let i = 1; i <= 100; i++) {
    const coords = getFieldCoordinates(i);
    const img = new Image();
    img.src = IMAGE_SOURCES[currentTheme].walk;
    boardFields.push({ fieldNumber: i, x: coords.x, y: coords.y, image: img });
  }

  // Bilder laden
  const sources = IMAGE_SOURCES[currentTheme];
  characterImg.src = sources.character;

  animate();
  startDiceRollLoop();

  // Twitch verbinden
  client = new tmi.Client({ options: { debug: true }, channels: [TwitchChannel] });
  client.connect().then(() => {
    console.log(`Verbunden mit ${TwitchChannel}`);
    client.on('chat', (channel, userstate, message, self) => {
      if (self) return;
      const name = userstate['display-name'];
      chatUsers.add(name);
      if (!maennchenListe.find(m => m.name === name) && !finishedCharacters.includes(name)) {
        const m = new Maennchen(1, name);
        maennchenListe.push(m);
      }
    });
  });
}

// === Start bei Laden ===
window.onload = () => {
  canvas = document.getElementById('brbCanvas');
  ctx = canvas.getContext('2d');

  // Channel aus URL oder Input
  const params = new URLSearchParams(window.location.search);
  TwitchChannel = params.get('channel') || 'StandardChannel';
  currentTheme = params.get('theme') || 'sommer';

  initializeGameCore();
};
