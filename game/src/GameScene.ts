import Phaser from "phaser";
import type { EntityId } from "./world/components";
import {
  Energy,
  Identity,
  Inventory,
  Modules,
  Position,
  Program as ProgramComponent,
  Requirements,
  Role,
  Sprite,
  Tags,
  Velocity
} from "./world/components";
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
  private mind!: EntityId;
  private assembler!: EntityId;
  private robot!: EntityId;

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
      const scrap = world.create();
      world.add(scrap, Position, { x, y });
      world.add(scrap, Sprite, { sprite });
      world.add(scrap, Tags, ["scrap"]);
      world.add(scrap, Role, "scrap");
    }

    const mindSprite = this.add.sprite(520, 300, "bot");
    mindSprite.setTint(0xffe27a);
    mindSprite.setScale(6.5);
    this.mind = world.create();
    world.add(this.mind, Identity, { name: "Mind Fragment" });
    world.add(this.mind, Position, { x: mindSprite.x, y: mindSprite.y });
    world.add(this.mind, Sprite, { sprite: mindSprite });
    world.add(this.mind, Role, "mind");
    world.add(this.mind, Tags, ["mind"]);
    world.add(this.mind, Energy, { cur: 1, cap: 6 });
    world.add(this.mind, Inventory, {});

    const assemblerSprite = this.add.sprite(520, 380, "scrap");
    assemblerSprite.setTint(0x6c6c6c);
    assemblerSprite.setScale(5.5);
    this.assembler = world.create();
    world.add(this.assembler, Identity, { name: "Assembler Bay" });
    world.add(this.assembler, Position, { x: assemblerSprite.x, y: assemblerSprite.y });
    world.add(this.assembler, Sprite, { sprite: assemblerSprite });
    world.add(this.assembler, Role, "assembler");
    world.add(this.assembler, Tags, ["structure"]);
    world.add(this.assembler, Requirements, { scrap: this.quest.targetScrap });
    world.add(this.assembler, Inventory, {});

    const botSprite = this.add.sprite(180, 320, "bot");
    botSprite.setTint(0x4169e1);
    botSprite.setScale(6);
    this.robot = world.create();
    world.add(this.robot, Identity, { name: "Harvester 1" });
    world.add(this.robot, Position, { x: botSprite.x, y: botSprite.y });
    world.add(this.robot, Velocity, { vx: 0, vy: 0, max: 60 });
    world.add(this.robot, Sprite, { sprite: botSprite });
    world.add(this.robot, Modules, { list: ["motor", "scanner", "manip"] });
    world.add(this.robot, Inventory, {});
    world.add(this.robot, ProgramComponent, { ast: null, running: false, budget: 0 });
    world.add(this.robot, Role, "robot");
    world.add(this.robot, Tags, ["robot"]);

    const program = world.get(this.robot, ProgramComponent);
    if (program) {
      program.ast = {
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
      startProgram(this.robot, program.ast as any);
    }

    this.updateQuestTexts();
  }

  update(_t: number, dtMs: number) {
    const dt = dtMs / 1000;
    motionSystem(dt);
    this.advanceQuestState();
    this.updateQuestTexts();
  }

  private advanceQuestState() {
    const remaining = world.get(this.assembler, Requirements)?.scrap ?? this.quest.targetScrap;
    const delivered = this.quest.targetScrap - remaining;
    this.quest.delivered = Math.max(0, delivered);

    if (this.quest.stage === "collect_scrap" && delivered > 0) {
      this.quest.stage = "deliver_scrap";
    }

    if (remaining <= 0 && this.quest.stage !== "assembler_online") {
      this.quest.stage = "assembler_online";
      if (!this.quest.recharged) {
        const gain = 3;
        const energy = world.get(this.mind, Energy);
        if (energy) {
          const cap = energy.cap ?? energy.cur;
          energy.cur = Math.min(cap, energy.cur + gain);
        }
        this.quest.recharged = true;
        const assemblerSprite = world.get(this.assembler, Sprite)?.sprite;
        assemblerSprite?.setTint(0x66ff99);
        if (assemblerSprite) {
          this.tweens.add({
            targets: assemblerSprite,
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
  }

  private updateQuestTexts() {
    this.promptText.setText(this.promptForStage());
    const remaining = world.get(this.assembler, Requirements)?.scrap ?? this.quest.targetScrap;
    const delivered = Math.min(this.quest.targetScrap, this.quest.targetScrap - remaining);
    this.progressText.setText(`Assembler intake: ${delivered}/${this.quest.targetScrap} scrap`);
    const energy = world.get(this.mind, Energy);
    const cur = energy?.cur ?? 0;
    const cap = energy?.cap ?? cur;
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
