import { createBlockInstance } from './library';
import type { BlockInstance, WorkspaceState } from '../types/blocks';
import { DEFAULT_STARTUP_PROGRAM } from '../simulation/runtime/defaultProgram';

const ensureParameters = (block: BlockInstance): NonNullable<BlockInstance['parameters']> => {
  if (!block.parameters) {
    block.parameters = {};
  }
  return block.parameters;
};

const setBooleanParameter = (block: BlockInstance, parameterName: string, value: boolean): void => {
  const parameters = ensureParameters(block);
  parameters[parameterName] = { kind: 'boolean', value };

  const expressions = block.expressionInputs?.[parameterName] ?? [];
  for (const expression of expressions) {
    if (expression.type !== 'literal-boolean') {
      continue;
    }
    expression.parameters = {
      ...(expression.parameters ?? {}),
      value: { kind: 'boolean', value },
    };
  }
};

const setNumberParameter = (block: BlockInstance, parameterName: string, value: number): void => {
  const parameters = ensureParameters(block);
  parameters[parameterName] = { kind: 'number', value };

  const expressions = block.expressionInputs?.[parameterName] ?? [];
  for (const expression of expressions) {
    if (expression.type !== 'literal-number') {
      continue;
    }
    expression.parameters = {
      ...(expression.parameters ?? {}),
      value: { kind: 'number', value },
    };
  }
};

const setStringParameter = (block: BlockInstance, parameterName: string, value: string): void => {
  const parameters = ensureParameters(block);
  parameters[parameterName] = { kind: 'string', value };
};

const cloneDefaultStartupLoop = () => {
  const loopInstruction = DEFAULT_STARTUP_PROGRAM.instructions.find(
    (instruction): instruction is Extract<typeof instruction, { kind: 'loop'; mode: 'forever' }> =>
      instruction.kind === 'loop' && instruction.mode === 'forever',
  );

  if (!loopInstruction) {
    return null;
  }

  const instructions = loopInstruction.instructions;

  const scanInstruction = instructions[0];
  const moveToTreeInstruction = instructions[1];
  const settleInstruction = instructions[2];
  const useItemInstruction = instructions[3];
  const gatherInstruction = instructions[4];
  const returnInstruction = instructions[5];
  const depositInstruction = instructions[6];
  const secondaryMoveInstruction = instructions[7];
  const pauseInstruction = instructions[8];

  const scan = createBlockInstance('scan-resources');
  scan.instanceId = scanInstruction?.sourceBlockId ?? 'default-startup-scan-for-trees';

  const moveToTree = createBlockInstance('move-to');
  moveToTree.instanceId = moveToTreeInstruction?.sourceBlockId ?? 'default-startup-move-to-tree';
  if (moveToTreeInstruction?.kind === 'move-to') {
    const speedValue = moveToTreeInstruction.speed.literal?.value ?? 80;
    const useScanValue = moveToTreeInstruction.target.useScanHit.literal?.value ?? true;
    const scanHitIndexValue = moveToTreeInstruction.target.scanHitIndex.literal?.value ?? 1;
    const fallbackX = moveToTreeInstruction.target.literalPosition.x.literal?.value ?? 0;
    const fallbackY = moveToTreeInstruction.target.literalPosition.y.literal?.value ?? 0;

    setNumberParameter(moveToTree, 'speed', speedValue);
    setBooleanParameter(moveToTree, 'useScanHit', useScanValue);
    setNumberParameter(moveToTree, 'scanHitIndex', scanHitIndexValue);
    setNumberParameter(moveToTree, 'targetX', fallbackX);
    setNumberParameter(moveToTree, 'targetY', fallbackY);
  }

  const settleWait = createBlockInstance('wait');
  settleWait.instanceId = settleInstruction?.sourceBlockId ?? 'default-startup-settle-before-chop';

  const useItem = createBlockInstance('use-item-slot');
  useItem.instanceId = useItemInstruction?.sourceBlockId ?? 'default-startup-chop-tree';
  if (useItemInstruction?.kind === 'use-item') {
    const slotIndexValue = useItemInstruction.slot.index.literal?.value ?? 1;
    const slotLabelValue = useItemInstruction.slot.label.value ?? 'Primary Tool';
    const useScanValue = useItemInstruction.target.useScanHit.literal?.value ?? true;
    const scanHitIndexValue = useItemInstruction.target.scanHitIndex.literal?.value ?? 1;
    const fallbackX = useItemInstruction.target.literalPosition.x.literal?.value ?? 0;
    const fallbackY = useItemInstruction.target.literalPosition.y.literal?.value ?? 0;

    setNumberParameter(useItem, 'slotIndex', slotIndexValue);
    setStringParameter(useItem, 'slotLabel', slotLabelValue);
    setBooleanParameter(useItem, 'useScanHit', useScanValue);
    setNumberParameter(useItem, 'scanHitIndex', scanHitIndexValue);
    setNumberParameter(useItem, 'targetX', fallbackX);
    setNumberParameter(useItem, 'targetY', fallbackY);
  }

  const gather = createBlockInstance('gather-resource');
  gather.instanceId = gatherInstruction?.sourceBlockId ?? 'default-startup-gather-logs';

  const returnMove = createBlockInstance('move-to');
  returnMove.instanceId = returnInstruction?.sourceBlockId ?? 'default-startup-return-to-origin';
  if (returnInstruction?.kind === 'move-to') {
    const speedValue = returnInstruction.speed.literal?.value ?? 80;
    const useScanValue = returnInstruction.target.useScanHit.literal?.value ?? false;
    const scanHitIndexValue = returnInstruction.target.scanHitIndex.literal?.value ?? 1;
    const fallbackX = returnInstruction.target.literalPosition.x.literal?.value ?? 0;
    const fallbackY = returnInstruction.target.literalPosition.y.literal?.value ?? 0;

    setNumberParameter(returnMove, 'speed', speedValue);
    setBooleanParameter(returnMove, 'useScanHit', useScanValue);
    setNumberParameter(returnMove, 'scanHitIndex', scanHitIndexValue);
    setNumberParameter(returnMove, 'targetX', fallbackX);
    setNumberParameter(returnMove, 'targetY', fallbackY);
  }

  const deposit = createBlockInstance('deposit-cargo');
  deposit.instanceId = depositInstruction?.sourceBlockId ?? 'default-startup-deposit-cargo';

  const secondaryMove = createBlockInstance('move-to');
  secondaryMove.instanceId = secondaryMoveInstruction?.sourceBlockId ?? 'default-startup-move-to-secondary-tree';
  if (secondaryMoveInstruction?.kind === 'move-to') {
    const speedValue = secondaryMoveInstruction.speed.literal?.value ?? 80;
    const useScanValue = secondaryMoveInstruction.target.useScanHit.literal?.value ?? false;
    const scanHitIndexValue = secondaryMoveInstruction.target.scanHitIndex.literal?.value ?? 1;
    const fallbackX = secondaryMoveInstruction.target.literalPosition.x.literal?.value ?? 0;
    const fallbackY = secondaryMoveInstruction.target.literalPosition.y.literal?.value ?? 0;

    setNumberParameter(secondaryMove, 'speed', speedValue);
    setBooleanParameter(secondaryMove, 'useScanHit', useScanValue);
    setNumberParameter(secondaryMove, 'scanHitIndex', scanHitIndexValue);
    setNumberParameter(secondaryMove, 'targetX', fallbackX);
    setNumberParameter(secondaryMove, 'targetY', fallbackY);
  }

  const loopPause = createBlockInstance('wait');
  loopPause.instanceId = pauseInstruction?.sourceBlockId ?? 'default-startup-loop-pause';

  return {
    loopId: loopInstruction.sourceBlockId,
    blocks: [
      scan,
      moveToTree,
      settleWait,
      useItem,
      gather,
      returnMove,
      deposit,
      secondaryMove,
      loopPause,
    ],
  } as const;
};

export const createDefaultStartupWorkspace = (): WorkspaceState => {
  const start = createBlockInstance('start');
  start.instanceId = 'default-startup-when-started';

  const loop = cloneDefaultStartupLoop();

  if (!loop) {
    start.slots = { ...(start.slots ?? {}), do: [] };
    return [start];
  }

  const forever = createBlockInstance('forever');
  forever.instanceId = loop.loopId ?? 'default-startup-harvest-loop';
  forever.slots = { ...(forever.slots ?? {}), do: [...loop.blocks] };

  start.slots = { ...(start.slots ?? {}), do: [forever] };

  return [start];
};

