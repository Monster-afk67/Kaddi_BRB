// === Twitch Verbindung ===
siteURL = new URL(window.location);
TwitchChannel = siteURL.searchParams.get("channel").toLowerCase().split(",");
// === Verbindung erstellen ===
const client = new tmi.Client({
  options: {
    debug: true
  },
  channels: TwitchChannel
});

// === Chatnamen speichern ===
let chatUsers = new Set();
// === Liste der aktuellen Männchen, um Duplikate zu vermeiden ===
let activeMaleNames = new Set(); // Speichert die Namen der aktuell angezeigten Männchen (die von chatUsers stammen)

// Flag, um zu steuern, wann die Lebensdauern der Charaktere aktiv sind
let lifespansActive = false;

// Scoreboard Daten (Name -> { kills: N, babies: M })
let scoreboard = {};

// NEU: Liste für Charaktere, die auf einen Namen von chatUsers warten
let unnamedCharactersWaitingForChatName = [];

// === Konstanten für Lebensdauern und Spawning ===
const BABY_TO_TEEN_TIME = 20 * 1000; // 20 Sekunden als Baby
const TEEN_TO_ADULT_TIME = 60 * 1000; // 1 Minute als Jugendlicher
const ADULT_LIFESPAN = 60 * 1000; // 1 Minute als Erwachsener
const MAX_CHARACTERS = 45; // Erhöht auf 45
const BABY_CREATION_DURATION = 5 * 1000; // Baby-Erstellung dauert 5 Sekunden
const TEEN_INTERACTION_DURATION = 3 * 1000; // Teenager-Interaktion dauert 3 Sekunden
const MAX_BABIES = 15; // NEU: Maximal 15 Babys gleichzeitig

// === Hilfsfunktionen ===

// NEU: Funktion zur Generierung einer zufälligen Farbe
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// NEU: Funktion zur Extraktion der ersten Silbe (vereinfacht)
function getFirstSyllable(name) {
  if (!name) return "";
  let parts = name.split(/[\s-]/); // Trennen nach Leerzeichen oder Bindestrich
  let firstPart = parts[0];
  if (firstPart.length <= 3) return firstPart; // Ganzen kurzen ersten Teil verwenden
  // Vereinfachte Silbentrennung: erste 2-3 Zeichen
  return firstPart.substring(0, 2 + Math.floor(Math.random() * 2)); // 2 oder 3 Zeichen
}

// NEU: Hilfsfunktion für zufälligen, verfügbaren Namen von chatUsers
function getAvailableName() {
  const chatUserNames = Array.from(chatUsers);
  // Filtert Namen, die nicht bereits von einem aktiven Charakter (mit chatUsers-Namen) verwendet werden
  const availableNames = chatUserNames.filter(name => !activeMaleNames.has(name));
  if (availableNames.length > 0) {
    return availableNames[Math.floor(Math.random() * availableNames.length)];
  }
  return null; // Kein verfügbarer Name
}

// NEU: Funktion zur Namensfreigabe und Zuweisung an wartende Charaktere
function releaseNameAndAssignToWaitingCharacter(freedName) {
  // Nur Namen freigeben, die tatsächlich von chatUsers stammen
  if (chatUsers.has(freedName) && unnamedCharactersWaitingForChatName.length > 0) {
    const charToName = unnamedCharactersWaitingForChatName.shift(); // Nimm den ersten wartenden Charakter
    charToName.name = freedName; // Weise den freigewordenen Namen zu
    activeMaleNames.add(freedName); // Füge den Namen zu den aktiven Namen für den Charakter hinzu
    charToName.nameColor = getRandomColor(); // NEU: Zufällige Farbe für den neu benannten Charakter
    console.log(`Zuvor unbenannter Charakter wurde zu ${charToName.name} benannt.`);
  }
}

// === Männchen-Klasse ===
class Männchen {
  constructor(x, y, initialStage = 'adult', assignedName = null) {
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 40;
    this.speed = Math.random() * 1.0 + 0.2;
    this.direction = Math.random() < 0.5 ? -1 : 1;

    this.stage = initialStage;
    this.state = 'alive';

    this.animationTimer = 0;
    this.ghostYOffset = 0;

    this.babyCooldownUntil = 0;
    this.interactionCooldownUntil = 0;
    this.canHaveBabies = true; // NEU: Flag für Poker-Verlierer

    this.lifespanTimers = {
      teen: null,
      adult: null,
      death: null
    };
    this.teenToAdultDelay = TEEN_TO_ADULT_TIME;
    this.adultLifespanRemaining = ADULT_LIFESPAN;

    this.currentBubble = null;
    this.bubbleDisplayUntil = 0;

    // NEU: Namenszuweisung und Farb-Logik im Konstruktor
    this.name = assignedName; // Name direkt zuweisen, wenn übergeben (z.B. vom Chat-User oder Baby-Kombination)

    if (this.stage === 'baby') {
      this.nameColor = 'lightgreen'; // Babys bleiben grün
    } else if (this.name) { // Wenn ein Name zugewiesen wurde (nicht Baby-generiert), aber nicht Baby-Stage
      this.nameColor = getRandomColor(); // Zufällige Farbe für Jugendliche und Erwachsene
      // Wenn der Name von chatUsers stammt (also kein generierter Baby-Name ist), zur activeMaleNames hinzufügen
      if (chatUsers.has(this.name) && !activeMaleNames.has(this.name)) {
        activeMaleNames.add(this.name);
      }
    } else { // Wenn kein Name zugewiesen wurde (z.B. initialer Spawn und kein Name verfügbar)
      const availableName = getAvailableName();
      if (availableName) {
        this.name = availableName;
        activeMaleNames.add(availableName);
        this.nameColor = getRandomColor();
      } else {
        this.name = null; // Bleibt vorerst unbenannt
        unnamedCharactersWaitingForChatName.push(this); // Zur Warteliste hinzufügen
        console.log(`Charakter ohne Namen gespawnt (Stage: ${this.stage}). Warte auf freien Namen.`);
        this.nameColor = 'gray'; // Temporäre Farbe für unbenannte Charaktere
      }
    }

    if (this.stage === 'baby' || (this.stage === 'adult' && lifespansActive)) {
      this.startStageProgression();
    }
  }

  startStageProgression() {
    for (const key in this.lifespanTimers) {
      if (this.lifespanTimers[key]) {
        clearTimeout(this.lifespanTimers[key]);
      }
    }

    if (this.stage === 'baby') {
      this.lifespanTimers.teen = setTimeout(() => {
        if (this.stage === 'baby') {
          this.stage = 'teen';
          this.nameColor = getRandomColor(); // NEU: Zufällige Farbe für Teenager
          console.log(`${this.name || 'Ein unbenanntes Baby'} ist jetzt jugendlich.`);
          this.startStageProgression();
        }
      }, BABY_TO_TEEN_TIME);
    } else if (this.stage === 'teen') {
      this.lifespanTimers.adult = setTimeout(() => {
        if (this.stage === 'teen') {
          this.stage = 'adult';
          this.nameColor = getRandomColor(); // NEU: Zufällige Farbe für Erwachsene

          // NEU: Namenswechsel für Erwachsene
          const newAdultChatName = getAvailableName();
          if (newAdultChatName) {
            // Wenn der Charakter zuvor einen Composite-Namen hatte, ist dieser nicht in activeMaleNames,
            // daher muss er nicht entfernt werden.
            this.name = newAdultChatName;
            activeMaleNames.add(newAdultChatName);
            // Falls der Charakter zuvor in unnamedCharactersWaitingForChatName war,
            // sollte er von dort entfernt werden, aber das wird durch releaseNameAndAssignToWaitingCharacter gehandhabt.
            console.log(`${this.name} ist jetzt erwachsen und heißt ${newAdultChatName}.`);
          } else {
            // Wenn kein chatUser-Name verfügbar ist, bleibt er vorerst unbenannt oder behält den Teenager-Namen
            this.name = this.name || "Unbenannter Erwachsener"; // Behalte Teenager-Namen oder "Unbenannter Erwachsener"
            unnamedCharactersWaitingForChatName.push(this); // Zur Warteliste hinzufügen
            console.log(`${this.name} ist jetzt erwachsen, aber es war kein neuer Chat-Name verfügbar.`);
          }
          this.startStageProgression();
        }
      }, this.teenToAdultDelay);
    } else if (this.stage === 'adult') {
      this.lifespanTimers.death = setTimeout(() => {
        if (this.stage === 'adult') {
          this.state = 'dying';
          this.animationTimer = Date.now();
          setTimeout(() => this.state = 'ghost', 500);
          setTimeout(() => this.state = 'gravestone', 2000);
          setTimeout(() => {
            männchenListe = männchenListe.filter(m => m !== this);
            // Wenn der Charakter einen Namen von activeMaleNames hatte, freigeben
            if (this.name && activeMaleNames.has(this.name)) {
              activeMaleNames.delete(this.name);
              releaseNameAndAssignToWaitingCharacter(this.name); // NEU: Namen an wartende Charaktere geben
            }
            // Auch aus der Warteliste entfernen, falls es dort war (z.B. unbenannter Erwachsener)
            unnamedCharactersWaitingForChatName = unnamedCharactersWaitingForChatName.filter(m => m !== this);
            console.log(`${this.name || 'Ein Charakter'} ist gestorben (Ende der Lebensspanne).`);
            updateScoreboardDisplay();
          }, 3000);
        }
      }, this.adultLifespanRemaining);
    }
  }

  move() {
    if (this.state === 'alive' || this.state === 'loving' || this.state.startsWith('playing_')) {
      this.x += this.speed * this.direction;
      if (this.x < 0) {
        this.x = 0;
        this.direction = 1;
      } else if (this.x > canvas.width - this.width) {
        this.x = canvas.width - this.width;
        this.direction = -1;
      }
    } else if (this.state === 'ghost') {
      this.ghostYOffset -= 0.5;
    }
  }

  draw() {
    let imgToDraw = characterImg;
    if (this.stage === 'baby') {
      imgToDraw = babyImg;
    } else if (this.stage === 'teen') {
      imgToDraw = teenagerImg;
    } else if (this.stage === 'adult') {
      imgToDraw = adultImg;
    }

    ctx.save();

    if (this.state !== 'ghost' && this.state !== 'gravestone') {
      if (this.direction === -1) {
        ctx.drawImage(imgToDraw, this.x, this.y, this.width, this.height);
      } else {
        ctx.translate(this.x + this.width, this.y);
        ctx.scale(-1, 1);
        ctx.drawImage(imgToDraw, 0, 0, this.width, this.height);
      }
    }

    ctx.restore();

    // Namen zeichnen (nicht für Geister/Grabsteine und nur, wenn der Name existiert)
    if (this.name && this.state !== 'ghost' && this.state !== 'gravestone') {
      ctx.fillStyle = this.nameColor; // NEU: Zufällige Namensfarbe
      ctx.font = (this.stage === 'baby' || this.stage === 'teen') ? '10px Arial' : '12px Arial';

      let textX = this.x;
      if (this.direction === 1 && (this.state !== 'dying' && !this.state.startsWith('playing_') && this.state !== 'loving')) {
        textX = this.x + this.width - ctx.measureText(this.name).width;
      }
      if (this.stage === 'baby' || this.stage === 'teen') {
        textX = this.x + (this.width / 2) - (ctx.measureText(this.name).width / 2);
      }
      ctx.fillText(this.name, textX, this.y - 5);
    }

    // === Zeichne Emoji/Interaktions-Sprechblase ===
    if (this.currentBubble && Date.now() < this.bubbleDisplayUntil) {
      const bubblePadding = 5;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const bubbleWidth = 32 + (2 * bubblePadding);
      const bubbleHeight = 32 + (2 * bubblePadding);
      const bubbleX = this.x + (this.width / 2) - (bubbleWidth / 2);
      const bubbleY = this.y - this.height - 25;

      ctx.fillRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);

      ctx.beginPath();
      ctx.moveTo(this.x + this.width / 2 - 5, bubbleY + bubbleHeight);
      ctx.lineTo(this.x + this.width / 2 + 5, bubbleY + bubbleHeight);
      ctx.lineTo(this.x + this.width / 2, bubbleY + bubbleHeight + 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'white';
      ctx.font = '16px Arial Unicode MS';
      let emoteImage = new Image;
      emoteImage.src = this.currentBubble;
      ctx.drawImage(emoteImage, bubbleX + bubblePadding, bubbleY + bubblePadding, 32, 32)
    }

    // Spezielle Animationen und Grafiken basierend auf 'state'
    if (this.state === 'dying') {
      ctx.drawImage(cloudImg, this.x - 10, this.y - 30, this.width + 20, this.height + 20);
    } else if (this.state === 'ghost') {
      ctx.drawImage(ghostImg, this.x, this.y + this.ghostYOffset, this.width, this.height);
    } else if (this.state === 'gravestone') {
      ctx.drawImage(gravestoneImg, this.x, this.y + this.height - 20, this.width, 40);
    } else if (this.state === 'loving') {
      const pulseSpeed = 0.005;
      const pulseMagnitude = 0.1;
      const scale = 1 + Math.sin(Date.now() * pulseSpeed) * pulseMagnitude;

      ctx.save();
      const heartWidth = this.width / 2;
      const heartHeight = this.height / 2;
      const heartX = this.x + this.width / 4;
      const heartY = this.y - 20;

      ctx.translate(heartX + heartWidth / 2, heartY + heartHeight / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(heartImg, -heartWidth / 2, -heartHeight / 2, heartWidth, heartHeight);
      ctx.restore();
    } else if (this.state === 'playing_soccer') {
      const pulseSpeed = 0.005;
      const pulseMagnitude = 0.1;
      const scale = 1 + Math.sin(Date.now() * pulseSpeed) * pulseMagnitude;
      ctx.save();
      const iconWidth = this.width / 2;
      const iconHeight = this.height / 2;
      const iconX = this.x + this.width / 4;
      const iconY = this.y - 20;
      ctx.translate(iconX + iconWidth / 2, iconY + iconHeight / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(soccerImg, -iconWidth / 2, -iconHeight / 2, iconWidth, iconHeight);
      ctx.restore();
    } else if (this.state === 'dancing') {
      const pulseSpeed = 0.005;
      const pulseMagnitude = 0.1;
      const scale = 1 + Math.sin(Date.now() * pulseSpeed) * pulseMagnitude;
      ctx.save();
      const iconWidth = this.width / 2;
      const iconHeight = this.height / 2;
      const iconX = this.x + this.width / 4;
      const iconY = this.y - 20;
      ctx.translate(iconX + iconWidth / 2, iconY + iconHeight / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(danceImg, -iconWidth / 2, -iconHeight / 2, iconWidth, iconHeight);
      ctx.restore();
    } else if (this.state === 'gaming') {
      const pulseSpeed = 0.005;
      const pulseMagnitude = 0.1;
      const scale = 1 + Math.sin(Date.now() * pulseSpeed) * pulseMagnitude;
      ctx.save();
      const iconWidth = this.width / 2;
      const iconHeight = this.height / 2;
      const iconX = this.x + this.width / 4;
      const iconY = this.y - 20;
      ctx.translate(iconX + iconWidth / 2, iconY + iconHeight / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(gameImg, -iconWidth / 2, -iconHeight / 2, iconWidth, iconHeight);
      ctx.restore();
    } else if (this.state === 'playing_poker') { // NEU: Poker-Animation
      const pulseSpeed = 0.005;
      const pulseMagnitude = 0.1;
      const scale = 1 + Math.sin(Date.now() * pulseSpeed) * pulseMagnitude;
      ctx.save();
      const iconWidth = this.width / 2;
      const iconHeight = this.height / 2;
      const iconX = this.x + this.width / 4;
      const iconY = this.y - 20;
      ctx.translate(iconX + iconWidth / 2, iconY + iconHeight / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(pokerImg, -iconWidth / 2, -iconHeight / 2, iconWidth, iconHeight);
      ctx.restore();
    }
  }
}

// === Listen und Bodenkoordinaten ===
let männchenListe = [];
const groundMinY = canvas.height - 100;
const groundMaxY = canvas.height - 60;

// === Bildervorlade-Funktion ===
function loadImages(sources, callback) {
  let images = {};
  let loadedImages = 0;
  let numImages = Object.keys(sources).length;

  for (let src in sources) {
    images[src] = new Image();
    images[src].onload = function() {
      loadedImages++;
      if (loadedImages >= numImages) {
        callback(images);
      }
    };
    images[src].src = sources[src];
  }
}

// === Initialisierung ===
async function init() {
  const imageSources = {
    ground: 'ground.png',
    character: 'character.png',
    baby: 'baby.png',
    teenager: 'teenager.png',
    adult: 'adult.png',
    cloud: 'cloud.png',
    ghost: 'Ghost.png',
    gravestone: 'Gravestone.png',
    heart: 'Heart.png',
    soccer: 'soccer.png',
    dance: 'dance.png',
    game: 'game.png',
    poker: 'poker.png' // NEU: Poker Bild
  };

  loadImages(imageSources, function(images) {
    groundImg.src = images.ground.src;
    characterImg.src = images.character.src;
    babyImg.src = images.baby.src;
    teenagerImg.src = images.teenager.src;
    adultImg.src = images.adult.src;
    cloudImg.src = images.cloud.src;
    ghostImg.src = images.ghost.src;
    gravestoneImg.src = images.gravestone.src;
    heartImg.src = images.heart.src;
    soccerImg.src = images.soccer.src;
    danceImg.src = images.dance.src;
    gameImg.src = images.game.src;
    pokerImg.src = images.poker.src; // NEU

    animate();

    const savedScoreboard = localStorage.getItem('characterScoreboard');
    if (savedScoreboard) {
      scoreboard = JSON.parse(savedScoreboard);
    } else {
      scoreboard = {};
    }

    client.connect().then(() => {
      console.log(`🤖 Bot ist verbunden mit ${TwitchChannel}`);

      // Initiales Spawning, um MAX_CHARACTERS aufzufüllen
      spawnMissingCharacters();

      if (männchenListe.length >= 20 && !lifespansActive) {
        lifespansActive = true;
        console.log("20 Charaktere erreicht oder überschritten bei Initialisierung. Lebensdauern starten für alle.");
        männchenListe.forEach(m => {
          if (!m.lifespanTimers.death && m.stage !== 'baby') {
            m.startStageProgression();
          }
        });
      }
      updateScoreboardDisplay();

    }).catch(console.error);

    setInterval(updateScoreboardDisplay, 5000);
    setInterval(spawnMissingCharacters, 10000); // NEU: Alle 10 Sekunden prüfen, ob Charaktere fehlen
  });
}

// NEU: Funktion zum proaktiven Spawnen fehlender Charaktere
function spawnMissingCharacters() {
  while (männchenListe.length < MAX_CHARACTERS) {
    const availableName = getAvailableName();
    if (availableName) {
      const randomY = Math.random() * (groundMaxY - groundMinY) + groundMinY;
      const newChar = new Männchen(Math.random() * canvas.width, randomY, 'adult', availableName);
      männchenListe.push(newChar);
      // Der Name wird im Männchen-Konstruktor zu activeMaleNames hinzugefügt
      console.log(`Charakter ${newChar.name} proaktiv gespawnt. Gesamt: ${männchenListe.length}`);
      if (lifespansActive) {
        newChar.startStageProgression();
      }
    } else {
      console.log("Keine verfügbaren Namen von Chat-Usern, um MAX_CHARACTERS zu erreichen.");
      break; // Keine Namen verfügbar, Schleife beenden
    }
  }
}

// === Chat-Nachrichten-Handler ===
client.on('chat', (channel, userstate, message, self) => {
  if (self) return;

  const displayName = userstate['display-name'];
  chatUsers.add(displayName);

  let emotes = [];
  try {
    emotes = Object.keys(userstate["emotes"]);
  } catch {
    emotes = [];
  }

  if (emotes.length > 0) {
    const character = männchenListe.find(m => m.name === displayName && m.state === 'alive');
    if (character) {
      character.currentBubble = "https://static-cdn.jtvnw.net/emoticons/v2/" + emotes[0] + "/default/light/3.0";
      character.bubbleDisplayUntil = Date.now() + 3000;
    }
    return;
  }

  // Spawne neuen Charakter von Chat-Nachricht, wenn noch Platz ist und Name nicht aktiv
  if (!activeMaleNames.has(displayName) && männchenListe.length < MAX_CHARACTERS) {
    const randomY = Math.random() * (groundMaxY - groundMinY) + groundMinY;
    const newCharacter = new Männchen(Math.random() * canvas.width, randomY, 'adult', displayName); // Name direkt übergeben
    männchenListe.push(newCharacter);
    // Der Name wird im Männchen-Konstruktor zu activeMaleNames hinzugefügt
    console.log(`Neuer Charakter für ${displayName} gespawnt. Gesamt: ${männchenListe.length}`);

    if (lifespansActive) {
      newCharacter.startStageProgression();
    } else if (männchenListe.length >= 20) {
      lifespansActive = true;
      console.log("20 Charaktere erreicht! Lebensdauern starten für alle bestehenden und zukünftigen Charaktere.");
      männchenListe.forEach(m => {
        if (!m.lifespanTimers.death && m.stage !== 'baby') {
          m.startStageProgression();
        }
      });
    }
    updateScoreboardDisplay();
  }
});


// === Kollisionsprüfung ===
function checkCollision(a, b) {
  if (a === b || Date.now() < a.interactionCooldownUntil || Date.now() < b.interactionCooldownUntil) {
    return false;
  }

  if (!(Math.abs(a.x - b.x) < a.width && Math.abs(a.y - b.y) < a.height)) {
    return false;
  }

  // Babys interagieren nicht auf spezielle Weise, sie gehen einfach vorbei
  if (a.stage === 'baby' || b.stage === 'baby') {
    return false;
  }

  // Jugendliche interagieren nur mit Jugendlichen
  if (a.stage === 'teen' && b.stage === 'teen') {
    if (a.state.startsWith('playing_') || b.state.startsWith('playing_')) {
      return false;
    }
    return true;
  }

  // Erwachsene interagieren nur mit Erwachsenen
  if (a.stage === 'adult' && b.stage === 'adult') {
    if (a.state === 'loving' || b.state === 'loving' || a.state.startsWith('playing_') || b.state.startsWith('playing_')) {
      return false;
    }
    return true;
  }

  return false;
}

// === Kollisionsbehandlung ===
function handleCollision(a, b) {
  if (a.state !== 'alive' || b.state !== 'alive') return;

  const r = Math.random();

  // === Behandlung von Teenager-Teenager-Interaktionen ===
  if (a.stage === 'teen' && b.stage === 'teen') {
    a.interactionCooldownUntil = Date.now() + (5 * 1000);
    b.interactionCooldownUntil = Date.now() + (5 * 1000);

    let interactionType;
    if (r < 0.33) {
      interactionType = 'soccer';
    } else if (r < 0.66) {
      interactionType = 'dance';
    } else {
      interactionType = 'game';
    }

    const winner = Math.random() < 0.5 ? a : b;
    const loser = (winner === a) ? b : a;

    a.state = `playing_${interactionType}`;
    b.state = `playing_${interactionType}`;
    a.animationTimer = Date.now();
    b.animationTimer = Date.now();

    console.log(`${a.name} und ${b.name} sind in einem ${interactionType}-Kampf! ${winner.name} hat gewonnen.`);

    setTimeout(() => {
      if (a.state.startsWith('playing_')) a.state = 'alive';
      if (b.state.startsWith('playing_')) b.state = 'alive';

      if (interactionType === 'soccer') {
        loser.stage = 'baby';
        loser.teenToAdultDelay = TEEN_TO_ADULT_TIME;
        loser.adultLifespanRemaining = ADULT_LIFESPAN;
        loser.startStageProgression();
        console.log(`${loser.name} hat beim Fußball verloren und wird wieder zum Baby.`);
      } else if (interactionType === 'dance') {
        loser.teenToAdultDelay += 60 * 1000;
        loser.startStageProgression();
        console.log(`${loser.name} hat beim Dance Battle verloren und braucht 1 Min. länger.`);
      } else if (interactionType === 'game') {
        loser.stage = 'adult';
        loser.adultLifespanRemaining = 40 * 1000;
        loser.startStageProgression();
        console.log(`${loser.name} hat beim Game Battle verloren, wird sofort erwachsen und lebt noch 40s.`);
      }

      if (a.x < b.x) {
        a.direction = -1;
        b.direction = 1;
      } else {
        a.direction = 1;
        b.direction = -1;
      }
      a.speed = Math.random() * 0.5 + 0.5;
      b.speed = Math.random() * 0.5 + 0.5;

    }, TEEN_INTERACTION_DURATION);
    return;
  }

  // === Behandlung von Erwachsenen-Erwachsenen-Interaktionen (Töten/Baby-Erzeugung/Pokern) ===
  if (a.stage === 'adult' && b.stage === 'adult') {
    // Cooldown für allgemeine Interaktionen setzen
    a.interactionCooldownUntil = Date.now() + (10 * 1000); // 10 Sek. Cooldown
    b.interactionCooldownUntil = Date.now() + (10 * 1000);

    const currentBabies = männchenListe.filter(m => m.stage === 'baby').length;

    if (r < 0.33) {
      // Töten
      const victim = Math.random() < 0.5 ? a : b;
      const killer = (victim === a) ? b : a;

      if (scoreboard[killer.name]) {
        scoreboard[killer.name].kills = (scoreboard[killer.name].kills || 0) + 1;
      } else {
        scoreboard[killer.name] = {
          kills: 1,
          babies: 0
        };
      }
      updateScoreboardDisplay();

      victim.state = 'dying';
      victim.animationTimer = Date.now();

      killer.state = 'loving';
      setTimeout(() => {
        if (killer.state === 'loving') killer.state = 'alive';
      }, 1000);

      setTimeout(() => victim.state = 'ghost', 500);
      setTimeout(() => victim.state = 'gravestone', 2000);
      setTimeout(() => {
        männchenListe = männchenListe.filter(m => m !== victim);
        if (victim.name && activeMaleNames.has(victim.name)) {
          activeMaleNames.delete(victim.name);
          releaseNameAndAssignToWaitingCharacter(victim.name); // NEU
        }
        unnamedCharactersWaitingForChatName = unnamedCharactersWaitingForChatName.filter(m => m !== victim); // NE falls unbenannt
        updateScoreboardDisplay();
      }, 3000);
    } else if (r < 0.66) {
      // Baby erzeugen (Verlieben)
      // NEU: Prüfung des Baby-Limits und canHaveBabies-Flags
      if (currentBabies >= MAX_BABIES) {
        console.log(`Baby-Erstellung übersprungen: Maximal ${MAX_BABIES} Babys gleichzeitig erlaubt.`);
        return;
      }
      if (!a.canHaveBabies || !b.canHaveBabies) {
        console.log(`Baby-Erstellung übersprungen: ${a.name} oder ${b.name} kann keine Babys mehr bekommen.`);
        return;
      }
      // Baby-Erstellungs-Cooldown für Erwachsene prüfen
      if (Date.now() < a.babyCooldownUntil || Date.now() < b.babyCooldownUntil) {
        console.log("Baby-Erstellung aufgrund von Cooldown übersprungen.");
        return;
      }


      a.state = 'loving';
      b.state = 'loving';
      a.animationTimer = Date.now();
      b.animationTimer = Date.now();

      const now = Date.now();
      a.babyCooldownUntil = now + (20 * 1000);
      b.babyCooldownUntil = now + (20 * 1000);


      if (scoreboard[a.name]) {
        scoreboard[a.name].babies = (scoreboard[a.name].babies || 0) + 1;
      } else {
        scoreboard[a.name] = {
          kills: 0,
          babies: 1
        };
      }
      if (scoreboard[b.name]) {
        scoreboard[b.name].babies = (scoreboard[b.name].babies || 0) + 1;
      } else {
        scoreboard[b.name] = {
          kills: 0,
          babies: 1
        };
      }
      updateScoreboardDisplay();

      setTimeout(() => {
        if (a.state === 'loving') a.state = 'alive';
        if (b.state === 'loving') b.state = 'alive';

        const babyX = (a.x + b.x) / 2;
        const randomY = Math.random() * (groundMaxY - groundMinY) + groundMinY;

        // NEU: Baby-Namen aus Silben der Eltern zusammensetzen
        const babyGeneratedName = getFirstSyllable(a.name) + getFirstSyllable(b.name);
        const newBaby = new Männchen(babyX, randomY, 'baby', babyGeneratedName); // Baby-Namen übergeben
        männchenListe.push(newBaby);
        newBaby.startStageProgression();

        console.log(`Baby namens ${newBaby.name} von ${a.name} und ${b.name} erstellt. Aktuelle Babys: ${männchenListe.filter(m => m.stage === 'baby').length}`);

        if (a.x < b.x) {
          a.direction = -1;
          b.direction = 1;
        } else {
          a.direction = 1;
          b.direction = -1;
        }
        a.speed = Math.random() * 0.5 + 0.5;
        b.speed = Math.random() * 0.5 + 0.5;
        newBaby.speed = Math.random() * 0.8 + 0.2;
        newBaby.direction = Math.random() < 0.5 ? -1 : 1;

      }, BABY_CREATION_DURATION);
    } else {
      // NEU: Pokern
      const pokerPlayers = [a, b];
      const loser = pokerPlayers[Math.floor(Math.random() * pokerPlayers.length)];

      a.state = 'playing_poker'; // NEU: Poker-Interaktionszustand
      b.state = 'playing_poker';
      a.animationTimer = Date.now();
      b.animationTimer = Date.now();

      console.log(`${a.name} und ${b.name} pokern. ${loser.name} hat verloren.`);

      setTimeout(() => {
        if (a.state.startsWith('playing_poker')) a.state = 'alive';
        if (b.state.startsWith('playing_poker')) b.state = 'alive';

        loser.canHaveBabies = false; // NEU: Verlierer kann keine Babys mehr bekommen
        console.log(`${loser.name} hat beim Pokern verloren und kann keine Babys mehr bekommen.`);

        if (a.x < b.x) {
          a.direction = -1;
          b.direction = 1;
        } else {
          a.direction = 1;
          b.direction = -1;
        }
        a.speed = Math.random() * 0.5 + 0.5;
        b.speed = Math.random() * 0.5 + 0.5;
      }, TEEN_INTERACTION_DURATION); // Kurze Interaktionsdauer für Poker
    }
  }
}

// === Boden zeichnen ===
function drawGround() {
  ctx.drawImage(groundImg, 0, groundMaxY, canvas.width, canvas.height - groundMaxY);
}

// === Scoreboard Anzeige aktualisieren ===
function updateScoreboardDisplay() {
  const scoreList = document.getElementById('score-list');
  if (!scoreList) return;

  const activeScores = Object.keys(scoreboard)
    .filter(name => activeMaleNames.has(name))
    .map(name => ({
      name: name,
      score: (scoreboard[name].kills || 0) + (scoreboard[name].babies || 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  scoreList.innerHTML = '';

  activeScores.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = `${entry.name}: ${entry.score.toFixed(0)}`;
    scoreList.appendChild(li);
  });

  localStorage.setItem('characterScoreboard', JSON.stringify(scoreboard));
}

// === Animationsschleife ===
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGround();

  männchenListe.sort((a, b) => a.y - b.y);

  männchenListe.forEach(m => m.move());
  männchenListe.forEach(m => m.draw());

  for (let i = 0; i < männchenListe.length; i++) {
    for (let j = i + 1; j < männchenListe.length; j++) {
      if (checkCollision(männchenListe[i], männchenListe[j])) {
        handleCollision(männchenListe[i], männchenListe[j]);
      }
    }
  }

  requestAnimationFrame(animate);
}

// === Start der Anwendung ===
init();
