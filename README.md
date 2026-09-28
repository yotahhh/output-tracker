# Output Tracker

A personal habit and creative-output tracker for a 12-week "output over polish" framework, running from Mon 28.09.26 to Sun 20.12.26.

Live: https://yvesspiri.net/output-tracker/

It's plain HTML, CSS and JavaScript, with no build step and no server. It works offline and can be added to your home screen.

## Views

- **Today:** four floors (Night Pages, Piano, Ableton, Homework for Life), today's micro-task, the warm-up timer, the chain, and reminders (hard stop, posting day, Sunday)
- **Timeline:** 12 weeks in an arrangement-view layout, with lanes for phase, tracks, shipped, posting and checkpoints
- **Review:** the Sunday review form, with this week's Homework for Life entries and past reviews
- **History:** all 84 days, coloured by how many floors were hit. Tap a day to fix a missed tick.
- **More:** active track, energy menu, shipping and posting log, defaults, backup and theme

The day rolls over at 04:00. Anything you do after midnight still counts for the evening before.

## Backup: export and import

All data lives in your browser's localStorage under the key `outputTracker.v1`. Nothing is sent anywhere. Each browser and device has its own copy, and clearing site data erases it.

- **Export:** More > Backup > Export JSON downloads a file like `output-tracker-04.10.26.json`. Do this weekly, for example after the Sunday review. More shows a reminder after 7 days without an export.
- **Import:** More > Backup > Import JSON, then pick a backup file. This **replaces** all data on that device.
- **Moving between desktop and phone:** export on one device, send the file to the other (AirDrop, mail, cloud drive), then import it there. There's no automatic sync, so treat one device as the main one, or export and import each time you switch.

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
