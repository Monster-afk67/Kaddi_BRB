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
let activeMaleNames = new Set(); // Speichert die Namen der aktuell angezeigten Männchen

// Flag, um zu steuern, wann die Lebensdauern der Charaktere aktiv sind
let lifespansActive = false;

// Scoreboard Daten (Name -> { kills: N, babies: M })
let scoreboard = {};

client.on('chat', (channel, userstate, message, self) => {
  if (self) return; // Ignoriere Nachrichten vom Bot selbst

  const displayName = userstate['display-name'];

  // Füge den User zum allgemeinen Set der Chat-User hinzu
  chatUsers.add(displayName);
  
  // === Emoji-Sprechblasen Feature ===
  let emotes=[];
  try{
	emotes=Object.keys(userstate["emotes"]);
  }catch{
	  emotes=[];
  }

  if (emotes.length>0) {
    const character = männchenListe.find(m => m.name === displayName && m.state === 'alive');
    if (character) {
      character.currentBubble = "https://static-cdn.jtvnw.net/emoticons/v2/"+emotes[0]+"/default/light/3.0";
      character.bubbleDisplayUntil = Date.now() + 3000; // Anzeige für 3 Sekunden
      console.log(`Emoji '${emotes[0]}' angezeigt für ${displayName}.`);
    }
    // Wenn es nur eine Emoji-Nachricht ist, nicht versuchen, einen neuen Charakter zu spawnen
    return;
  }
  // === Ende Emoji-Sprechblasen Feature ===


  // Prüfe, ob bereits ein Charakter für diesen User existiert und angezeigt wird
  // und ob die maximale Charakteranzahl noch nicht erreicht ist
  if (!activeMaleNames.has(displayName) && männchenListe.length < MAX_CHARACTERS) {
    const randomY = Math.random() * (groundMaxY - groundMinY) + groundMinY;
    // Neue Charaktere spawnen als Erwachsene
    const newCharacter = new Männchen(Math.random() * canvas.width, randomY, 'adult');
    newCharacter.name = displayName; // Weise den spezifischen Namen zu
    männchenListe.push(newCharacter);
    activeMaleNames.add(displayName); // Füge den Namen zu den aktiven Namen hinzu
    console.log(`Neuer Charakter für ${displayName} gespawnt. Gesamt: ${männchenListe.length}`);

    // Wenn die Lebensdauern bereits aktiv sind, starte sie sofort für diesen neuen Charakter
    if (lifespansActive) {
      newCharacter.startStageProgression();
    } else if (männchenListe.length >= 20) {
      // Wenn 20 Charaktere erreicht sind (und die Lebensdauern noch nicht aktiv waren)
      lifespansActive = true;
      console.log("20 Charaktere erreicht! Lebensdauern starten für alle bestehenden und zukünftigen Charaktere.");
      männchenListe.forEach(m => {
        // Starte die Lebensdauer nur, wenn sie noch nicht gestartet wurde
        if (!m.lifespanTimers.death && m.stage !== 'baby') { // Babys starten ihre Progression selbstständig
          m.startStageProgression();
        }
      });
    }
    updateScoreboardDisplay(); // Scoreboard aktualisieren, wenn neuer Charakter hinzukommt
  }
});

// === Bot starten ===
client.connect().then(() => {
  console.log(`🤖 Bot ist verbunden mit ${TwitchChannel}`);
}).catch(console.error);


const canvas = document.getElementById('brbCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// === Bild-Objekte ===
const groundImg = new Image();
const characterImg = new Image(); // Wird möglicherweise ersetzt durch adultImg
const babyImg = new Image();
const teenagerImg = new Image(); // NEU: Bild für Jugendliche
const adultImg = new Image(); // NEU: Bild für Erwachsene
const cloudImg = new Image();
const ghostImg = new Image();
const gravestoneImg = new Image();
const heartImg = new Image();
const soccerImg = new Image(); // NEU: Bild für Fußball-Interaktion
const danceImg = new Image(); // NEU: Bild für Dance-Battle-Interaktion
const gameImg = new Image(); // NEU: Bild für Game-Battle-Interaktion


// === Konstanten für Lebensdauern und Spawning ===
const BABY_TO_TEEN_TIME = 20 * 1000; // 20 Sekunden als Baby
const TEEN_TO_ADULT_TIME = 60 * 1000; // 1 Minute als Jugendlicher
const ADULT_LIFESPAN = 60 * 1000; // 1 Minute als Erwachsener
const MAX_CHARACTERS = 45; // Erhöht auf 45
const BABY_CREATION_DURATION = 5 * 1000; // Baby-Erstellung dauert 5 Sekunden
const TEEN_INTERACTION_DURATION = 3 * 1000; // Teenager-Interaktion dauert 3 Sekunden

// === Hilfsfunktion für zufälligen Namen ===
function assignRandomName(männchen) {
  if (chatUsers.size > 0) {
    let items = Array.from(chatUsers);
    const name = items[Math.floor(Math.random() * items.length)];
    männchen.name = name;
  } else {
    männchen.name = 'Unbekannt';
  }
}

// === Männchen-Klasse ===
class Männchen {
  constructor(x, y, initialStage = 'adult') {
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 40;
    this.speed = Math.random() * 1.0 + 0.2; // Spielergeschwindigkeit etwas niedriger (0.2 bis 1.2)
    this.direction = Math.random() < 0.5 ? -1 : 1; // -1 für links, 1 für rechts

    this.stage = initialStage; // 'baby', 'teen', 'adult'
    // 'state' wird für temporäre Animationen oder Zustände wie 'dying', 'ghost', 'gravestone', 'loving', 'playing_soccer', 'dancing', 'gaming' verwendet
    this.state = 'alive'; // Basis-Zustand

    this.animationTimer = 0; // Timer für Animationen
    this.ghostYOffset = 0; // Für die Geisteranimation

    // Cooldown-Variablen
    this.babyCooldownUntil = 0; // Timestamp wann die Baby-Erstellungs-Cooldown endet
    this.interactionCooldownUntil = 0; // Timestamp wann die allgemeine Interaktions-Cooldown endet

    // Lebenszyklus-Timer-IDs
    this.lifespanTimers = {
      teen: null,
      adult: null,
      death: null
    };
    this.teenToAdultDelay = TEEN_TO_ADULT_TIME; // Kann durch Dance Battle verändert werden
    this.adultLifespanRemaining = ADULT_LIFESPAN; // Kann durch Game Battle verändert werden

    // Für Emoji/Interaktions-Sprechblasen
    this.currentBubble = null;
    this.bubbleDisplayUntil = 0;

    if (!this.name) {
      assignRandomName(this);
    }

    // Starte die Progression sofort, wenn Lebensdauern aktiv sind oder es ein Baby ist
    if (this.stage === 'baby' || (this.stage === 'adult' && lifespansActive)) {
      this.startStageProgression();
    }
  }

  // Methode zum Starten der Lebensdauer-Stufen-Progression
  startStageProgression() {
    // Vorhandene Timer löschen, um doppelte Aufrufe zu verhindern
    for (const key in this.lifespanTimers) {
      if (this.lifespanTimers[key]) {
        clearTimeout(this.lifespanTimers[key]);
      }
    }

    const now = Date.now();

    if (this.stage === 'baby') {
      this.lifespanTimers.teen = setTimeout(() => {
        if (this.stage === 'baby') { // Stelle sicher, dass es noch ein Baby ist
          this.stage = 'teen';
          console.log(`${this.name} ist jetzt jugendlich.`);
          this.startStageProgression(); // Gehe zur nächsten Stufe über
        }
      }, BABY_TO_TEEN_TIME);
    } else if (this.stage === 'teen') {
      this.lifespanTimers.adult = setTimeout(() => {
        if (this.stage === 'teen') { // Stelle sicher, dass es noch ein Teenager ist
          this.stage = 'adult';
          console.log(`${this.name} ist jetzt erwachsen.`);
          this.startStageProgression(); // Gehe zur nächsten Stufe über
        }
      }, this.teenToAdultDelay); // Nutze einstellbare Verzögerung
    } else if (this.stage === 'adult') {
      this.lifespanTimers.death = setTimeout(() => {
        if (this.stage === 'adult') { // Stelle sicher, dass es noch ein Erwachsener ist
          this.state = 'dying'; // Übergang zum Sterbezustand
          this.animationTimer = Date.now();
          // Bestehende Sterbe-/Geist-/Grabstein-Logik beibehalten
          setTimeout(() => this.state = 'ghost', 500);
          setTimeout(() => this.state = 'gravestone', 2000);
          setTimeout(() => {
            männchenListe = männchenListe.filter(m => m !== this);
            if (this.name && activeMaleNames.has(this.name)) {
              activeMaleNames.delete(this.name);
            }
            console.log(`${this.name} ist gestorben (Ende der Lebensspanne).`);
            updateScoreboardDisplay(); // Scoreboard aktualisieren, wenn Charakter entfernt wird
          }, 3000);
        }
      }, this.adultLifespanRemaining); // Nutze einstellbare Lebensspanne
    }
  }

  move() {
    if (this.state === 'alive' || this.state === 'loving' || this.state.startsWith('playing_')) { // Nur bewegen, wenn lebendig oder in interaktivem Zustand
      this.x += this.speed * this.direction;
      if (this.x < 0) {
        this.x = 0;
        this.direction = 1;
      } else if (this.x > canvas.width - this.width) {
        this.x = canvas.width - this.width;
        this.direction = -1;
      }
    } else if (this.state === 'ghost') {
      this.ghostYOffset -= 0.5; // Steigt in den Himmel
    }
  }

  draw() {
    // Grafiken basierend auf Stufe (stage)
    let imgToDraw = characterImg; // Fallback, sollte durch spezifische Stufenbilder ersetzt werden
    if (this.stage === 'baby') {
      imgToDraw = babyImg;
    } else if (this.stage === 'teen') {
      imgToDraw = teenagerImg;
    } else if (this.stage === 'adult') {
      imgToDraw = adultImg;
    }

    ctx.save(); // Aktuellen Canvas-Zustand speichern

    // Zeichne die Hauptfigur, wenn nicht im Geist- oder Grabstein-Zustand
    if (this.state !== 'ghost' && this.state !== 'gravestone') {
      if (this.direction === -1) { // Wenn die Figur nach links läuft (Originalrichtung des Models)
        ctx.drawImage(imgToDraw, this.x, this.y, this.width, this.height);
      } else { // Wenn die Figur nach rechts läuft, spiegeln
        ctx.translate(this.x + this.width, this.y); // Zum Drehpunkt (rechte Seite der Figur) verschieben
        ctx.scale(-1, 1); // Horizontal spiegeln
        ctx.drawImage(imgToDraw, 0, 0, this.width, this.height); // Bei 0,0 zeichnen, da der Ursprung verschoben ist
      }
    }

    ctx.restore(); // Canvas-Zustand wiederherstellen

    // Namen zeichnen (nicht für Geister/Grabsteine)
    if (this.name && this.state !== 'ghost' && this.state !== 'gravestone') {
      ctx.fillStyle = (this.stage === 'baby' || this.stage === 'teen') ? 'lightgreen' : 'white'; // Farbe für Baby/Teen Namen
      ctx.font = (this.stage === 'baby' || this.stage === 'teen') ? '10px Arial' : '12px Arial';

      let textX = this.x;
      // Textposition anpassen, wenn gespiegelt wird, damit der Name korrekt über der Figur ist.
      if (this.direction === 1 && (this.state !== 'dying' && !this.state.startsWith('playing_') && this.state !== 'loving')) { // Nur spiegeln, wenn nicht in spezieller Animation
        textX = this.x + this.width - ctx.measureText(this.name).width;
      }
      // Namen zentrieren für Babys und Teenager
      if (this.stage === 'baby' || this.stage === 'teen') {
        textX = this.x + (this.width / 2) - (ctx.measureText(this.name).width / 2);
      }
      ctx.fillText(this.name, textX, this.y - 5);
    }

    // === Zeichne Emoji/Interaktions-Sprechblase ===
    if (this.currentBubble && Date.now() < this.bubbleDisplayUntil) {
      const bubblePadding = 5;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparenter schwarzer Hintergrund
      const bubbleWidth = 32 + (2 * bubblePadding);
      const bubbleHeight = 32 + (2 * bubblePadding); // ca. Texthöhe + Padding
      const bubbleX = this.x + (this.width / 2) - (bubbleWidth / 2);
      const bubbleY = this.y - this.height - 25; // Über dem Charakter

      ctx.fillRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);

      // Kleines Dreieck für den Sprechblasen-Schwanz
      ctx.beginPath();
      ctx.moveTo(this.x + this.width / 2 - 5, bubbleY + bubbleHeight);
      ctx.lineTo(this.x + this.width / 2 + 5, bubbleY + bubbleHeight);
      ctx.lineTo(this.x + this.width / 2, bubbleY + bubbleHeight + 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'white'; // Emoji-Farbe
      ctx.font = '16px Arial Unicode MS'; // Font, der Emojis unterstützt
      //ctx.fillText(this.currentBubble, bubbleX + bubblePadding, bubbleY + bubblePadding + 14);
	  let emoteImage = new Image;
	  emoteImage.src = this.currentBubble;
	  ctx.drawImage(emoteImage, bubbleX + bubblePadding, bubbleY + bubblePadding,32,32)
    }
    // === Ende Emoji/Interaktions-Sprechblase ===


    // Spezielle Animationen und Grafiken basierend auf 'state'
    if (this.state === 'dying') {
      ctx.drawImage(cloudImg, this.x - 10, this.y - 30, this.width + 20, this.height + 20); // Wolke
    } else if (this.state === 'ghost') {
      ctx.drawImage(ghostImg, this.x, this.y + this.ghostYOffset, this.width, this.height); // Geist steigt
    } else if (this.state === 'gravestone') {
      ctx.drawImage(gravestoneImg, this.x, this.y + this.height - 20, this.width, 40); // Grabstein am Boden (Höhe auf 40 angepasst)
    } else if (this.state === 'loving') {
      // Pulsierende Herzen-Animation
      const pulseSpeed = 0.005; // Geschwindigkeit des Pulsierens
      const pulseMagnitude = 0.1; // Stärke des Pulsierens
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
    } else if (this.state === 'playing_soccer') { // NEU: Fußball-Animation
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
    } else if (this.state === 'dancing') { // NEU: Dance-Battle-Animation
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
    } else if (this.state === 'gaming') { // NEU: Game-Battle-Animation
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
    }
  }
}

// === Listen und Bodenkoordinaten ===
let männchenListe = [];
const groundMinY = canvas.height - 100; // Etwas höher als der unterste Rand
const groundMaxY = canvas.height - 60; // Der ursprüngliche groundY

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
    character: 'character.png', // Könnte ein allgemeiner Fallback sein oder für eine Startfigur
    baby: 'baby.png',
    teenager: 'character.png', // NEU
    adult: 'character.png', // NEU
    cloud: 'cloud.png',
    ghost: 'Ghost.png',
    gravestone: 'Gravestone.png',
    heart: 'Heart.png',
    soccer: 'Heart.png', // NEU
    dance: 'Heart.png', // NEU
    game: 'Heart.png' // NEU
  };

  loadImages(imageSources, function(images) {
    // Grafiken global zuweisen
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


    // Starte die Animation nur, wenn die Initialisierung abgeschlossen ist
    animate();

    // Initiales Spawning der Charaktere basierend auf den anfänglich bekannten Chat-Usern
    client.connect().then(() => {
      console.log(`🤖 Bot ist verbunden mit ${TwitchChannel}`);

      // Spawne bis zu MAX_CHARACTERS basierend auf den anfänglich bekannten Chat-Usern
      const numToSpawn = Math.min(chatUsers.size, MAX_CHARACTERS);
      for (let i = 0; i < numToSpawn; i++) {
        const randomY = Math.random() * (groundMaxY - groundMinY) + groundMinY;
        const newChar = new Männchen(Math.random() * canvas.width, randomY, 'adult'); // Start als Erwachsener
        if (newChar.name && newChar.name !== 'Unbekannt') {
          activeMaleNames.add(newChar.name);
        }
        männchenListe.push(newChar);
        if (lifespansActive) { // Starte die Lebensspanne, wenn aktiv
          newChar.startStageProgression();
        }
      }
      console.log(`Initial wurden ${numToSpawn} Charaktere gespawnt.`);

      // Prüfen, ob die Lebensdauern direkt nach dem initialen Spawnen beginnen sollen
      if (männchenListe.length >= 20 && !lifespansActive) {
        lifespansActive = true;
        console.log("20 Charaktere erreicht oder überschritten bei Initialisierung. Lebensdauern starten für alle.");
        männchenListe.forEach(m => {
          if (!m.lifespanTimers.death && m.stage !== 'baby') { // Starte nur, wenn nicht schon gestartet und kein Baby
            m.startStageProgression();
          }
        });
      }
      updateScoreboardDisplay(); // Initiales Update des Scoreboards

    }).catch(console.error);

    // Scoreboard alle 5 Sekunden aktualisieren
    setInterval(updateScoreboardDisplay, 5000);
  });
}

// === Kollisionsprüfung ===
function checkCollision(a, b) {
  if (a === b || Date.now() < a.interactionCooldownUntil || Date.now() < b.interactionCooldownUntil) {
    return false; // Keine Selbstkollision oder wenn im Cooldown
  }

  // Prüfe, ob eine Kollision tatsächlich visuell stattfindet
  if (!(Math.abs(a.x - b.x) < a.width && Math.abs(a.y - b.y) < a.height)) {
    return false; // Keine visuelle Überschneidung
  }

  // Babys nehmen nie an speziellen Interaktionen teil, sie gehen einfach vorbei
  if (a.stage === 'baby' || b.stage === 'baby') {
    return false;
  }

  // Jugendliche interagieren nur mit Jugendlichen
  if (a.stage === 'teen' && b.stage === 'teen') {
    // Wenn sie bereits in einem Interaktionszustand sind, ignorieren
    if (a.state.startsWith('playing_') || b.state.startsWith('playing_')) {
      return false;
    }
    return true; // Jugendliche können miteinander interagieren
  }

  // Erwachsene interagieren nur mit Erwachsenen
  if (a.stage === 'adult' && b.stage === 'adult') {
    // Wenn sie bereits in einem Liebeszustand sind, ignorieren
    if (a.state === 'loving' || b.state === 'loving') {
      return false;
    }
    return true; // Erwachsene können miteinander interagieren
  }

  // Wenn die Stufen gemischt sind (z.B. Jugendlicher und Erwachsener), gehen sie einfach vorbei
  return false;
}

// === Kollisionsbehandlung ===
function handleCollision(a, b) {
  if (a.state !== 'alive' || b.state !== 'alive') return; // Nur lebendige Charaktere interagieren

  const r = Math.random();

  // === Behandlung von Teenager-Teenager-Interaktionen ===
  if (a.stage === 'teen' && b.stage === 'teen') {
    // Cooldown anwenden, um schnelle aufeinanderfolgende Interaktionen zu verhindern
    a.interactionCooldownUntil = Date.now() + (5 * 1000); // 5 Sek. Cooldown für jede Interaktion
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

    // Setze Interaktionszustand für Animation
    a.state = `playing_${interactionType}`;
    b.state = `playing_${interactionType}`; // Beide zeigen Interaktions-Icon
    a.animationTimer = Date.now();
    b.animationTimer = Date.now();

    console.log(`${a.name} und ${b.name} sind in einem ${interactionType}-Kampf! ${winner.name} hat gewonnen.`);

    // Dauer der Interaktionsanimation
    setTimeout(() => {
      if (a.state.startsWith('playing_')) a.state = 'alive';
      if (b.state.startsWith('playing_')) b.state = 'alive';

      if (interactionType === 'soccer') {
        // Verlierer startet im Zyklus von vorne (wird wieder zum Baby)
        loser.stage = 'baby';
        loser.teenToAdultDelay = TEEN_TO_ADULT_TIME; // Reset bei Rückkehr zum Baby
        loser.adultLifespanRemaining = ADULT_LIFESPAN; // Reset
        loser.startStageProgression(); // Lebenszyklus für Verlierer neu starten
        console.log(`${loser.name} hat beim Fußball verloren und wird wieder zum Baby.`);
      } else if (interactionType === 'dance') {
        // Verlierer braucht 1min. länger, um Erwachsen zu werden
        loser.teenToAdultDelay += 60 * 1000; // 1 Min. zur Teenager-zu-Erwachsenen-Zeit hinzufügen
        loser.startStageProgression(); // Stufen neu berechnen (Timeout wird neu gesetzt)
        console.log(`${loser.name} hat beim Dance Battle verloren und braucht 1 Min. länger.`);
      } else if (interactionType === 'game') {
        // Verlierer wird sofort erwachsen und lebt noch 40 Sek.
        loser.stage = 'adult';
        loser.adultLifespanRemaining = 40 * 1000; // Verbleibende Lebensspanne als Erwachsener setzen
        loser.startStageProgression(); // Stufen neu berechnen (Timeout wird neu gesetzt)
        console.log(`${loser.name} hat beim Game Battle verloren, wird sofort erwachsen und lebt noch 40s.`);
      }

      // Figuren in verschiedene Richtungen bewegen, um sofortige erneute Kollision zu vermeiden
      if (a.x < b.x) {
        a.direction = -1;
        b.direction = 1;
      } else {
        a.direction = 1;
        b.direction = -1;
      }
      a.speed = Math.random() * 0.5 + 0.5;
      b.speed = Math.random() * 0.5 + 0.5;

    }, TEEN_INTERACTION_DURATION); // Dauer der Interaktionsanimation
    return; // Interaktion behandelt
  }

  // === Behandlung von Erwachsenen-Erwachsenen-Interaktionen (Töten/Baby-Erzeugung) ===
  if (a.stage === 'adult' && b.stage === 'adult') {
    // Baby-Erstellungs-Cooldown für Erwachsene prüfen
    if (r >= 0.66 && (Date.now() < a.babyCooldownUntil || Date.now() < b.babyCooldownUntil)) {
      console.log("Baby-Erstellung aufgrund von Cooldown übersprungen.");
      return;
    }

    if (r < 0.33) {
      // Vorbeilaufen
    } else if (r < 0.66) {
      // Töten
      const victim = Math.random() < 0.5 ? a : b;
      const killer = (victim === a) ? b : a;

      // Scoreboard für den Killer aktualisieren
      if (scoreboard[killer.name]) {
        scoreboard[killer.name].kills = (scoreboard[killer.name].kills || 0) + 1;
      } else {
        scoreboard[killer.name] = {
          kills: 1,
          babies: 0
        };
      }
      updateScoreboardDisplay(); // Scoreboard HTML aktualisieren

      victim.state = 'dying';
      victim.animationTimer = Date.now();

      killer.state = 'loving'; // Temporärer Zustand für den Killer
      setTimeout(() => {
        if (killer.state === 'loving') killer.state = 'alive'; // Zurück zu 'alive' (Erwachsen)
      }, 1000);

      setTimeout(() => victim.state = 'ghost', 500);
      setTimeout(() => victim.state = 'gravestone', 2000);
      setTimeout(() => {
        männchenListe = männchenListe.filter(m => m !== victim);
        if (victim.name && activeMaleNames.has(victim.name)) {
          activeMaleNames.delete(victim.name);
        }
        updateScoreboardDisplay(); // Scoreboard HTML aktualisieren, wenn Charakter entfernt wird
      }, 3000);
    } else {
      // Baby erzeugen (Verlieben)
      a.state = 'loving';
      b.state = 'loving';
      a.animationTimer = Date.now();
      b.animationTimer = Date.now();

      const now = Date.now();
      a.babyCooldownUntil = now + (20 * 1000);
      b.babyCooldownUntil = now + (20 * 1000);
      a.interactionCooldownUntil = now + (10 * 1000);
      b.interactionCooldownUntil = now + (10 * 1000);

      // Scoreboard für die Baby-Erzeugung aktualisieren
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
      updateScoreboardDisplay(); // Scoreboard HTML aktualisieren

      setTimeout(() => {
        if (a.state === 'loving') a.state = 'alive'; // Zurück zu 'alive' (Erwachsen)
        if (b.state === 'loving') b.state = 'alive';

        console.log(`Baby von ${a.name} und ${b.name} erstellt.`);

        const babyX = (a.x + b.x) / 2;
        const randomY = Math.random() * (groundMaxY - groundMinY) + groundMinY;
        const newBaby = new Männchen(babyX, randomY, 'baby'); // Baby als initialStage übergeben
        assignRandomName(newBaby);
        männchenListe.push(newBaby);
        newBaby.startStageProgression(); // Babys Lebenszyklus starten

        // Elternfiguren in verschiedene Richtungen bewegen, um sofortige erneute Kollisionen zu vermeiden
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
  if (!scoreList) return; // Stellen Sie sicher, dass das Element existiert

  // Filtere nach aktiven Charakteren, um sie auf dem Scoreboard anzuzeigen
  // Summiere Kills und Babies, wobei Babies möglicherweise weniger zählen (z.B. * 0.5)
  const activeScores = Object.keys(scoreboard)
    .filter(name => activeMaleNames.has(name)) // Nur User anzeigen, deren Charaktere gerade leben
    .map(name => ({
      name: name,
      score: (scoreboard[name].kills || 0) + (scoreboard[name].babies || 0) // Babies und Kills gleich gewichtet
    }))
    .sort((a, b) => b.score - a.score) // Absteigend nach Score sortieren
    .slice(0, 5); // Die Top 5 anzeigen

  scoreList.innerHTML = ''; // Vorherige Einträge löschen

  activeScores.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = `${entry.name}: ${entry.score.toFixed(0)}`; // Score anzeigen
    scoreList.appendChild(li);
  });
}

// === Animationsschleife ===
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGround();

  // Sortiere die Figuren basierend auf ihrer Y-Koordinate (z-index Effekt)
  männchenListe.sort((a, b) => a.y - b.y);

  männchenListe.forEach(m => m.move());
  männchenListe.forEach(m => m.draw());

  // Kollisionsprüfung für lebende Figuren
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
