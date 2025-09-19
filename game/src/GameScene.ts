import Phaser from "phaser";
import type { Entity } from "./world/components";
import { world } from "./world/world";
import { motionSystem } from "./world/systems";
import { startProgram } from "./runtime/programRuntime";

type QuestStage = "collect_scrap" | "deliver_scrap" | "assembler_online";

interface QuestState {
  stage: QuestStage;
  targetScrap: number;
  delivered: number;
  recharged: boolean;
}

export class GameScene extends Phaser.Scene {
  private quest: QuestState = { stage: "collect_scrap", targetScrap: 5, delivered: 0, recharged: false };
  private promptText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private energyText!: Phaser.GameObjects.Text;
  private mind!: Entity;
  private assembler!: Entity;
  private robot!: Entity;

  constructor() { super("game"); }

  preload() {
    this.load.image("scrap", "assets/scrap.svg");
    this.load.image("bot", "assets/bot.svg");
  }

  create() {
    world.reset();
    this.quest = { stage: "collect_scrap", targetScrap: 5, delivered: 0, recharged: false };

    this.promptText = this.add.text(18, 18, "", {
      fontFamily: "monospace",
      fontSize: "18px",
      color: "#ffffff",
      wordWrap: { width: 360 }
    });
    this.progressText = this.add.text(18, 62, "", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#ffd966"
    });
    this.energyText = this.add.text(18, 90, "", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#9fffb7"
    });

    const scrapCenter = { x: 260, y: 320 };
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 30 + Math.random() * 40;
      const x = scrapCenter.x + Math.cos(angle) * radius;
      const y = scrapCenter.y + Math.sin(angle) * radius;
      const sprite = this.add.sprite(x, y, "scrap");
      sprite.setTint(0x8b4513);
      sprite.setScale(4);
      world.create({ x, y, sprite, tags: ["scrap"], role: "scrap" });
    }

    const mindSprite = this.add.sprite(520, 300, "bot");
    mindSprite.setTint(0xffe27a);
    mindSprite.setScale(6.5);
    this.mind = world.create({
      name: "Mind Fragment",
      x: mindSprite.x,
      y: mindSprite.y,
      sprite: mindSprite,
      role: "mind",
      tags: ["mind"],
      cur: 1,
      cap: 6,
      items: {}
    });

    const assemblerSprite = this.add.sprite(520, 380, "scrap");
    assemblerSprite.setTint(0x6c6c6c);
    assemblerSprite.setScale(5.5);
    this.assembler = world.create({
      name: "Assembler Bay",
      x: assemblerSprite.x,
      y: assemblerSprite.y,
      sprite: assemblerSprite,
      role: "assembler",
      tags: ["structure"],
      requires: { scrap: this.quest.targetScrap },
      items: {}
    });

    const botSprite = this.add.sprite(180, 320, "bot");
    botSprite.setTint(0x4169e1);
    botSprite.setScale(6);
    this.robot = world.create({
      name: "Harvester 1",
      x: botSprite.x,
      y: botSprite.y,
      vx: 0,
      vy: 0,
      max: 60,
      sprite: botSprite,
      list: ["motor", "scanner", "manip"],
      items: {},
      running: false,
      ast: null,
      role: "robot",
      tags: ["robot"]
    });

    this.robot.ast = {
      heads: ["h"],
      nodes: {
        h: { id: "h", kind: "event.whenStarted", form: "hat", slotHeads: { DO: "loop" } },
        loop: { id: "loop", kind: "control.repeat", form: "c", config: { times: 9999 }, slotHeads: { DO: "find" } },
        find: { id: "find", kind: "sense.findNearest", form: "statement", next: "moveScrap", config: { tag: "scrap" } },
        moveScrap: {
          id: "moveScrap",
          kind: "motion.moveTo",
          form: "statement",
          next: "pickup",
          inputs: { target: { blockId: "last" } }
        },
        last: { id: "last", kind: "sense.lastResult", form: "reporter" },
        pickup: { id: "pickup", kind: "manip.pickup", form: "statement", next: "moveAssembler" },
        moveAssembler: {
          id: "moveAssembler",
          kind: "motion.moveTo",
          form: "statement",
          next: "deposit",
          config: { targetRole: "assembler" }
        },
        deposit: {
          id: "deposit",
          kind: "manip.deposit",
          form: "statement",
          config: { targetRole: "assembler" },
          next: "find"
        }
      }
    };

    startProgram(this.robot, this.robot.ast as any);
    this.updateQuestTexts();
  }

  update(_t: number, dtMs: number) {
    const dt = dtMs / 1000;
    motionSystem(dt);
    this.advanceQuestState();
    this.updateQuestTexts();
  }

  private advanceQuestState() {
    const remaining = this.assembler.requires?.scrap ?? this.quest.targetScrap;
    const delivered = this.quest.targetScrap - remaining;
    this.quest.delivered = Math.max(0, delivered);

    if (this.quest.stage === "collect_scrap" && delivered > 0) {
      this.quest.stage = "deliver_scrap";
    }

    if (remaining <= 0 && this.quest.stage !== "assembler_online") {
      this.quest.stage = "assembler_online";
      if (!this.quest.recharged) {
        const gain = 3;
        if (typeof this.mind.cur === "number") {
          const cap = this.mind.cap ?? this.mind.cur;
          this.mind.cur = Math.min(cap, this.mind.cur + gain);
        }
        this.quest.recharged = true;
        this.assembler.sprite?.setTint(0x66ff99);
        this.tweens.add({
          targets: this.assembler.sprite,
          duration: 400,
          ease: "Sine.easeInOut",
          yoyo: true,
          repeat: 2,
          scaleX: 6,
          scaleY: 6
        });
      }
    }
  }

  private updateQuestTexts() {
    this.promptText.setText(this.promptForStage());
    const remaining = this.assembler.requires?.scrap ?? this.quest.targetScrap;
    const delivered = Math.min(this.quest.targetScrap, this.quest.targetScrap - remaining);
    this.progressText.setText(`Assembler intake: ${delivered}/${this.quest.targetScrap} scrap`);
    const cur = this.mind.cur ?? 0;
    const cap = this.mind.cap ?? cur;
    this.energyText.setText(`Mind power: ${cur}/${cap}`);
  }

  private promptForStage() {
    switch (this.quest.stage) {
      case "collect_scrap":
        return "Ping the crash site. Guide Harvester 1 to scoop up nearby scrap.";
      case "deliver_scrap":
        return "Route the cargo back. Feed the Assembler Bay until it hums to life.";
      case "assembler_online":
      default:
        return "Assembler hum achieved. The Mind Fragment sips fresh power.";
    }
  }
}