# Emberline Tactics

An original round-based tactical FPS built with three.js 0.187.0 — an entry for the make.fun "best three.js tactical FPS" bounty.

- Two bomb sites (A Furnace / B Depot): plant and defuse
- Buy menu and round economy, 3 weapons + grenade + armor
- 4 bots that patrol, hold sites, investigate sounds, and retake
- Hit zones with headshot multiplier, recoil and spread, armor
- First to 5 round wins (max 9 rounds)

## Play

Serve `game/` with any static file server, then open `index.html` in desktop Chrome:

```
node serve.ts
```

then open http://localhost:8080 (Node 22+).

Controls: WASD move, mouse aim, click fire, R reload, B buy menu, E plant/defuse, Shift walk, C crouch, Space jump.

## License

MIT
