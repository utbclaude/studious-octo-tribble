# Coaching Toolkit

Three football coaching tools in one app, all using the same squad list:

| Tool | What it does |
|---|---|
| **Player development dashboard** | Rates each player on the FA Four Corner Model (Technical/Tactical, Physical, Psychological, Social, scored 1–5) at regular reviews. Shows a heatmap of the whole squad with the change since each player's last review. Also shows trend charts, a watch list (low attendance, falling ratings, overdue reviews, injuries) and **talking points written from your own data**, e.g. *"Players attending 85%+ improved by X since their last review vs Y for those under 75%"*. |
| **Availability & attendance tracker** | Add training sessions and matches (one-off or weekly). Mark each player available, unavailable or injured, and see how many are available in each position. Copy a "still need replies from…" message for the team chat. Take the register (present / late / absent / excused) and get attendance rates per player. Excused absences don't count against a player. |
| **Session-plan generator** | Choose a theme (pressing, building from the back, finishing…), an age group, the session length and the player count. You get a timed plan of warm-up, technical practice, opposed practice, game and cool-down, taken from a drill library with setups, coaching points and progressions. Swap any block, add notes, print it, and save it to that day's training session. |

## Using it

No install or build step. Open `index.html` in a browser, or host the folder on any static host such as GitHub Pages.

- The app first opens with **demo data**: 16 players and 12 weeks of history, so the dashboard has something to show. Go to **Squad → Start fresh** when you're ready to use your own squad.
- Data is saved in your browser's local storage. Use **Squad → Export backup** to keep a copy or move it to another device, and **Export attendance (CSV)** to open it in a spreadsheet.
- Everything prints cleanly: session plans, the dashboard and individual player profiles all work as handouts or PDFs.
- Light and dark themes are supported.

## Using it in a DoF application

The dashboard is built as something to talk through in an interview:

1. **A clear framework.** It uses the Four Corner Model, the standard way the FA and academies review player development.
2. **Evidence instead of anecdote.** It links attendance to development, shows squad-wide trends and turns them into session themes.
3. **Process.** Each review has written strengths and targets (an IDP). The dashboard tracks how many reviews are up to date and flags players who need a conversation.
4. **Scales to a club.** The same structure works for every age group. A natural next step is a club-wide view that compares teams.

Before you demo it, load your own (anonymised) squad, or use the demo data and explain that it's illustrative.

## Development

```
js/drills.js      drill library, themes, age groups, phase time split
js/generator.js   session-plan generator (pure, seeded and repeatable)
js/store.js       data model, persistence, demo data, metrics
js/charts.js      lightweight SVG charts with hover tooltips
js/app.js         UI
```

Run the tests (Node 18+):

```
npm test
```
