# Kaddi_BRB
Zeigt Benutzernamen aus dem Twitch Chat als Figuren an, um Pausen zu überbrücken.

Der Twitch-Kanalname wird als URL-Parameter übergeben: brb.html?channel=kanalname

# Link

https://monster-afk67.github.io/Kaddi_BRB/brb.html?channel=YOURCHANNELNAME

Um die Anwendung mit einem Twitch-Chat zu verbinden, ersetze YOURCHANNELNAME gegen den Channel Name das Channels mit welche du dich verbinden möchtest.

# Grafiken
Die bereits existierenden Grafiken dürfen verwendet werden.
Für jeden der seine eigenen Grafiken sind hier die Daten (in pixel)

Normales Feld (walk.png etc.): 70x70
Schlangen / Leitern: 200x600
Charaktere: 50x50
Aktionen (Pokern / Portal): 25x25

# Aktionsfelder

- Leitern: 4 -> 24, 21 -> 42, 9 -> 30, 58 -> 81, 73 -> 92

- Schlangen: 16 -> 6, 62 -> 18, 47 -> 26, 98 -> 77

- Pokern: 4, 28, 49, 53, 66, 88, 95

- lower_walk: 9, 19

- power_walk: 69, 75


# Funktionen im chat.js Skript

# 1. init()
Zweck: Initialisiert die gesamte Anwendung beim Laden der Seite.

Funktionalität:

Setzt die Canvas-Größe.

Holt Referenzen zu UI-Elementen.

Lädt alle benötigten Bilder (Charakter, Felder, Effekte).

Erstellt das Spielfeld (boardFields).

Stellt die Verbindung zum Twitch-Chat her.

Startet den "Klassischen Modus" des Spiels.

Ruft animate() auf, um die Rendering-Schleife zu starten.

# 2. animate()
Zweck: Die Haupt-Animationsschleife des Spiels.

Funktionalität:

Löscht den Canvas in jedem Frame.

Zeichnet das Spielfeld und alle Charaktere.

Aktualisiert die Animationen der Charaktere (char.updateAnimation()).

Führt Kollisionserkennung und Ziel-Erkennung für Charaktere durch.

Fordert den nächsten Animationsframe an (requestAnimationFrame).

# 3. Männchen (Klasse)
Zweck: Repräsentiert einen einzelnen Spielercharakter auf dem Spielfeld.

Wichtige Methoden:

constructor(fieldNumber = 1, assignedName = null): Erstellt einen neuen Charakter, initialisiert seine Position, Farbe, Namen (entweder zugewiesen oder automatisch aus dem Chat), Status und Animationszustand.

moveToField(targetField, isInstant = false): Bewegt den Charakter zu einem Ziel-Feld. Wenn isInstant auf true gesetzt ist (z.B. für Schlangen/Leitern), erfolgt die Bewegung sofort; ansonsten wird eine Animation gestartet.

startMovementAnimation(targetFieldNum): Initialisiert die schrittweise Bewegung des Charakters zu einem Ziel-Feld, indem ein Pfad berechnet wird.

updateAnimation(): Aktualisiert die Position des Charakters während einer Animation in jedem Frame. Kümmert sich um die Bewegung entlang des Pfades und das Erreichen von Zwischen- und Endzielen.

checkFieldEffects(): Überprüft, ob der Charakter auf einem speziellen Feld (Leiter, Schlange, Power-Feld, Lower-Feld) gelandet ist und löst die entsprechenden Effekte aus (Bewegung zu einem anderen Feld, ggf. instantan).

draw(): Zeichnet den Charakter und seinen Namen auf dem Canvas.

# 4. client.on('chat', ...) (Twitch Chat Listener)
Zweck: Verarbeitet eingehende Nachrichten vom Twitch-Chat.

Funktionalität:

Fügt den Displaynamen des Chatters zur Liste der chatUsers hinzu.

Wenn ein Chatter noch keinen aktiven Charakter hat und das Ziel noch nicht erreicht hat, wird ein neuer Männchen-Charakter für ihn auf Feld 1 gespawnt.

Aktualisiert lastChatTime für bestehende Charaktere.

Ruft updateScoreboardDisplay() auf, um die Anzeige der aktiven Spieler sofort zu aktualisieren.

# 5. classicModeLogic (Objekt)
Zweck: Kapselt die Logik für den klassischen Spielmodus (automatische Würfelwürfe für alle aktiven Spieler).

Wichtige Methoden:

startGame(): Startet den klassischen Spielmodus, setzt den Status und ruft startTurnLoop() auf.

startTurnLoop(): Startet einen setInterval-Timer, der in regelmäßigen Abständen für alle aktiven Charaktere einen Würfelwurf simuliert und ihre Bewegung auslöst.

endGame(): Wird aufgerufen, wenn alle Charaktere das Ziel erreicht haben. Setzt das Spiel zurück und startet eine neue Runde.

# 6. getFieldCoordinates(fieldNumber)
Zweck: Berechnet die Pixelkoordinaten auf dem Canvas für eine gegebene Feldnummer (1-100) des Brettspiels.

Funktionalität: Berücksichtigt das "Schlangenmuster" des Bretts (ungerade Reihen von links nach rechts, gerade Reihen von rechts nach links) und zentriert den Charakter im Feld.

# 7. updateScoreboardDisplay()
Zweck: Aktualisiert die Liste der aktiven Spieler im "Aktive Spieler" Fenster der Benutzeroberfläche.

Funktionalität:

Sortiert die aktiven Charaktere nach ihrer Feldposition (absteigend) und dann alphabetisch nach Namen.

Generiert <li>-Elemente für jeden Charakter mit Namen, Feldnummer und ggf. einem Kronen-Symbol, wenn das Ziel bereits erreicht wurde.

Speichert den aktuellen Scoreboard-Status und die Liste der beendeten Charaktere im localStorage.

# 8. handleCharacterCollision(a, b)
Zweck: Verarbeitet die Interaktion, wenn zwei Charaktere auf demselben Feld landen.

Funktionalität:

Löst einen "Poker"-Zufallsevent aus, wenn die Kollision auf einem POKER_FIELDS-Feld stattfindet.

Bestimmt einen Gewinner und Verlierer.

Der Verlierer wird sofort auf Feld 1 zurückgesetzt (moveToField(1, true)).

Der Gewinner rückt um 2 Felder vor (moveToField(winner.currentField + 2, false)).

Setzt einen kurzen Cooldown für weitere Interaktionen.

Aktualisiert das Scoreboard.

# 9. toggleGraphicsVisibility()
Zweck: Schaltet die Sichtbarkeit der Brettspielgrafiken um.

Funktionalität: Wechselt zwischen der detaillierten Grafikansicht und einer vereinfachten Ansicht mit nur den Feldnummern.
