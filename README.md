# BlockKit Game - Phaser + TypeScript Game Skeleton

This is a minimal game skeleton implementing the Phaser + TypeScript integration from the BlockKit TS starter package documentation.

## Features

- **Phaser 3** game engine with TypeScript
- **Entity-Component System** with world management
- **Block-based programming runtime** integration
- **Modular system** for unlocking block types
- **Simple AI behavior** with scrap collection example

## Structure

```
game/
├── src/
│   ├── main.ts                    # Phaser game entry point
│   ├── GameScene.ts               # Main game scene
│   ├── world/
│   │   ├── components.ts          # Entity component definitions
│   │   ├── world.ts               # World database and entity management
│   │   ├── systems.ts             # Game systems (motion, etc.)
│   │   └── worldApi.ts            # World interaction API
│   ├── content/
│   │   ├── modules.ts             # Module definitions and unlocks
│   │   └── blocksCatalog.ts       # Available block types
│   └── runtime/
│       └── programRuntime.ts      # Block program execution runtime
├── index.html                     # Game HTML container
└── package.json                   # Dependencies and scripts
```

## Running the Game

```bash
npm install
npm run dev
```

The game will start at `http://localhost:3001` and show:
- A blue robot that can collect brown scrap pieces
- Simple AI behavior using block-based programming
- Entity-component system with motion and inventory

## Game Mechanics

- **Robot**: Blue sprite with motor, scanner, and manipulator modules
- **Scrap**: Brown collectible items scattered around the world
- **AI Program**: Block-based program that finds nearest scrap, moves to it, and picks it up
- **Modules**: Determine which block types the robot can use

## Next Steps

- Implement proper block program stepping with frame budgets
- Add visual block editor integration
- Create more complex AI behaviors
- Add more entity types and interactions
- Implement proper sprite assets