# Lemanus Wave - Technical Operations

Date: 2026-06-24

## Decision summary

Lemanus Wave starts as a static web app.

Current technical decision:

- no Docker for MVP 1 / MVP 2;
- no production Node.js runtime;
- no database;
- no authentication;
- no backend service;
- build locally and on Infomaniak from Git;
- deploy generated static files.

This keeps the project aligned with the LEAN-first rule and the current product scope.

## Local development

Use a simple Node.js frontend workflow.

Recommended stack:

- `Vite`
- `TypeScript`
- `MapLibre`
- `OpenFreeMap`
- local `GeoJSON` files

Expected local workflow:

```sh
npm install
npm run dev
```

The local dev server is only for development. It is not the production runtime.

## Local GPS testing

Mac development machines should not be assumed to have reliable GPS.

The app should include a local-only mock GPS mode for development and testing.

Rules:

- mock GPS is allowed in local development only;
- use `import.meta.env.DEV` to gate mock GPS controls and dev-only behavior;
- do not expose mock GPS controls in production builds;
- do not allow a production query parameter to enable mock GPS;
- show a clear `DEV MOCK GPS` indicator when mock mode is active;
- keep mock GPS logic isolated, for example in `src/dev/mockGps.ts`;
- keep the application code behind a common GPS provider interface so real GPS and mock GPS can be swapped safely.

Recommended mock behavior:

- fixed position on the Leman when the app starts;
- no simulated movement;
- no simulated speed;
- speed may remain unavailable in mock mode.

## GPS behavior

The app asks for location automatically on startup.

Production GPS behavior should use `MapLibre GeolocateControl` as the GPS and follow-camera engine.
The app UI may remain custom, but it should consume MapLibre geolocation events instead of reimplementing browser GPS tracking and follow-camera behavior.

Rules:

- use `MapLibre GeolocateControl` for real GPS permission, live position watch, and follow-position camera behavior;
- keep custom controls as UI only, wired to the MapLibre geolocate control;
- keep custom panels, weather, speed, and marker orientation as consumers of GPS readings;
- do not duplicate MapLibre's GPS follow-camera engine with a parallel custom camera loop in production;
- keep the local mock GPS provider separate because it is a development-only simulation.

Once GPS is accepted and active, no dedicated GPS status or activation button should remain visible. A `Reessayer GPS` fallback button is displayed only after a permission refusal or location error.

## Phone orientation behavior

Phone orientation is separate from GPS movement heading.

Rules:

- use device orientation sensors to display where the phone is pointing;
- do not infer this feature from GPS movement;
- keep the GPS marker as a simple dot when orientation is unavailable or refused;
- ask for device orientation permission only from a user action when the browser requires it;
- allow the user to rotate the map according to phone orientation via a dedicated map control;
- disable map-orientation mode when the user drags or rotates the map manually;
- allow manual zoom without disabling follow-position or map-orientation modes;
- stop any active automatic map animation when the user starts dragging or rotating the map;
- update the GPS marker from raw GPS readings, even if accuracy is weak;
- use the latest usable GPS reading for automatic camera centering;
- pause automatic camera heading updates while the user is zooming, then resume after zoom ends;
- throttle automatic map bearing updates to avoid fighting user gestures and stacking map animations;
- throttle marker heading rendering separately from map rotation;
- in local mock GPS mode, use a fixed south-facing orientation.

## Speed calculation

Speed is derived from the latest GPS readings only while the speed panel is open.

Speed behavior:

- if the browser provides native GPS speed, display that value converted to `km/h`;
- otherwise compute speed from the distance between the previous and current GPS readings divided by elapsed time;
- keep a dedicated `lastSpeedReading` so ignored short-interval GPS samples do not freeze or corrupt speed calculation;
- smooth the displayed value to avoid abrupt jumps;
- ignore computed speed when GPS accuracy is weaker than 120 m;
- ignore samples closer than 1.5 seconds apart for computed speed;
- treat only very small GPS movements as stationary to avoid speed caused by GPS jitter while preserving low-speed navigation;
- prefer the browser native speed when available, including at low speed;
- require one confirming sample before accepting a sudden start above 8 km/h from a near-stationary state;
- reject impossible speed spikes above 120 km/h;
- reject sudden jumps from an already established speed unless they stay within a plausible acceleration envelope;
- do not compute or update speed while the speed panel is collapsed;
- reset the displayed speed to `--` when the speed panel is collapsed.

Battery note:

- the app still keeps GPS active while the speed panel is collapsed because the map position and weather features need the current location;
- the browser is allowed to reuse recent positions for up to 5 seconds with `maximumAge: 5000`;
- if battery use becomes a problem later, add a broader GPS mode control instead of only hiding the speed panel.

## Battery-conscious update rules

The app should avoid unnecessary sensor, CPU, and network work.

Rules:

- GPS is the only frequently updated live signal after the user activates it.
- Speed is derived from GPS and is calculated only while the speed panel is open.
- Weather is fetched once when the first GPS position is available.
- Weather is fetched again only when the user taps the weather refresh button.
- Weather must not auto-refresh on every GPS movement.
- Weather must not auto-refresh just because the weather panel is opened or closed.
- Weather condition visuals use local Meteocons SVG assets from `public/weather-icons`.
- Use the animated `fill` variant only, and copy only the icons needed by the app.

## Docker decision

Docker is not required for the current MVP.

Reasons:

- no database;
- no backend;
- no queue;
- no external service orchestration;
- static build output is enough;
- local setup should stay simple.

Docker may be reconsidered only if the product later adds:

- SQL database;
- authentication stack;
- backend API;
- background jobs;
- multiple services;
- local parity requirements that justify containers.

## Git workflow

Development happens locally first.

Deployment flow:

1. Develop locally.
2. Commit changes.
3. Push to Git.
4. Pull from Git on Infomaniak.
5. Build on Infomaniak.
6. Serve the generated static files.

This is similar in spirit to the Dram Notes flow, but simpler because there is no app server to restart.

## Production on Infomaniak

Expected production workflow:

```sh
git pull
npm ci
npm run build
```

The production web root should serve the generated `dist/` output, either directly or by copying `dist/` into the public web directory.

No `pm2`, no Node.js process, and no app restart should be required while the product remains static.

## Production model

Production serves static assets:

- HTML;
- CSS;
- JavaScript;
- images/assets;
- GeoJSON files.

Runtime API calls are allowed from the browser when needed, for example:

- OpenFreeMap / map tile service;
- Open-Meteo in MVP 2.

## GeoJSON data generation

The indicative 300 m line is generated from a manually prepared Lake Leman shoreline GeoJSON.

Input:

- `public/data/leman-shoreline.geojson`

Output:

- `public/data/leman-300m-indicative.geojson`

Regenerate after updating the shoreline file:

```sh
npm run geo:300m
```

The generated line remains indicative only and must not be presented as a legal reference.

## When this decision changes

The project should move toward `L3 + B3` only when product requirements actually include persistent product logic, for example:

- user accounts;
- saved preferences;
- saved routes;
- synced favorites;
- trip history;
- backend-managed ports;
- alerts per user;
- database-backed features.

At that point, reassess the stack in Notion before changing the architecture.
