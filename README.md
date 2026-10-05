# Output Tracker

A simple daily tracker for a 12-week "output over polish" framework, running from Mon 28.09.26 to Sun 20.12.26.

Live: https://yvesspiri.net/output-tracker/

It's plain HTML, CSS and JavaScript, with no build step and no server. It works offline and can be added to your home screen.

## What it tracks

Five things a day, all on the Today screen:

- **NoPo:** abstained today. The row shows how many days in a row.
- **Exercise:** tap Jog, Row or Workout (one is enough).
- **Ableton:** one session.
- **Night Pages**
- **Homework for Life:** tick it, and write the one or two sentences in the field below.

A day counts when all five are done. The chain follows one rule: never miss two days in a row. **History** shows all 84 days, coloured by how many of the five you hit. Tap a day to fix a tick you missed.

The day rolls over at 04:00. Anything you do after midnight still counts for the evening before.

## Backup: export and import

All data lives in your browser's localStorage under the key `outputTracker.v1`. Nothing is sent anywhere. Each browser and device has its own copy, and clearing site data erases it.

- **Export:** More > Backup > Export JSON downloads a file like `output-tracker-04.10.26.json`. Do this weekly, for example after the Sunday review. More shows a reminder after 7 days without an export.
- **Import:** More > Backup > Import JSON, then pick a backup file. This **replaces** all data on that device.
- **Moving between desktop and phone:** export on one device, send the file to the other (AirDrop, mail, cloud drive), then import it there. There's no automatic sync, so treat one device as the main one, or export and import each time you switch.

## Cloud sync (optional)

More > Cloud sync keeps phone and desktop in step through Supabase (free tier). Sign in with the same email and password on each device.

- The app still works fully offline. Changes upload a few seconds after you make them, and when you leave the app. Other devices pick them up when you open them.
- **Conflicts:** if two devices changed data between syncs, the newer change wins. The losing copy isn't thrown away: this device's copy can be downloaded from More > Backup, and the cloud's previous version is kept in the `prev` column.
- **First sign-in on a device that already has data:** the app asks whether to keep the cloud data or this device's data. It never merges silently.
- The light/dark theme stays per device.
- **Setup:** see `supabase.sql`. The publishable key in `js/sync.js` is meant to be public. Row level security makes sure each account can only read its own row.

Export and import still work as a manual backup.

## Install on your phone

Open the live URL, then:

- **iOS Safari:** Share > Add to Home Screen
- **Android Chrome:** menu > Install app

## Development

Serve the folder with any static server, for example:

```
python3 -m http.server 8000
```

After changing files, bump `CACHE` in `sw.js` so installed copies pick up the update.
