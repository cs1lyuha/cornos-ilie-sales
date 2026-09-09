# AI-LOG

## Tool used

GitHub Copilot CLI in Auto mode, with Expo SDK 57 documentation consulted before implementation.

## Start prompt (copy-paste)

> Create a React Native / Expo mobile MVP for Cornos Ilie's M2 field-sales task from Slack. Build a searchable customer list, quick offline order flow, large plus/minus controls, local persistence, sync queue, and README. Use Expo SDK 57 and TypeScript.

## Three prompts that mattered most

1. “Implement the first MVP with local demo data, large one-handed controls, AsyncStorage persistence, a sync queue, and a visible speed/touch metric.”
2. “Read the new individual test brief and adapt the app from field ordering to the required mobile offline delivery-confirmation screen.”
3. “Make the README runnable in three literal commands and document the exact offline verification path and event shape.”

## At least three AI mistakes and how I found them

1. The first implementation solved the team task from Slack (placing orders) but not the individual test brief (confirming deliveries). I found this by comparing the screen flow against the new “Mobile” line in the rules and replaced the feature scope.
2. The first metric counted `itemCount + 1` as a touch count, which is only a proxy and not a real interaction trace. I found this by checking the requirement’s wording and removed that metric from the final mobile brief.
3. The first README described a sales-order payload and a future partner module. I found the mismatch during a literal three-command-readme check and rewrote it around delivery events.
4. The generated Expo project included a default starter screen that did not demonstrate offline behavior. I found this by running the project structure review and replaced `App.tsx` with the delivery flow.

## What I wrote by hand without AI

I chose the demo stops, Romanian labels, status vocabulary, event shape, and the airplane-mode verification path. These are product decisions rather than generated implementation details, and they make the prototype easy to compare against the brief.

## What I would do differently in the first 10 minutes

I would read the individual-test rules before building the team task, define the delivery event contract first, and create the five-commit plan before touching the UI. That would avoid building the earlier order flow and then changing the product direction.
