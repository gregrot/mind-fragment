import Phaser from "phaser";
import { GameScene } from "./GameScene";

new Phaser.Game({
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  parent: "root",
  backgroundColor: "#0b1020",
  scene: [GameScene]
});