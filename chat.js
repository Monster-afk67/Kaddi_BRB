// === Twitch Verbindung ===
let siteURL = new URL(window.location);
let TwitchChannel;

const channelParam = siteURL.searchParams.get("channel");
if (channelParam) {
  TwitchChannel = channelParam.toLowerCase().split(",");
} else {
  console.error("No 'channel' parameter found in URL. Please add ?channel=yourchannel to the URL for live chat.");
  TwitchChannel = ['yourdefaultchannel'];
}

// === Verbindung erstellen ===
const client = new tmi.Client({
  options: { debug: true },
  channels: TwitchChannel
});

// === Chatnamen speichern ===
let chatUsers = new Set();
let activeMaleNames = new Set();
let scoreboard = {};
let unnamedCharactersWaitingForChatName = [];

// === Konstanten ===
const FIELD_SIZE = 70; // Angepasst an die Größe eines Feldes für das Brettspiel
const CHARACTER_SIZE = 50; // Verkleinert für bessere Passform auf Feldern
const FINISH_LINE_SIZE = FIELD_SIZE; // Finish Line ist Feld 100

const SPAWN_PROTECTION_DURATION = 1000;

const DICE_ROLL_INTERVAL_CLASSIC_MODE = 5000; // Würfel alle 5 Sekunden im Klassischen Modus

// === Globale Variablen ===
let canvas, ctx;
let characterImg = new Image();
let pokerImg = new Image();
let endImg = new Image();
let crownImg = new Image();
let portalImg = new Image(); // Portal Bild

// Neue Bildvariablen für die Felder
let fieldImages = {}; // Objekt, um alle geladenen Feldbilder zu speichern
let ladderImg = new Image(); // Bild für Leitern
let snakeImg = new Image(); // Bild für Schlangen

// === Grafik-Sichtbarkeits-Modus ===
let showGraphics = true;

let diceRollTimer; // Timer für den synchronen Würfelwurf

let finishLine = {};
let finishedCharacters = []; // Speichert nur Namen der Spieler, die schon einmal das Ziel erreicht haben

let boardFields = []; // Array zur Speicherung der Feldobjekte

// === UI Elemente für den Modus ===
let gameModeInfoDiv; // Das Div für Spielernamen im Klassischen Modus
let currentTurnPlayerDisplay; // Zum Anzeigen des Status "Würfeln für alle..."

// Definition von Leitern und Schlangen für das Brettspiel
const laddersAndSnakes = [
  // Leitern
  { start: 4, end: 24, type: 'ladder', displayUntil: 0 },
  { start: 21, end: 42, type: 'ladder', displayUntil: 0 },
  { start: 58, end: 81, type: 'ladder', displayUntil: 0 },
  { start: 73, end: 94, type: 'ladder', displayUntil: 0 },
  { start: 9, end: 30, type: 'ladder', displayUntil: 0 },

  // Schlangen
  { start: 98, end: 77, type: 'snake', displayUntil: 0 },
  { start: 47, end: 26, type: 'snake', displayUntil: 0 },
  { start: 62, end: 18, type: 'snake', displayUntil: 0 },
  { start: 16, end: 6, type: 'snake', displayUntil: 0 },

  // Die "Power"- und "Lower"-Felder aus der vorherigen Version beibehalten
  { start: 100, type: 'power', moveBy: 2 },
  { start: 19, type: 'power', moveBy: 2 },
  { start: 9, type: 'power', moveBy: 2 },
  { start: 69, type: 'lower', moveBy: -2 },
  { start: 51, type: 'lower', moveBy: -2 },
  { start: 75, type: 'lower', moveBy: -2 }
];

// Felder, auf denen Poker gespielt werden kann
const POKER_FIELDS = [4, 28, 49, 53, 66, 88, 95];


// === Hilfsfunktionen ===
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) color += letters[Math.floor(Math.random() * 16)];
  return color;
}

function getAvailableName() {
  const chatUserNames = Array.from(chatUsers);
  // Filtert Namen, die nicht aktiv sind und noch nicht das Ziel erreicht haben
  const availableNames = chatUserNames.filter(name => !activeMaleNames.has(name) && !finishedCharacters.includes(name));
  return availableNames.length > 0 ? availableNames[Math.floor(Math.random() * availableNames.length)] : null;
}

function releaseNameAndAssignToWaitingCharacter(freedName) {
  if (chatUsers.has(freedName) && unnamedCharactersWaitingForChatName.length > 0) {
    const charToName = unnamedCharactersWaitingForChatName.shift();
    charToName.name = freedName;
    activeMaleNames.add(freedName);
    charToName.nameColor = getRandomColor();
    console.log(`Zuvor unbenannter Charakter wurde zu ${charToName.name} benannt.`);
    updateScoreboardDisplay(); // Scoreboard aktualisieren, da ein Name zugewiesen wurde
  }
}

/**
 * Berechnet die Pixelkoordinaten für eine gegebene Feldnummer auf einem 10x10 Brett.
 * Das Brett hat Feld 1 unten links, geht von links nach rechts, dann die nächste Reihe von rechts nach links (Schlangenmuster).
 * Feld 100 ist oben links.
 * @param {number} fieldNumber Die Feldnummer (1-100).
 * @returns {{x: number, y: number}} Die X/Y Pixelkoordinaten des Zentrums des Feldes.
 */
function getFieldCoordinates(fieldNumber) {
  if (fieldNumber < 1) fieldNumber = 1;
  if (fieldNumber > 100) fieldNumber = 100;

  const boardCols = 10;
  const boardRows = 10;

  // Reihe von unten gezählt (1-10)
  const rowFromBottom = Math.ceil(fieldNumber / boardCols);
  // Reihe von oben gezählt (0-9 für Array-Indizes)
  const rowFromTop = boardRows - rowFromBottom;

  let col;
  if (rowFromBottom % 2 !== 0) {
    // Ungerade Reihen (von unten, d.h. 1, 3, 5...) gehen von links nach rechts (Feld 1-10, 21-30 etc.)
    col = (fieldNumber - 1) % boardCols;
  } else {
    // Gerade Reihen (von unten, d.h. 2, 4, 6...) gehen von rechts nach links (Feld 20-11, 40-31 etc.)
    col = boardCols - 1 - ((fieldNumber - 1) % boardCols);
  }

  const boardPixelWidth = boardCols * FIELD_SIZE;
  const boardPixelHeight = boardRows * FIELD_SIZE;

  const startX = (canvas.width - boardPixelWidth) / 2;
  const startY = (canvas.height - boardPixelHeight) / 2;

  // X und Y für die obere linke Ecke des Charakters im Feld
  // Feld-X + (Feld-Größe / 2) - (Charakter-Größe / 2) zentriert den Charakter im Feld
  const x = startX + col * FIELD_SIZE + FIELD_SIZE / 2 - CHARACTER_SIZE / 2;
  const y = startY + rowFromTop * FIELD_SIZE + FIELD_SIZE / 2 - CHARACTER_SIZE / 2;

  return { x: x, y: y };
}

/**
 * Calculates the path (sequence of field numbers) for animation.
 * @param {number} startFieldNum The starting field number.
 * @param {number} endFieldNum The final destination field number.
 * @returns {Array<number>} An array of field numbers for each step in the path.
 */
function getAnimationPath(startFieldNum, endFieldNum) {
    const path = [];
    let current = startFieldNum;
    let step = (endFieldNum > startFieldNum) ? 1 : -1;

    path.push(current); // Include the starting field

    while (current !== endFieldNum) {
        current += step;
        path.push(current);
    }
    return path;
}


class Männchen {
  constructor(fieldNumber = 1, assignedName = null) {
    this.currentField = fieldNumber;
    const coords = getFieldCoordinates(this.currentField);
    this.x = coords.x;
    this.y = coords.y;
    this.width = CHARACTER_SIZE;
    this.height = CHARACTER_SIZE;
    this.lastChatTime = Date.now();
    this.name = assignedName;
    this.nameColor = 'gray';
    this.state = 'alive';
    this.interactionCooldownUntil = 0;
    this.spawnProtectionUntil = Date.now() + SPAWN_PROTECTION_DURATION;
    this.startTime = Date.now(); // Zeitpunkt, zu dem der Charakter gespawnt wurde
    this.isPortaled = false; // Für die Portal-Animation

    // Animation properties
    this.isMoving = false;
    this.animationPath = []; // Stores field numbers for the path
    this.currentPathIndex = 0;
    this.animationMoveTarget = { x: this.x, y: this.y }; // Current pixel target for animation step
    this.animationSpeed = 2; // Pixels per frame
    this.finalDestinationField = fieldNumber; // The ultimate field character will land on after all animations/effects

    if (this.name) {
      this.nameColor = getRandomColor();
      if (chatUsers.has(this.name) && !activeMaleNames.has(this.name)) activeMaleNames.add(this.name);
    } else {
      const availableName = getAvailableName();
      if (availableName) {
        this.name = availableName;
        activeMaleNames.add(availableName);
        this.nameColor = getRandomColor();
      } else {
        this.name = null;
        unnamedCharactersWaitingForChatName.push(this);
        this.nameColor = 'gray';
      }
    }
  }

  // Initiates movement animation to a target field
  startMovementAnimation(targetFieldNum) {
    // Stop any ongoing animation
    this.isMoving = false;
    this.animationPath = [];
    this.currentPathIndex = 0;

    this.finalDestinationField = targetFieldNum; // Store the ultimate target

    // Build the animation path (field numbers)
    this.animationPath = getAnimationPath(this.currentField, this.finalDestinationField);

    if (this.animationPath.length > 0) {
      this.isMoving = true;
      this.currentPathIndex = 0;
      // Set the first pixel target in the path (center of the first field in the path)
      const firstTargetCoords = getFieldCoordinates(this.animationPath[this.currentPathIndex]);
      this.animationMoveTarget.x = firstTargetCoords.x;
      this.animationMoveTarget.y = firstTargetCoords.y;
    } else {
        // Already at the target, or path is empty
        this.x = getFieldCoordinates(this.finalDestinationField).x;
        this.y = getFieldCoordinates(this.finalDestinationField).y;
        this.currentField = this.finalDestinationField;
        this.checkFieldEffects(); // Apply effects immediately
        updateScoreboardDisplay(); // Scoreboard aktualisieren, da Bewegung abgeschlossen
    }
  }

  // Updates character position during animation
  updateAnimation() {
    if (!this.isMoving) return;

    const dx = this.animationMoveTarget.x - this.x;
    const dy = this.animationMoveTarget.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < this.animationSpeed) {
      // Reached current segment target field, snap to it
      this.x = this.animationMoveTarget.x;
      this.y = this.animationMoveTarget.y;

      const previousField = this.currentField; // Store previous field to check for change
      this.currentField = this.animationPath[this.currentPathIndex]; // Update currentField to reflect reached field in path

      // Call checkFieldEffects if the field actually changed
      if (this.currentField !== previousField) {
        this.checkFieldEffects();
      }

      this.currentPathIndex++;
      if (this.currentPathIndex >= this.animationPath.length) {
        // Full animation sequence finished
        this.isMoving = false;
        this.animationPath = [];
        this.currentPathIndex = 0;

        // Ensure final position is exactly the final destination and apply effects
        this.currentField = this.finalDestinationField;
        const finalCoords = getFieldCoordinates(this.currentField);
        this.x = finalCoords.x;
        this.y = finalCoords.y;

        // One last check for effects on the *final* landing field,
        // in case the path was only 1 step long or effects weren't checked during path
        this.checkFieldEffects();
        updateScoreboardDisplay(); // Scoreboard aktualisieren, da Bewegung abgeschlossen
      } else {
        // Move to the next field in the path
        const nextTargetCoords = getFieldCoordinates(this.animationPath[this.currentPathIndex]);
        this.animationMoveTarget.x = nextTargetCoords.x;
        this.animationMoveTarget.y = nextTargetCoords.y;
      }
    } else {
      // Move towards current segment target
      this.x += (dx / distance) * this.animationSpeed;
      this.y += (dy / distance) * this.animationSpeed;
    }
  }

  // This is the primary method to move a character
  moveToField(targetField, isInstant = false) {
    if (isInstant) {
      this.currentField = targetField;
      const finalCoords = getFieldCoordinates(this.currentField);
      this.x = finalCoords.x;
      this.y = finalCoords.y;
      this.isMoving = false; // Ensure no lingering animation state
      this.animationPath = [];
      this.currentPathIndex = 0;
      this.checkFieldEffects(); // Apply effects immediately for instant moves (if any further effects)
      updateScoreboardDisplay(); // Update scoreboard immediately for instant moves
    } else {
      this.startMovementAnimation(targetField);
    }
  }

  checkFieldEffects() {
    // If still animating and not an instant move, don't check effects yet.
    // This check is primarily for animated moves. Instant moves call checkFieldEffects after position update.
    if (this.isMoving) return;

    const currentEffect = laddersAndSnakes.find(effect => effect.start === this.currentField);
    if (currentEffect) {
      let newField = this.currentField;
      let effectMessage = "";
      let instantMove = false; // Flag to determine if the move should be instant

      if (currentEffect.type === 'ladder' || currentEffect.type === 'snake') {
        newField = currentEffect.end;
        if (currentEffect.start < currentEffect.end) {
            effectMessage = `ist auf einer Leiter und geht zu Feld ${currentEffect.end}!`;
        } else if (currentEffect.start > currentEffect.end) {
            effectMessage = `ist auf einer Schlange und geht zu Feld ${newField}!`;
        }
        // Leiter/Schlange für 3 Sekunden sichtbar machen
        currentEffect.displayUntil = Date.now() + 3000;
        instantMove = true; // Make ladder/snake moves instant

      } else if (currentEffect.type === 'power') {
        newField = this.currentField + currentEffect.moveBy;
        if (newField > 100) newField = 100;
        effectMessage = `ist auf einem Power-Feld und springt zu Feld ${newField}!`;
      } else if (currentEffect.type === 'lower') {
        newField = this.currentField + currentEffect.moveBy;
        if (newField < 1) newField = 1;
        effectMessage = `ist auf einem Lower-Feld und fällt zurück zu Feld ${newField}!`;
      }

      if (newField !== this.currentField) {
        this.moveToField(newField, instantMove); // Use the instantMove flag
      }
    }
  }

  draw() {
    ctx.save();
    // Transparenz-Berechnung entfernt, Alpha ist immer 1.0
    ctx.globalAlpha = 1.0;

    ctx.drawImage(characterImg, this.x, this.y, this.width, this.height);

    // Portal-Bild zeichnen, wenn Charakter "portaled" ist
    if (this.isPortaled && portalImg.complete && portalImg.naturalWidth > 0) {
        const portalSize = 25; // Feste Größe von 25x25px
        // Positionierung über dem Kopf des Charakters
        const portalX = this.x + (this.width / 2) - (portalSize / 2); // Zentriert über dem Charakter
        const portalY = this.y - portalSize - 5; // 5 Pixel über dem oberen Rand des Charakters
        ctx.drawImage(portalImg, portalX, portalY, portalSize, portalSize);
    }

    ctx.restore();
    if (this.name) {
      ctx.fillStyle = this.nameColor;
      ctx.font = '12px Arial';
      ctx.textAlign = 'center'; // Text zentrieren
      let textX = this.x + (this.width / 2); // X-Koordinate für die Mitte des Charakters
      ctx.fillText(this.name, textX, this.y - 5);
    }
  }
}

let männchenListe = [];

function loadImages(sources, callback) {
  let images = {};
  let loadedImages = 0;
  let numImages = Object.keys(sources).length;
  for (let src in sources) {
    images[src] = new Image();
    images[src].onload = () => {
      if (++loadedImages >= numImages) {
        callback(images);
      }
    };
    images[src].onerror = () => {
        console.error(`Fehler beim Laden von Bild: ${images[src].src}`);
        if (++loadedImages >= numImages) {
            callback(images);
        }
    };
    images[src].src = sources[src];
  }
  return images;
}

function toggleGraphicsVisibility() {
  showGraphics = !showGraphics;
  console.log(`Grafiken ${showGraphics ? 'angezeigt' : 'ausgeblendet'}.`);
  const button = document.getElementById('toggleGraphicsButton');
  if (button) {
    button.textContent = showGraphics ? 'Grafiken verbergen' : 'Grafiken anzeigen';
  }
}

// === Klassischer Modus Logik Objekt ===
const classicModeLogic = {
    isGameRunning: false,
    turnInterval: null, // Timer für den synchronen Würfelwurf

    startGame: function() {
        console.log("Starte Klassischen Modus...");
        this.isGameRunning = true;
        // männchenListe wird nicht zurückgesetzt, damit Charaktere über Runden hinweg bestehen bleiben
        currentTurnPlayerDisplay.textContent = 'Warten auf Charaktere...'; // Anpassung des Textes
        gameModeInfoDiv.style.display = 'block'; // Zeige UI an
        this.startTurnLoop(); // Starte den Würfel-Loop direkt
    },

    startTurnLoop: function() {
        if (this.turnInterval) clearInterval(this.turnInterval); // Alten Timer löschen
        this.turnInterval = setInterval(() => {
            if (!this.isGameRunning) {
                clearInterval(this.turnInterval);
                this.turnInterval = null;
                return;
            }
            // Alle aktiven Charaktere würfeln gleichzeitig
            currentTurnPlayerDisplay.textContent = 'Würfeln für alle Charaktere...'; // Aktualisiere UI vor dem Würfeln

            männchenListe.forEach(char => {
                // Charaktere, die sich bewegen, spielen Poker oder sind fertig, würfeln nicht
                if (char.state === 'alive' && !char.isMoving && char.interactionCooldownUntil < Date.now()) {
                    const roll = Math.floor(Math.random() * 6) + 1;
                    // Der normale Würfelwurf soll weiterhin animiert sein
                    char.moveToField(char.currentField + roll);
                    console.log(`[Klassischer Modus] ${char.name} würfelt eine ${roll} und zieht von Feld ${char.currentField} nach ${char.currentField + roll}.`);
                }
            });

        }, DICE_ROLL_INTERVAL_CLASSIC_MODE);
    },

    endGame: function() {
        console.log("Klassischer Modus beendet. (Alle Charaktere im Ziel). Starte neue Runde...");
        this.isGameRunning = false;
        clearInterval(this.turnInterval);
        this.turnInterval = null;
        männchenListe = []; // Charaktere zurücksetzen
        finishedCharacters = []; // Auch die Liste der fertigen Charaktere zurücksetzen
        activeMaleNames.clear(); // Aktive Namen zurücksetzen
        unnamedCharactersWaitingForChatName = []; // Wartende Charaktere zurücksetzen
        updateScoreboardDisplay(); // Scoreboard aktualisieren nach Reset
        this.startGame(); // Starte sofort neue Runde
    }
};


function init() {
  canvas = document.getElementById('brbCanvas');
  ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const toggleGraphicsButton = document.getElementById('toggleGraphicsButton');
  if (toggleGraphicsButton) {
    toggleGraphicsButton.addEventListener('click', toggleGraphicsVisibility);
    toggleGraphicsButton.textContent = showGraphics ? 'Grafiken verbergen' : 'Grafiken anzeigen';
  }

  // === UI Elemente für den Klassischen Modus ===
  gameModeInfoDiv = document.getElementById('gameModeInfo');
  currentTurnPlayerDisplay = document.getElementById('currentTurnPlayer');


  finishLine = getFieldCoordinates(100);
  finishLine.width = FINISH_LINE_SIZE;
  finishLine.height = FINISH_LINE_SIZE;

  const boardCols = 10;
  const boardRows = 10;
  const boardPixelWidth = boardCols * FIELD_SIZE;
  const boardPixelHeight = boardRows * FIELD_SIZE;
  const startX = (canvas.width - boardPixelWidth) / 2;
  const startY = (canvas.height - boardPixelHeight) / 2;
  const adjustment = (FIELD_SIZE - CHARACTER_SIZE) / 2;

  for (let i = 1; i <= 100; i++) {
    const charCoords = getFieldCoordinates(i);
    const fieldX = charCoords.x - adjustment;
    const fieldY = charCoords.y - adjustment;
    boardFields.push({
      fieldNumber: i,
      x: fieldX,
      y: fieldY,
      width: FIELD_SIZE,
      height: FIELD_SIZE,
      image: null,
      mirrored: false
    });
  }

  const imageSources = {
    character: 'character.png',
    poker: 'poker.png',
    end: 'end.png',
    crown: 'crown.png',
    portal: 'portal.png',
    walk: 'walk.png',
    poker_walk: 'poker_walk.png',
    power_walk: 'power_walk.png',
    lower_walk: 'lower_walk.png',
    curve_right_up: 'curve_right-up.png',
    curve_right_down: 'curve_right-down.png',
    ladder: 'ladder.png',
    snake: 'snake.png',
    start: 'start.png',
    finish: 'finish.png'
  };

  fieldImages = loadImages(imageSources, images => {
    characterImg.src = images.character.src;
    pokerImg.src = images.poker.src;
    endImg.src = images.end.src;
    crownImg.src = images.crown.src;
    portalImg.src = images.portal.src;
    ladderImg = images.ladder;
    snakeImg = images.snake;

    const pokerWalkFields = [4, 19, 23, 28, 49, 53, 66, 71, 88, 95];
    const powerWalkFields = [100, 19, 9];
    const lowerWalkFields = [75, 69, 51];
    const curveRightUpFields = [10, 30, 50, 70, 90];
    const curveRightDownFields = [11, 31, 51, 71, 91];
    const mirroredCurveRightUpFields = [20, 40, 60, 80];
    const mirroredCurveRightDownFields = [21, 41, 61, 81];
    const fieldsToToggleMirror = [75, 69, 19];


    boardFields.forEach(field => {
        const rowFromBottom = Math.ceil(field.fieldNumber / boardCols);
        const isRightToLeftRow = rowFromBottom % 2 === 0;

        field.mirrored = isRightToLeftRow;

        if (fieldsToToggleMirror.includes(field.fieldNumber)) {
            field.mirrored = !field.mirrored;
        }

        let assignedImage = images.walk;

        if (pokerWalkFields.includes(field.fieldNumber)) {
            assignedImage = images.poker_walk;
        }
        if (powerWalkFields.includes(field.fieldNumber)) {
            assignedImage = images.power_walk;
        }
        if (lowerWalkFields.includes(field.fieldNumber)) {
            assignedImage = images.lower_walk;
        }

        if (curveRightUpFields.includes(field.fieldNumber)) {
            assignedImage = images.curve_right_up;
            field.mirrored = false;
        }
        if (curveRightDownFields.includes(field.fieldNumber)) {
            assignedImage = images.curve_right_down;
            field.mirrored = false;
        }
        if (mirroredCurveRightUpFields.includes(field.fieldNumber)) {
            assignedImage = images.curve_right_up;
            field.mirrored = true;
        }
        if (mirroredCurveRightDownFields.includes(field.fieldNumber)) {
            assignedImage = images.curve_right_down;
            field.mirrored = true;
        }

        if (field.fieldNumber === 1) {
            assignedImage = images.start;
            field.mirrored = false;
        }
        if (field.fieldNumber === 100) {
            assignedImage = images.finish;
            field.mirrored = false;
        }
        // Feld 9 drehen, falls es nicht schon durch andere Logik richtig ist.
        if (field.fieldNumber === 9) {
            field.mirrored = true;
        }


        field.image = assignedImage;
    });

    animate();
    const savedScoreboard = localStorage.getItem('characterScoreboard');
    if (savedScoreboard) scoreboard = JSON.parse(savedScoreboard);
    const savedFinished = localStorage.getItem('finishedCharacters');
    if (savedFinished) finishedCharacters = JSON.parse(savedFinished);

    // Starte den Klassischen Modus beim Laden
    classicModeLogic.startGame();

    client.connect().then(() => console.log(`🤖 Bot ist verbunden mit ${TwitchChannel}`)).catch(console.error);
    updateScoreboardDisplay(); // Initial einmal aufrufen
  });

}

client.on('chat', (channel, userstate, message, self) => {
  if (self) return;
  const displayName = userstate['display-name'];
  chatUsers.add(displayName);
  const existingCharacter = männchenListe.find(m => m.name === displayName);
  if (existingCharacter) {
    existingCharacter.lastChatTime = Date.now();
    return;
  }
  const alreadyFinished = finishedCharacters.includes(displayName);

  if (!alreadyFinished) {
      // Keine maximale Spieleranzahl mehr
      const newCharacter = new Männchen(1, displayName);
      newCharacter.lastChatTime = Date.now();
      newCharacter.nameColor = getRandomColor();
      newCharacter.spawnProtectionUntil = Date.now() + SPAWN_PROTECTION_DURATION;
      newCharacter.startTime = Date.now();
      männchenListe.push(newCharacter);
      activeMaleNames.add(displayName); // Als aktiv markieren
      console.log(`[Klassischer Modus] Neuer Charakter für ${displayName} gespawnt. Gesamt: ${männchenListe.length}`);
      updateScoreboardDisplay(); // Hier sofort aktualisieren
  } else {
      console.log(`Charakter ${displayName} hat das Ziel bereits erreicht und kann nicht erneut spawnen.`);
  }
});

function checkCharacterCollision(a, b) {
  if (a === b || Date.now() < a.interactionCooldownUntil || Date.now() < b.interactionCooldownUntil) return false;
  if (Date.now() < a.spawnProtectionUntil || Date.now() < b.spawnProtectionUntil) return false;
  return a.currentField === b.currentField;
}

function handleCharacterCollision(a, b) {
  if (a.state !== 'alive' || b.state !== 'alive' || a.isMoving || b.isMoving) return;

  // Nur Poker spielen, wenn die Kollision auf einem Pokerfeld stattfindet
  if (POKER_FIELDS.includes(a.currentField)) {
      const COOLDOWN_DURATION = 2 * 1000;
      a.interactionCooldownUntil = Date.now() + COOLDOWN_DURATION;
      b.interactionCooldownUntil = Date.now() + COOLDOWN_DURATION;

      if (Math.random() < 0.2) {
        a.state = 'playing_poker';
        b.state = 'playing_poker';
        const POKER_DURATION = 3 * 1000;
        const loser = Math.random() < 0.5 ? a : b;
        const winner = loser === a ? b : a;
        console.log(`${a.name} und ${b.name} spielen Poker. ${winner.name} hat gewonnen!`);
        if (scoreboard[winner.name]) scoreboard[winner.name].pokerWins = (scoreboard[winner.name].pokerWins || 0) + 1;
        else scoreboard[winner.name] = { pokerWins: 1 };
        updateScoreboardDisplay(); // Hier sofort aktualisieren

        // Verlierer erhält Portal-Effekt
        loser.isPortaled = true;

        setTimeout(() => {
          if (a.state === 'playing_poker') a.state = 'alive';
          if (b.state === 'playing_poker') b.state = 'alive';

          // Verlierer geht direkt auf Feld 1 (sollte instant sein)
          loser.moveToField(1, true); // Instant Teleport

          // Gewinner 2 Felder vor (sollte animiert sein)
          winner.moveToField(winner.currentField + 2, false); // Animierter Move

          loser.isPortaled = false; // Portal-Effekt beenden

          winner.spawnProtectionUntil = Date.now() + SPAWN_PROTECTION_DURATION;
          loser.spawnProtectionUntil = Date.now() + SPAWN_PROTECTION_DURATION;

          updateScoreboardDisplay(); // Hier sofort aktualisieren nach Poker-Effekten

        }, POKER_DURATION);
      } else {
        // Bei Nicht-Poker-Kollision im Brettspiel keine Bewegung
      }
  }
}

function updateScoreboardDisplay() {
  const scoreList = document.getElementById('score-list');
  if (!scoreList) return;
  scoreList.innerHTML = '';

  let charactersToDisplay = männchenListe.filter(char => char.state === 'alive' || char.state === 'playing_poker');


  const sortedCharacters = charactersToDisplay
    .sort((a, b) => {
      if (a.currentField !== b.currentField) {
        return b.currentField - a.currentField;
      }
      return a.name.localeCompare(b.name);
    });

  // Maximale Länge des Namens für Formatierung ermitteln
  let maxNameLength = 0;
  sortedCharacters.forEach(char => {
    if (char.name && char.name.length > maxNameLength) {
      maxNameLength = char.name.length;
    }
  });

  sortedCharacters.forEach(char => {
    const li = document.createElement('li');

    let crownHtml = '';
    if (finishedCharacters.includes(char.name)) {
        crownHtml = `<img src="${crownImg.src}" alt="Crown" style="width: 16px; height: 16px; vertical-align: middle; margin-left: 5px;">`;
    }

    // Formatierung der Ausgabe
    const paddedName = char.name.padEnd(maxNameLength, ' ');
    const paddedField = String(char.currentField).padStart(3, ' '); // Feldnummer immer dreistellig (z.B. "  3", " 10", "100")
    li.innerHTML = `${paddedName} | Feld: ${paddedField} ${crownHtml}`;
    scoreList.appendChild(li);
  });

  localStorage.setItem('characterScoreboard', JSON.stringify(scoreboard));
  localStorage.setItem('finishedCharacters', JSON.stringify(finishedCharacters));
}

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1.0;

  boardFields.forEach(field => {
    if (showGraphics) {
      if (field.image) {
        ctx.save();
        let drawX = field.x;
        let drawY = field.y;

        if (field.mirrored) {
          ctx.translate(drawX + field.width, drawY);
          ctx.scale(-1, 1);
          drawX = 0;
          drawY = 0;
        }

        ctx.drawImage(field.image, drawX, drawY, field.width, field.height);
        ctx.restore();
      } else {
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(field.x, field.y, field.width, field.height);
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
        ctx.strokeRect(field.x, field.y, field.width, field.height);
        ctx.fillStyle = '#000000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(field.fieldNumber, field.x + field.width / 2, field.y + field.height / 2);
      }

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(field.fieldNumber, field.x + field.width / 2, field.y + field.height / 2);


    } else {
      const isActionField = laddersAndSnakes.some(effect =>
        (effect.type === 'power' || effect.type === 'lower') && effect.start === field.fieldNumber
      );

      if (isActionField) {
        ctx.fillStyle = '#FFFF00';
      } else {
        ctx.fillStyle = '#333333';
      }

      ctx.fillRect(field.x, field.y, field.width, field.height);
      ctx.strokeStyle = '#999999';
      ctx.lineWidth = 1;
      ctx.strokeRect(field.x, field.y, field.width, field.height);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(field.fieldNumber, field.x + field.width / 2, field.y + field.height / 2);
    }
  });

  if (showGraphics) {
      // === Zeichne Leitern und Schlangen ===
      laddersAndSnakes.forEach(effect => {
        if ((effect.type === 'ladder' || effect.type === 'snake') && (ladderImg.complete && ladderImg.naturalWidth > 0) && (snakeImg.complete && snakeImg.naturalWidth > 0)) {

            // NUR Zeichnen, wenn der displayUntil-Zeitpunkt noch nicht abgelaufen ist
            if (effect.displayUntil > Date.now()) {
                const startCoordsChar = getFieldCoordinates(effect.start);
                const endCoordsChar = getFieldCoordinates(effect.end);

                // Zentren der Felder für die Linie
                const startX = startCoordsChar.x + CHARACTER_SIZE / 2;
                const startY = startCoordsChar.y + CHARACTER_SIZE / 2;
                const endX = endCoordsChar.x + CHARACTER_SIZE / 2;
                const endY = endCoordsChar.y + CHARACTER_SIZE / 2;

                const dx = endX - startX;
                const dy = endY - startY;

                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx); // Angle of the line relative to the x-axis

                const actualImageToDraw = (effect.type === 'ladder') ? ladderImg : snakeImg;

                // Adjust rotation for images that are vertically oriented by default
                // If your images are oriented along their height (top to bottom is length)
                // and you want them to align with the line's angle, you often need to subtract 90 degrees (PI/2 radians).
                const rotationAngle = angle - Math.PI / 2;

                // Scale the image based on its natural height to fit the calculated length
                const scaledWidth = actualImageToDraw.naturalWidth * (length / actualImageToDraw.naturalHeight);

                ctx.save();
                ctx.translate(startX, startY); // Move origin to the start of the line
                ctx.rotate(rotationAngle); // Rotate by the adjusted angle

                // Draw the image:
                // -scaledWidth / 2 : Centers the image horizontally relative to the rotated y-axis
                // 0                : Places the top of the image at the origin (startX, startY in original coords)
                // scaledWidth      : The scaled width of the image
                // length           : The length of the line (which becomes the height of the image)
                ctx.drawImage(actualImageToDraw, -scaledWidth / 2, 0, scaledWidth, length);
                ctx.restore();
            }
        }
      });
  } else {
    ctx.lineWidth = 3;
    laddersAndSnakes.forEach(effect => {
      if (effect.type === 'ladder' || effect.type === 'snake') {
        const startField = boardFields.find(f => f.fieldNumber === effect.start);
        const endField = boardFields.find(f => f.fieldNumber === effect.end);

        if (startField && endField) {
          const startX = startField.x + startField.width / 2;
          const startY = startField.y + startField.height / 2;
          const endX = endField.x + endField.width / 2;
          const endY = endField.y + endField.height / 2;

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);

          if (effect.end > effect.start) {
            ctx.strokeStyle = '#FFFF00';
          } else {
            ctx.strokeStyle = '#FF0000';
          }
          ctx.stroke();
        }
      }
    });
  }

  // === Charaktere werden animiert ===
  for (let i = männchenListe.length - 1; i >= 0; i--) {
    const char = männchenListe[i];
    char.updateAnimation();
    if (showGraphics) {
        char.draw();
    }

    // Kollisionserkennung und Ziel-Erkennung
    if (char.state === 'alive' && !char.isMoving) { // Nur prüfen, wenn Charakter nicht gerade in Bewegung ist
        for (let j = i + 1; j < männchenListe.length; j++) {
            const otherChar = männchenListe[j];
            if (otherChar.state === 'alive' && !otherChar.isMoving && checkCharacterCollision(char, otherChar)) {
                handleCharacterCollision(char, otherChar);
            }
        }

        // Ziel-Erkennung
        if (char.currentField >= 100) {
            if (!finishedCharacters.includes(char.name)) {
                finishedCharacters.push(char.name);
                char.state = 'finished';

                console.log(`[Klassischer Modus] ${char.name} hat das Ziel erreicht.`);
                // Den Charakter aus der aktiven Liste entfernen, da er das Ziel erreicht hat
                const charIndex = männchenListe.indexOf(char);
                if (charIndex > -1) { männchenListe.splice(charIndex, 1); }
                activeMaleNames.delete(char.name);

                updateScoreboardDisplay(); // Hier sofort aktualisieren
            }
        }
    }
  }

  requestAnimationFrame(animate);
}

window.onload = init;