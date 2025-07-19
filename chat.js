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

client.on('chat', (channel, userstate, message, self) => {
  if (self) return; // Ignoriere Nachrichten vom Bot selbst

  const displayName = userstate['display-name'];

  // Füge den User zum allgemeinen Set der Chat-User hinzu
  chatUsers.add(displayName);

  // Prüfe, ob bereits ein Charakter für diesen User existiert und angezeigt wird
  // und ob die maximale Charakteranzahl noch nicht erreicht ist
  if (!activeMaleNames.has(displayName) && männchenListe.length < MAX_CHARACTERS) {
    const randomY = Math.random() * (groundMaxY - groundMinY) + groundMinY;
    const newCharacter = new Männchen(Math.random() * canvas.width, randomY);
    newCharacter.name = displayName; // Weise den spezifischen Namen zu
    männchenListe.push(newCharacter);
    activeMaleNames.add(displayName); // Füge den Namen zu den aktiven Namen hinzu
    console.log(`Neuer Charakter für ${displayName} gespawnt. Gesamt: ${männchenListe.length}`);
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
const characterImg = new Image();
const babyImg = new Image();
const babyGrownImg = new Image();
const cloudImg = new Image();
const ghostImg = new Image();
const gravestoneImg = new Image();
const heartImg = new Image();

// === Konstanten für Lebensdauern und Spawning ===
const BABY_GROW_TIME = 20 * 1000; // 20 Sekunden
const BABY_DEATH_TIME = 80 * 1000; // 1 Minute 20 Sekunden (20s wachsen + 60s erwachsen)
const ADULT_DEATH_TIME = 120 * 1000; // 2 Minuten
const MIN_CHAT_USERS_TO_SPAWN = 10; // Beibehalten, falls du es für eine initiale Spawning-Logik außerhalb des dynamischen Spawning nutzen möchtest
const MAX_CHARACTERS = 25;
const BABY_CREATION_DURATION = 5 * 1000; // Baby-Erstellung dauert 5 Sekunden

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
  constructor(x, y, isBaby = false, isGrownBaby = false) {
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 40;
    this.speed = Math.random() * 1.5 + 0.5;
    this.direction = Math.random() < 0.5 ? -1 : 1; // -1 für links, 1 für rechts
    this.isBaby = isBaby;
    this.isGrownBaby = isGrownBaby; // Neuer Status für ausgewachsenes Baby
    this.state = 'alive'; // Neuer Zustand: 'alive', 'dying', 'ghost', 'gravestone', 'loving'
    this.animationTimer = 0; // Timer für Animationen
    this.ghostYOffset = 0; // Für die Geisteranimation
    this.spawnTime = Date.now(); // Zeitpunkt der Erstellung

    // Namen werden direkt zugewiesen, wenn ein spezifischer User chattet.
    // Für initial gespawnte oder Babys wird assignRandomName verwendet.
    // Falls ein Name schon gesetzt wurde (durch client.on('chat')), wird dieser behalten.
    if (!this.name) {
      assignRandomName(this);
    }


    if (isBaby) {
      // Babys wachsen nach BABY_GROW_TIME zu ausgewachsenen Babys heran
      setTimeout(() => {
        this.isBaby = false;
        this.isGrownBaby = true;
      }, BABY_GROW_TIME);
      // Babys sterben nach BABY_DEATH_TIME
      setTimeout(() => {
        if (this.state === 'alive') { // Nur sterben, wenn nicht schon gestorben
          männchenListe = männchenListe.filter(m => m !== this);
          // Entferne den Namen auch aus activeMaleNames, wenn es ein benanntes Männchen war
          if (this.name && activeMaleNames.has(this.name)) {
            activeMaleNames.delete(this.name);
          }
        }
      }, BABY_DEATH_TIME);
    } else {
      // Erwachsene sterben nach ADULT_DEATH_TIME
      setTimeout(() => {
        if (this.state === 'alive') { // Nur sterben, wenn nicht schon gestorben
          männchenListe = männchenListe.filter(m => m !== this);
          // Entferne den Namen auch aus activeMaleNames, wenn es ein benanntes Männchen war
          if (this.name && activeMaleNames.has(this.name)) {
            activeMaleNames.delete(this.name);
          }
        }
      }, ADULT_DEATH_TIME);
    }
  }

  move() {
    if (this.state === 'alive') { // Nur bewegen, wenn lebendig
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
    // Grafiken basierend auf Zustand und Typ
    let imgToDraw = characterImg;
    if (this.isBaby) {
      imgToDraw = babyImg;
    } else if (this.isGrownBaby) {
      imgToDraw = babyGrownImg;
    }

    ctx.save(); // Aktuellen Canvas-Zustand speichern

    if (this.state === 'alive' || this.state === 'dying' || this.state === 'loving') {
      if (this.direction === -1) { // Wenn die Figur nach links läuft (Originalrichtung des Models)
        ctx.drawImage(imgToDraw, this.x, this.y, this.width, this.height);
      } else { // Wenn die Figur nach rechts läuft, spiegeln
        ctx.translate(this.x + this.width, this.y); // Zum Drehpunkt (rechte Seite der Figur) verschieben
        ctx.scale(-1, 1); // Horizontal spiegeln
        ctx.drawImage(imgToDraw, 0, 0, this.width, this.height); // Bei 0,0 zeichnen, da der Ursprung verschoben ist
      }
    }

    ctx.restore(); // Canvas-Zustand wiederherstellen

    // Namen zeichnen (nicht für Babys oder Geister/Grabsteine)
    if (this.name && !this.isBaby && !this.isGrownBaby && this.state !== 'ghost' && this.state !== 'gravestone') {
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      // Textposition anpassen, wenn gespiegelt wird, damit der Name korrekt über der Figur ist
      if (this.direction === -1) {
        ctx.fillText(this.name, this.x, this.y - 5);
      } else {
        // Wenn gespiegelt, muss der Text auch entsprechend verschoben werden, um über der Figur zu sein.
        ctx.fillText(this.name, this.x + this.width - ctx.measureText(this.name).width, this.y - 5);
      }
    }

    // Spezielle Animationen und Grafiken
    if (this.state === 'dying') {
      ctx.drawImage(cloudImg, this.x - 10, this.y - 30, this.width + 20, this.height + 20); // Wolke
    } else if (this.state === 'ghost') {
      ctx.drawImage(ghostImg, this.x, this.y + this.ghostYOffset, this.width, this.height); // Geist steigt
    } else if (this.state === 'gravestone') {
      ctx.drawImage(gravestoneImg, this.x, this.y + this.height - 20, this.width, 40); // Grabstein am Boden (Höhe auf 40 angepasst)
    } else if (this.state === 'loving') {
      // Pulsierende Herzen-Animation
      const pulseSpeed = 0.005; // Geschwindigkeit des Pulsierens (anpassen für schneller/langsamer)
      const pulseMagnitude = 0.1; // Stärke des Pulsierens (anpassen für mehr/weniger Skalierung)
      const scale = 1 + Math.sin(Date.now() * pulseSpeed) * pulseMagnitude;

      ctx.save();
      // Translate to the center of the heart, scale, then translate back
      const heartWidth = this.width / 2;
      const heartHeight = this.height / 2;
      const heartX = this.x + this.width / 4;
      const heartY = this.y - 20;

      ctx.translate(heartX + heartWidth / 2, heartY + heartHeight / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(heartImg, -heartWidth / 2, -heartHeight / 2, heartWidth, heartHeight);
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
    character: 'character.png',
    baby: 'baby.png',
    babyGrown: 'babyGrown.png',
    cloud: 'cloud.png',
    ghost: 'Ghost.png',
    gravestone: 'Gravestone.png',
    heart: 'Heart.png'
  };

  loadImages(imageSources, function(images) {
    // Grafiken global zuweisen
    groundImg.src = images.ground.src;
    characterImg.src = images.character.src;
    babyImg.src = images.baby.src;
    babyGrownImg.src = images.babyGrown.src;
    cloudImg.src = images.cloud.src;
    ghostImg.src = images.Ghost.src;
    gravestoneImg.src = images.Gravestone.src;
    heartImg.src = images.Heart.src;

    // Starte die Animation nur, wenn die Initialisierung abgeschlossen ist
    animate();

    // Initiales Spawning der Charaktere basierend auf der aktuellen chatUsers-Größe
    // Dies geschieht nach dem Laden der Bilder und vor dem Start der Animation
    client.connect().then(() => {
      console.log(`🤖 Bot ist verbunden mit ${TwitchChannel}`);

      // Spawne bis zu MAX_CHARACTERS basierend auf den anfänglich bekannten Chat-Usern
      // Jeder Charakter, der hier gespawnt wird, bekommt einen zufälligen Namen aus chatUsers
      const numToSpawn = Math.min(chatUsers.size, MAX_CHARACTERS);
      for (let i = 0; i < numToSpawn; i++) {
        const randomY = Math.random() * (groundMaxY - groundMinY) + groundMinY;
        const newChar = new Männchen(Math.random() * canvas.width, randomY);
        // assignRandomName wird im Konstruktor bereits aufgerufen, aber wir wollen sicherstellen,
        // dass der Name auch zu den activeMaleNames hinzugefügt wird, falls es ein echter Chat-User ist.
        if (newChar.name && newChar.name !== 'Unbekannt') {
          activeMaleNames.add(newChar.name);
        }
        männchenListe.push(newChar);
      }
      console.log(`Initial wurden ${numToSpawn} Charaktere gespawnt.`);

    }).catch(console.error);
  });
}

// === Kollisionsprüfung ===
function checkCollision(a, b) {
  return (
    a !== b &&
    Math.abs(a.x - b.x) < a.width &&
    Math.abs(a.y - b.y) < a.height &&
    !a.isBaby && !b.isBaby && // Babys kollidieren nicht wie Erwachsene
    !a.isGrownBaby && !b.isGrownBaby // Ausgewachsene Babys kollidieren auch nicht wie Erwachsene für diese Logik
  );
}

// === Kollisionsbehandlung ===
function handleCollision(a, b) {
  // Wenn eine der Figuren nicht im "alive"-Zustand ist, ignorieren
  if (a.state !== 'alive' || b.state !== 'alive') return;

  const r = Math.random();
  if (r < 0.33) {
    // Vorbeilaufen - nichts Besonderes zu tun
  } else if (r < 0.66) {
    // Töten
    const victim = Math.random() < 0.5 ? a : b;
    const killer = (victim === a) ? b : a;

    victim.state = 'dying'; // Opfer geht in den "dying"-Zustand
    victim.animationTimer = Date.now();

    // Setze den Killer für einen kurzen Moment auf "loving", damit er nicht sofort wieder kollidiert
    killer.state = 'loving';
    setTimeout(() => {
      if (killer.state === 'loving') { // Sicherstellen, dass er nicht schon wieder in einer anderen Kollision ist
        killer.state = 'alive';
      }
    }, 1000); // 1 Sekunde Pause

    // Wolke und dann Geist
    setTimeout(() => {
      victim.state = 'ghost'; // Wird zu Geist
    }, 500); // Nach 0.5 Sekunden (Wolke sollte kurz sichtbar sein)

    // Geist verschwindet, Grabstein erscheint
    setTimeout(() => {
      victim.state = 'gravestone'; // Wird zu Grabstein
    }, 2000); // Geist steigt ca. 1.5 Sekunden

    // Grabstein verschwindet und Figur wird entfernt
    setTimeout(() => {
      männchenListe = männchenListe.filter(m => m !== victim);
      // Entferne den Namen auch aus activeMaleNames, wenn es ein benanntes Männchen war
      if (victim.name && activeMaleNames.has(victim.name)) {
        activeMaleNames.delete(victim.name);
      }
    }, 3000); // Grabstein bleibt für 1 Sekunde (2s bis 3s)

  } else {
    // Baby erzeugen (Verlieben)
    a.state = 'loving';
    b.state = 'loving';
    a.animationTimer = Date.now();
    b.animationTimer = Date.now();

    // Herzen erscheinen für BABY_CREATION_DURATION (5 Sekunden)
    setTimeout(() => {
      // Setze Figuren wieder auf "alive"
      if (a.state === 'loving') a.state = 'alive';
      if (b.state === 'loving') b.state = 'alive';

      // Einer der beteiligten Eltern stirbt (ohne Animation)
      const dyingParent = Math.random() < 0.5 ? a : b;
      männchenListe = männchenListe.filter(m => m !== dyingParent);
      // Entferne den Namen des sterbenden Elternteils aus activeMaleNames
      if (dyingParent.name && activeMaleNames.has(dyingParent.name)) {
        activeMaleNames.delete(dyingParent.name);
      }
      console.log(`Einer der Eltern (${dyingParent.name || 'Unbekannt'}) ist nach Baby-Geburt gestorben.`);

      // Baby erzeugen
      const babyX = (a.x + b.x) / 2;
      const randomY = Math.random() * (groundMaxY - groundMinY) + groundMinY;
      männchenListe.push(new Männchen(babyX, randomY, true)); // Neues Baby

      // Alle drei laufen hintereinander her (einfache Implementierung: Geschwindigkeiten anpassen)
      const newSpeed = Math.random() * 0.8 + 0.2; // Etwas langsamer für die Gruppe
      const newDirection = Math.random() < 0.5 ? -1 : 1;
      // Der überlebende Elternteil
      const survivingParent = (dyingParent === a) ? b : a;
      survivingParent.speed = newSpeed;
      survivingParent.direction = newDirection;


      // Finden Sie das gerade erstellte Baby und passen Sie seine Geschwindigkeit an
      const newBaby = männchenListe[männchenListe.length - 1];
      if (newBaby.isBaby) { // Sicherstellen, dass es wirklich das Baby ist
        newBaby.speed = newSpeed;
        newBaby.direction = newDirection;
      }

    }, BABY_CREATION_DURATION); // 5 Sekunden für die Herzen und Baby-Erstellung
  }
}

// === Boden zeichnen ===
function drawGround() {
  ctx.drawImage(groundImg, 0, groundMaxY, canvas.width, canvas.height - groundMaxY);
}

// === Animationsschleife ===
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGround();

  // Sortiere die Figuren basierend auf ihrer Y-Koordinate (z-index Effekt)
  // Dies stellt sicher, dass Figuren, die "weiter unten" sind, über denen "weiter oben" gezeichnet werden.
  männchenListe.sort((a, b) => a.y - b.y);

  männchenListe.forEach(m => m.move());
  männchenListe.forEach(m => m.draw());

  // Kollisionsprüfung für lebende Erwachsene
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
