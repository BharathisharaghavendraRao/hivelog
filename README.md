# HiveLog

Hands-free beekeeping records using the Irish Beekeeping Association hive inspection checklist. The app reads each item aloud; you select the answer by voice.

## Run

```bash
npm install
npm run dev
```

Use **Chrome** or **Edge** on `localhost` or HTTPS. Allow microphone access when prompted.

## Flow

1. Say `inspect alpha` (or beta / meadow)
2. **Header** — date, weather, time, hive ID, location, temperature  
   Date, time, hive, and location are filled in. Say `next` to keep them, or speak a new value.
3. The app reads each checklist item and its options. Say the option you want.
4. **Actions & notes** — speak freely, then `save`

## Checklist

1. Hive overview & external activity — entrance, temperament, odour, dead bees  
2. Queen status & brood pattern — queen spotted, marker colour, eggs, brood pattern, brood stages  
3. Colony health & varroa — disease, adult bee health, varroa load, queen cells  
4. Stores & space management — honey, pollen, room to expand, brace comb  

## Voice

| Context | Say |
| --- | --- |
| Dashboard | `inspect alpha` · `history beta` |
| Choice item | the option, e.g. `calm`, `yes`, `play cups` |
| Header / text | `next` to keep the value, or speak then `next` |
| Any step | `back` · `repeat` · `skip` · `cancel` |
| Notes | `save` |
