# Orbit Drift

Eine kleine Weltraum-Spiel-Demo für iPad, Smartphone und Desktop. Sammle Kristalle, weiche Asteroiden aus und überlebe die 60-sekündige Mission. Dein Schild schützt dich für zwei Sekunden und lädt anschließend wieder auf.

## Lokal starten

Keine Installation von Abhängigkeiten erforderlich. Im Repository ausführen:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Anschließend im Browser die Adresse des Rechners mit Port 8000 öffnen. Das Spiel benötigt einen HTTP-Server, weil es JavaScript-Module verwendet.

## Auf dem iPad spielen

Die Demo ist für Safari mit Touch-Steuerung vorbereitet. Um eine öffentlich erreichbare Spieladresse zu erhalten, in GitHub unter **Settings → Pages → Build and deployment** die Quelle **Deploy from a branch**, den Branch **main** und den Ordner **/ (root)** wählen und speichern. Nach erfolgreicher Bereitstellung zeigt GitHub dort die Spieladresse an. Die Veröffentlichung macht die Demo öffentlich zugänglich.

Diese Einstellung wird durch das Anlegen der Dateien nicht automatisch aktiviert.

## Steuerung

- **iPad / Touch:** Finger im Spielfeld bewegen; das Schiff folgt. Den Schild über die Schaltfläche aktivieren.
- **Tastatur:** Pfeiltasten oder WASD zum Steuern, Leertaste für den Schild, P oder Escape für Pause.
- **Maus:** Im Spielfeld klicken und ziehen.
- Sound ist optional und zunächst ausgeschaltet. Bestleistungen werden ausschließlich lokal im Browser gespeichert, soweit der Browser dies erlaubt.

## Tests

```sh
node --test tests/engine.test.mjs
```

Die Spiellogik prüft unter anderem Kollisionen, Schutzschild, Unverwundbarkeit, Missionsende und Spielfeldgrenzen. Die Demo verwendet Canvas 2D und Web Audio ohne externe Bibliotheken, Schriftarten oder Netzwerkdienste.
