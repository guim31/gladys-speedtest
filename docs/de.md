# Speedtest.net & Cloudflare für Gladys Assistant

Miss deine Internetverbindung regelmäßig, direkt aus Gladys, über das weltweite
Servernetz von Speedtest.net oder den Geschwindigkeitstest von Cloudflare. Jeder
Test füllt vier Sensoren, die du im Dashboard als Diagramm anzeigen und in
Szenen nutzen kannst:

| Sensor       | Einheit | Was er dir sagt                                        |
| ------------ | ------- | ------------------------------------------------------ |
| **Download** | Mbit/s  | Wie schnell Daten bei dir ankommen                     |
| **Upload**   | Mbit/s  | Wie schnell Daten dein Zuhause verlassen               |
| **Ping**     | ms      | Reaktionszeit der Verbindung (niedriger ist besser)    |
| **Jitter**   | ms      | Stabilität dieser Reaktionszeit (niedriger ist besser) |

Typische Anwendungen: prüfen, was dein Anbieter wirklich liefert, dich per
Szene benachrichtigen lassen, wenn der Download unter das fällt, was du
bezahlst, oder erkennen, dass eine Ersatzleitung (4G-Failover …) übernommen hat.

## Ablauf eines Tests

Die Integration spricht direkt mit der Infrastruktur von Speedtest.net — kein
Konto, kein API-Schlüssel, keine Ookla-Software. Standardmäßig prüft sie die
nächstgelegenen Server, behält den gesündesten und misst dann Latenz, Download
und Upload (insgesamt etwa 25 Sekunden). Du kannst auch einen bestimmten
Server festlegen: Die Schaltfläche **Server in der Nähe auflisten** zeigt die
IDs, die du in das Feld **Speedtest.net-Server-ID** einträgst.

## Die Engine wählen

Das Feld **Test-Engine** legt fest, wogegen du misst. Beide Engines füllen
dieselben vier Sensoren, mit demselben Zeitplan, denselben parallelen
Verbindungen und derselben Messdauer: Beim Wechsel bleiben dein Gerät, sein
Verlauf und deine Szenen erhalten.

- **Speedtest.net** (Standard): ein Server des Speedtest.net-Netzes in deiner
  Nähe, automatisch gewählt oder über seine ID festgelegt.
- **Cloudflare**: der nächstgelegene Standort des Cloudflare-Netzes, der hinter
  [speed.cloudflare.com](https://speed.cloudflare.com/). Kein Server zu
  wählen, kein Konto. Das Widget zeigt ihn als _Cloudflare_ gefolgt vom
  Flughafencode seiner Stadt (_FRA_ für Frankfurt, _CDG_ für Paris …).

Die Cloudflare-Engine kann auch **deine öffentliche IP-Adresse** anzeigen, so
wie Cloudflare sie sieht: Aktiviere **Meine öffentliche IP anzeigen
(Cloudflare)**. Sie erscheint dann im Widget und im Ergebnis des manuellen
Tests und wird mit dem letzten Ergebnis im Speicher der Integration abgelegt.
Sie wird nie in die Logs geschrieben. Standardmäßig deaktiviert.

Cloudflare misst die Latenz an einer leeren Anfrage, abzüglich der
Verarbeitungszeit, die sein Server meldet, und behält den besten von 20
Messwerten; der Jitter ist der mittlere Abstand zwischen aufeinanderfolgenden
Messwerten, wie bei Speedtest.net. Die Werte der beiden Engines liegen nah
beieinander, sind aber nicht gleich: Vergleiche eine Leitung mit sich selbst,
mit derselben Engine.

## Gut zu wissen

- **Ein Test lastet deine Verbindung voll aus, solange er läuft.** Auf sehr
  schnellen Leitungen sind die Ergebnisse außerdem leicht konservativ, weil
  die Messung sich die CPU mit den Grenzen teilt, die Gladys den Integrationen
  setzt.
- **Ein Test überträgt echte Daten** — mehrere hundert MB pro Durchlauf auf
  einer schnellen Leitung, egal mit welcher Engine (auf einer Gigabit-Leitung
  bis zu etwa 1,5 GB pro Richtung mit den Standardeinstellungen). Wenn dein
  Tarif ein Datenvolumen hat, vergrößere das Intervall zwischen den Tests oder
  deaktiviere die automatischen Tests und nutze nur die Schaltfläche.
- **Cloudflare begrenzt starke Nutzung.** Nach viel Verkehr in kurzer Zeit
  (zwei Gigabit-Tests im Abstand weniger Minuten, in unseren Versuchen)
  verweigert es eine Zeit lang große Downloads mit dem Fehler HTTP 429: Der
  Test schlägt dann mit einer entsprechenden Meldung fehl, und der nächste
  geplante Test versucht es erneut. Ein automatischer Test läuft nie öfter als
  alle 10 Minuten.
- Geplante Tests folgen der Einstellung **Intervall zwischen Tests**
  (Standard: ein Test pro Stunde). Die Schaltfläche
  **Geschwindigkeitstest starten** funktioniert jederzeit.

## Dashboard-Widget

Ab Gladys 5.1 fügt die Integration dem Dashboard-Editor ein Widget
**Internetgeschwindigkeit** hinzu (**Hinzufügen → Speedtest.net &
Cloudflare**). Es zeigt:

- zwei Kacheln nebeneinander, Download und Upload: in ganzen Mb/s oder in Gb/s
  mit einer Nachkommastelle ab 1.000 Mb/s (1,2 Gb/s);
- ein Flächendiagramm des Verlaufs zweier Sensoren: **Diagramm** wählt
  _Download und Upload_ (Standard) oder _Ping und Jitter_, **Verlaufszeitraum**
  die letzten 24 Stunden, die letzte Woche (Standard) oder den letzten Monat;
- Ping und Jitter des letzten Tests, seinen Zeitpunkt und den verwendeten
  Server (Speedtest.net: Betreiber und Stadt; Cloudflare: _Cloudflare · FRA_),
  deine öffentliche IP, wenn du sie angefordert hast, und _Test läuft_, solange
  ein Test läuft;
- eine Schaltfläche **Test starten**. Das Ergebnis erscheint als
  Benachrichtigung, wenn der Test endet (etwa eine halbe Minute). Tippst du
  darauf, während schon ein Test läuft, startet kein zweiter.

**Anzeige** verkürzt das Widget: _Vollständig_ (Standard) ist die Darstellung oben; _Raten, Ping und Diagramm_ behält drei Kacheln (Download, Upload, Ping) und das Diagramm; _Raten und Ping_ nur die drei Kacheln. Diese beiden haben weder Statuszeilen noch Schaltfläche: Einen Test startest du weiterhin in der Konfiguration der Integration.

Gut zu wissen:

- Das Diagramm liest die Sensoren des Geräts: Füge das Gerät zu Gladys hinzu
  (**Integrationen → Speedtest.net & Cloudflare → Entdecken**), damit es sich
  füllt.
- Das Widget rundet nur, was es anzeigt: Gladys behält die gemessenen Werte mit
  Nachkommastellen in den Sensoren und ihrem Verlauf.
- Das letzte Ergebnis bleibt bei einem Neustart der Integration erhalten. Vor
  dem ersten Test zeigen die Kacheln einen Strich und das Widget meldet, dass
  noch kein Ergebnis bekannt ist.
- Die Zeiträume des Diagramms und der lange Verlauf folgen deinen
  Gladys-Einstellungen zur Aufbewahrung der Gerätedaten.

## Fehlerbehebung

- _Ergebnisse niedriger als in der offiziellen App_: Erhöhe **Parallele
  Verbindungen** (schnelle Leitungen werden mit 6–8 besser ausgelastet) oder
  die **Messdauer**.
- _Test schlägt fehl_: Der nächstgelegene Server ist vielleicht ausgefallen —
  lege eine andere **Speedtest.net-Server-ID** fest oder leere das Feld, damit die
  automatische Auswahl defekte Server überspringt. Mit der Cloudflare-Engine
  bedeutet ein Fehler _HTTP 429_, dass Cloudflare deine Adresse eine Zeit lang
  begrenzt: Vergrößere das Intervall oder verkürze die Messdauer.
- _Die Server-ID bewirkt nichts_: Sie gilt nur für die Speedtest.net-Engine.
- _Logs_: Auf der Standardstufe protokolliert die Integration ihren Start, deine
  manuellen Tests und den ersten Fehlschlag des automatischen Tests (dann eine
  Zeile, wenn er wieder funktioniert). Um jeden Test, seinen Server und sein
  Ergebnis zu sehen, setze die Umgebungsvariable `LOG_LEVEL=debug` am
  Container.

Diese Integration ist ein unabhängiges Community-Projekt, weder mit Ookla noch
mit Cloudflare verbunden oder von ihnen unterstützt. Speedtest® ist eine Marke
von Ookla, LLC; Cloudflare® ist eine Marke von Cloudflare, Inc.
