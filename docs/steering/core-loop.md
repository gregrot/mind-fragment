# Core Experience Steering Notes

These notes capture the intended flow for the opening act and the layered play loops of the Mind Fragment project. They condense the earlier brainstorm into an ordered reference for narrative, mechanical, and pacing beats.

## Opening Sequence — “Crash, Boot, Consequence”

### Cold open (10–20 seconds, interactive)
- Planetary night. Your descent track is a smoking line across the map. You can *drag* a tiny reticle to steer the final seconds of the crash, nudging where the wreck ends up (this seeds your starting biome/resources).
- Impact. HUD blooms: **CORE INTEGRITY: 6%**, **CONNECTIONS: severed**, **LOCAL SAPIENCE: unknown**.

### First boot (UI voiceover + on-map prompts)
- “Hello me. I am… pieces.” The wreck is now your **Mind Fragment** (MF). The only direct input is a slow hover and a short-range **Ping**.
- **Goal 1: Power** — Ping reveals scattered **Capacitor Shards** and **Ferrous Debris**. You drag the MF to collect the first few bits manually (teaches movement + pickup radius).
- You discover a half-buried **Assembler Bay**—no power. Return shards to the wreck to light it. **Power Online → Assembler Booted**.

### First robot (guided build + first programme)
- Craft a **Chassis: Worker-M0** (1 slot each: Motor, Scanner). Modules determine the starting block palette.
- On craft, the **Blocks Panel** unfurls with a tiny tutorial “programme”:
  - `Start → Scan(Nearest: Scrap) → MoveTo(Target) → Collect() → Return(Home) → Deposit()`
- You don’t place code yet; the game places it for you, then immediately breaks it: the robot gets stuck behind a rock.
- You are taught the first edit: insert a conditional and a simple fail-safe loop:
  - `If PathBlocked() → TryStep(Around) (repeat 3) → Else Continue`
- Hit **Run**. Robot completes its first haul. Juice moment: a little fanfare, your power meter ticks up, new **Fabrication Recipe: Manipulator Arm** unlocks.

### Ethical hook (softly Culture-inspired)
- Your ping reveals **Curious Locals** (simple non-sapient for now) nesting near rich deposits. The robot’s default route stresses them (they scatter, knocking over nests and lowering your “Diplomacy/Discretion” meter).
- You’re offered two curated alternative programmes:
  1. **Fast** — Ignores locals, higher yield, raises detection/hostility.
  2. **Discreet** — Pathfinds around nests, lower yield, improves standing, unlocks social signal data later.
- Whichever you choose sets a light-touch playstyle flag (not permanent) and evokes “means vs ends” tension immediately.

### Act 0 exit condition (30–45 minutes)
- Rebuild **Uplink Mast**. To power it you must place 2–3 robots with different modules and programmes (harvest → refine → deliver).
- First **Contact Signal** goes out… and something answers (a territorial autonomous sentinel or rival salvager). That sets the first antagonist loop.

## Layered Core Loop

### Micro loop (seconds → minutes): “Write → Test → Watch”
1. **Plan** — Drop/edit a block programme for a robot (path, harvest, defend, haul, repair).
2. **Run** — Watch in-world execution; the MF can ping, tug, or apply **Overclock** (short boost, heat cost).
3. **Tweak** — Notice edge cases (stuck, hostile, weather). Insert conditionals, change priorities, or swap modules.
4. **Reward** — Resources delivered, power spikes, little “insight shards” unlock new blocks or block modifiers.

*Why it’s fun:* frequent “aha” moments; your code literally moves the world.

### Meso loop (10–30 minutes): “Build the Chain”
1. **Scout** new nodes (ore, flora, data relics) with lightweight drones.
2. **Craft Modules** to unlock block families (Motor → motion primitives; Scanner → detection/filters; Manipulator → interactors; Comms → coordination; Weapon/Shield → combat blocks; Logic Core → memory, loops, timers).
3. **Design Pipelines** — Worker A mines, Mule B hauls, Builder C constructs, Sentry D patrols. Programmes publish/subscribe via topics (“Depot-A/Need-Haul”).
4. **Stabilise** — Place **Debug Beacons** (area shows execution traces + timing) to fix bottlenecks/hangs.
5. **Incidents** — Weather surge, wildlife migration, rival patrol → you patch code or swap modules under pressure.

### Macro loop (hours): “Awaken the Mind”
1. **Gather Core Shards** to expand MF capacity (more concurrent robots, wider signal, faster compile).
2. **Territory & Reputation** — Outposts act as compilers/depots. Your “Discretion / Impact” axis gates story beats and faction reactions.
3. **Tech Web** — Not linear; each node unlocks a **block modifier** (e.g., `MoveTo` gains `AvoidBiome(type)`; `Scan` gains `TagWrite(key,value)`).
4. **Story Arcs**
   - **The Sentinel** — Defensive AI probing your footprint.
   - **The Nomads** — Strange locals you can stress, ignore, or protect.
   - **The Rival Salvager** — Industrial, aggressive; steals nodes unless counter-programmed.
5. **Milestones** — Reconstitute enough cognition to choose: extract and leave, stay and uplift/protect, or quietly dismantle threats.

## Early Progression (first 2–3 hours)

### Modules → Blocks you unlock (examples)
- **Motor Mk1:** `MoveTo`, `TryStep`, `Orbit(target,radius)`, `Follow(entity)`
- **Scanner Mk1:** `Scan(filter)`, `LineOfSight`, `TagRead`, `Detect(Hazard|Nest|Enemy)`
- **Manipulator Mk1:** `Collect`, `Deposit`, `Build(blueprint)`, `Repair(target)`
- **Comms Mk1:** `Broadcast(topic,payload)`, `Subscribe(topic)`, `Request("Haul", payload)`
- **Logic Core Mk1:** `If`, `Repeat(n)`, `Wait(t)`, `Remember(key,val)`, `Recall(key)`
- **Shield/Weapon Mk1:** `ThreatResponse(mode)`, `Stun`, `Guard(radius)`

### Key constraints that shape decisions
- **Programme RAM per chassis** (forces concise logic or module upgrades).
- **Energy & Heat** (Overclocking risks shutdowns).
- **Signal Fog** (bots out of range fall back to a `Failsafe` routine you define—teaches resilience planning).
- **Noise** (your operations footprint affects detection and ecology).

## Starter Quests (tight & teachy)
1. **Spark the Bay** — Gather 20 scrap, 5 shards; build Worker-M0; run first haul programme.
2. **Paths of Least Harm** — Reprogramme route to avoid nests (teach conditionals + scan filters).
3. **Chain Reaction** — Build a second bot to auto-haul to the Assembler while the first keeps mining (teach pub/sub topics).
4. **Soft Walls** — A weather front shifts terrain friction; insert a `Wait(weather<storm)` or `Reroute` block.
5. **First Intrusion** — A sentinel drone tests your perimeter; craft a **Sentry-M1** with `Guard` + `Stun`, but avoid lethal force (keeps Discretion high).

## Systems that make the loop sing
- **Programming-as-Loot:** Ruins drop **Block Modifiers** (e.g., `MoveTo` gains `Cost=Terrain`, enabling cheap pathfinding heuristics).
- **Field Breakpoints:** Place a **Debug Beacon**; within its radius you can step programmes, watch variable bubbles, and hot-patch for 20 seconds.
- **Compile Bay vs. Hotfix:** Full compile at bays (safe), or **Hotfix** inline (faster, adds heat + temporary instability).
- **Templates & Tricks:** Save programmes as cards (e.g., “Gentle Harvester”, “Relay Scout”), then slot them into new robots and tweak.
- **Ethical Pressure:** Optional contracts from locals/rival (“clear the nests” vs “relocate them”). Mechanics are identical; framing differs; rewards reflect stance.
- **Bossy Puzzles:** The Rival Salvager is essentially a scripted bot swarm with visible logic tells—you beat them by reading and counter-programming their routines.

## Sample Script (opening beats, in-voice)
- **MF:** “Boot… fractionally successful. I am… me-ish.”
- **System:** *Power low. Assembler offline. Locals: unclassified.*
- **MF (tooltips):** “Drag me. Yes, I’m the pretty crater.”
- **On first scrap delivered:** “Assembler hum achieved. That sound? Progress.”
- **On first programme run:** “Look at them go. I made a friend. It obeys!”
- **On nest disturbance:** “Ah. Consequences. Let’s be better than my first idea.”
- **On Uplink Mast online:** “Signal whispering across a dark sky. I hope only the right ears are listening.”

## Win/Fail Rhythm
- **Fail forward:** If MF integrity hits 0, you don’t “die”; you drop to **Safe Mode** and must dispatch a **Repairer** with a micro-programme using the limited **Failsafe Palette** you defined earlier.
- **Session arcs:** 20–40 minute “objective slices” (power a bay, secure a node, uplift a hamlet, repel an incursion). Every slice ends with a clean save plus a new block/modifier tease.
