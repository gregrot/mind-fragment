import Phaser from "phaser";
import { world } from "./world/world";
import { motionSystem } from "./world/systems";
import { startProgram } from "./runtime/programRuntime";

export class GameScene extends Phaser.Scene {
  constructor() { super("game"); }

  preload() {
    // Load sprite assets
    this.load.image("scrap", "/assets/scrap.svg");
    this.load.image("bot", "/assets/bot.svg");
  }

  create() {
    // Spawn a pile of scrap
    for (let i=0;i<12;i++) {
      const x = 200 + Math.random()*400, y = 200 + Math.random()*240;
      const sprite = this.add.sprite(x,y,"scrap");
      sprite.setTint(0x8B4513); // Brown color for scrap
      sprite.setScale(4); // Make it bigger
      world.create({ x, y, sprite, tags: ["scrap"] });
    }

    // Spawn a robot with motor+scanner
    const botSprite = this.add.sprite(100,100,"bot");
    botSprite.setTint(0x4169E1); // Blue color for bot
    botSprite.setScale(6); // Make it bigger
    const robot = world.create({ 
      name: "Harvester 1", 
      x: 100, 
      y: 100, 
      vx: 0, 
      vy: 0, 
      max: 60, 
      sprite: botSprite, 
      list: ["motor","scanner","manip"], 
      items: {}, 
      running: false, 
      ast: null 
    });

    // Minimal program AST: whenStarted -> forever repeat: findNearest scrap; moveTo lastResult; pickup; (loop)
    robot.ast = {
      heads: ["h"],
      nodes: {
        h: { id:"h", kind:"event.whenStarted", form:"hat", slotHeads:{ DO: "r" } },
        r: { id:"r", kind:"control.repeat", form:"c", config:{ times: 9999 }, slotHeads:{ DO: "s1" } },
        s1:{ id:"s1", kind:"sense.findNearest", form:"statement", next:"s2", config:{ tag:"scrap" } },
        s2:{ id:"s2", kind:"motion.moveTo", form:"statement", next:"s3", inputs:{ target:{ blockId:"rr" } } },
        rr:{ id:"rr", kind:"sense.lastResult", form:"reporter" },
        s3:{ id:"s3", kind:"manip.pickup", form:"statement", next:"s1" }
      }
    };

    startProgram(robot, robot.ast as any);
  }

  update(_t: number, dtMs: number) {
    const dt = dtMs / 1000;
    motionSystem(dt);
    // stepPrograms(dt) — wire in once your interpreter supports stepping per frame
  }
}