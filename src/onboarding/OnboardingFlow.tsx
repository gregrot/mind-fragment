import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import CrashLandingStep from './CrashLandingStep';
import ScrapCollectionStep from './ScrapCollectionStep';
import { createBlockInstance } from '../blocks/library';
import type { BlockInstance, WorkspaceState } from '../types/blocks';
import styles from '../styles/OnboardingFlow.module.css';

type OnboardingStep =
  | 'crash'
  | 'boot'
  | 'collect'
  | 'assembler'
  | 'worker'
  | 'conditional'
  | 'celebration'
  | 'ethics'
  | 'epilogue'
  | 'dismissed';

type EthicsChoice = 'fast' | 'discreet';

interface OnboardingFlowProps {
  replaceWorkspace: Dispatch<SetStateAction<WorkspaceState>>;
  openProgrammingOverlay: () => void;
}

const buildWorkerProgramme = (): WorkspaceState => {
  const start = createBlockInstance('start');
  const scan = createBlockInstance('scan-resources');
  const move = createBlockInstance('move');
  const gather = createBlockInstance('gather-resource');
  const returnHome = createBlockInstance('return-home');
  const deposit = createBlockInstance('deposit-cargo');

  start.slots!.do = [scan, move, gather, returnHome, deposit];
  return [start];
};

const createAvoidanceConditional = (): BlockInstance => {
  const conditional = createBlockInstance('if');
  const turn = createBlockInstance('turn');
  const sidestep = createBlockInstance('repeat');
  const sidestepMove = createBlockInstance('move');
  const exitTurn = createBlockInstance('turn');
  const resumeMove = createBlockInstance('move');

  sidestep.slots!.do = [sidestepMove];
  conditional.slots!.then = [turn, sidestep, exitTurn, resumeMove];
  conditional.slots!.else = [];

  return conditional;
};

const applyAvoidanceConditional = (workspace: WorkspaceState): WorkspaceState => {
  let inserted = false;

  const next = workspace.map((block) => {
    if (block.type !== 'start' || !block.slots?.do || inserted) {
      return block;
    }

    const sequence = block.slots.do;
    if (sequence.some((child) => child.type === 'if')) {
      inserted = true;
      return block;
    }

    const gatherIndex = sequence.findIndex((child) => child.type === 'gather-resource');
    const conditional = createAvoidanceConditional();
    const updatedSequence = [...sequence];

    if (gatherIndex >= 0) {
      updatedSequence.splice(gatherIndex, 0, conditional);
    } else {
      updatedSequence.push(conditional);
    }

    inserted = true;
    return {
      ...block,
      slots: {
        ...block.slots,
        do: updatedSequence,
      },
    };
  });

  return inserted ? next : workspace;
};

const buildChoiceProgramme = (choice: EthicsChoice): WorkspaceState => {
  const start = createBlockInstance('start');

  if (choice === 'fast') {
    const scan = createBlockInstance('scan-resources');
    const moveOne = createBlockInstance('move');
    const moveTwo = createBlockInstance('move');
    const gather = createBlockInstance('gather-resource');
    const sprint = createBlockInstance('repeat');
    const returnHome = createBlockInstance('return-home');
    const deposit = createBlockInstance('deposit-cargo');

    sprint.slots!.do = [createBlockInstance('move')];
    start.slots!.do = [scan, moveOne, moveTwo, gather, sprint, returnHome, deposit];
  } else {
    const scan = createBlockInstance('scan-resources');
    const cautiousTurn = createBlockInstance('turn');
    const creep = createBlockInstance('move');
    const lookout = createAvoidanceConditional();
    const gather = createBlockInstance('gather-resource');
    const returnHome = createBlockInstance('return-home');
    const deposit = createBlockInstance('deposit-cargo');
    const pause = createBlockInstance('wait');

    start.slots!.do = [scan, cautiousTurn, creep, lookout, gather, returnHome, deposit, pause];
  }

  return [start];
};

const isTestMode = import.meta.env.MODE === 'test';

const OnboardingFlow = ({ replaceWorkspace, openProgrammingOverlay }: OnboardingFlowProps): JSX.Element | null => {
  const [step, setStep] = useState<OnboardingStep>('crash');
  const [choice, setChoice] = useState<EthicsChoice | null>(null);

  useEffect(() => {
    if (step === 'worker') {
      replaceWorkspace(() => buildWorkerProgramme());
    }
  }, [step, replaceWorkspace]);

  useEffect(() => {
    if (step === 'conditional') {
      openProgrammingOverlay();
    }
  }, [step, openProgrammingOverlay]);

  const handleCrashComplete = useCallback(() => {
    setStep('boot');
  }, []);

  const handleBootContinue = useCallback(() => {
    setStep('collect');
  }, []);

  const handleScrapComplete = useCallback(() => {
    setStep('assembler');
  }, []);

  const handleAssemblerContinue = useCallback(() => {
    setStep('worker');
  }, []);

  const handleWorkerContinue = useCallback(() => {
    setStep('conditional');
  }, []);

  const handleInsertConditional = useCallback(() => {
    replaceWorkspace((current) => applyAvoidanceConditional(current));
    setStep('celebration');
  }, [replaceWorkspace]);

  const handleCelebrateContinue = useCallback(() => {
    setStep('ethics');
  }, []);

  const handleSelectChoice = useCallback(
    (selection: EthicsChoice) => {
      setChoice(selection);
      replaceWorkspace(() => buildChoiceProgramme(selection));
      setStep('epilogue');
    },
    [replaceWorkspace],
  );

  const handleDismiss = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('mf.skipOnboarding', '1');
      } catch (error) {
        console.warn('Failed to persist onboarding skip preference', error);
      }
    }
    setStep('dismissed');
  }, []);

  useEffect(() => {
    if (isTestMode) {
      setStep('dismissed');
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    try {
      if (window.localStorage.getItem('mf.skipOnboarding') === '1') {
        setStep('dismissed');
        return;
      }
    } catch (error) {
      console.warn('Failed to read onboarding skip flag from storage', error);
    }

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('skipOnboarding') === '1') {
        setStep('dismissed');
      }
    } catch (error) {
      console.warn('Failed to inspect onboarding skip query parameter', error);
    }
  }, []);

  const panelClassName = useMemo(() => {
    const base = [styles.overlay];
    if (step === 'crash' || step === 'collect') {
      base.push(styles.overlayInteractive);
    }
    return base.join(' ');
  }, [step]);

  if (step === 'dismissed') {
    return null;
  }

  let content: JSX.Element | null = null;

  switch (step) {
    case 'crash':
      content = <CrashLandingStep onComplete={handleCrashComplete} />;
      break;
    case 'collect':
      content = <ScrapCollectionStep onComplete={handleScrapComplete} />;
      break;
    case 'boot':
      content = (
        <div className={styles.card}>
          <p className={styles.kicker}>Boot Sequence — Mind Fragment</p>
          <h3 className={styles.heading}>Hello me. I am… pieces.</h3>
          <p className={styles.body}>
            Diagnostics whisper: power near zero, assembler dormant, local sapience unknown. Hover slowly, draw in the shards we
            can reach, and breathe life back into our core.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={handleBootContinue}>
              Begin scavenging
            </button>
          </div>
        </div>
      );
      break;
    case 'assembler':
      content = (
        <div className={styles.card}>
          <p className={styles.kicker}>Assembler Bay</p>
          <h3 className={styles.heading}>Power routing successful</h3>
          <p className={styles.body}>
            Capacitors hum and the bay doors creak apart. Fabrication queue primed for Worker-M0 — a chassis with just enough
            motor and scanner to fetch more scrap than we ever could alone.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={handleAssemblerContinue}>
              Fabricate Worker-M0
            </button>
          </div>
        </div>
      );
      break;
    case 'worker':
      content = (
        <div className={styles.card}>
          <p className={styles.kicker}>Worker-M0 Online</p>
          <h3 className={styles.heading}>Tutorial routine loaded</h3>
          <p className={styles.body}>
            The console staged a first haul programme: scan for scrap, move, collect, return, deposit. Elegant enough — until the
            chassis noses straight into the wreckage ridge. Time to intervene.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={handleWorkerContinue}>
              Open programming console
            </button>
          </div>
        </div>
      );
      break;
    case 'conditional':
      content = (
        <div className={styles.card}>
          <p className={styles.kicker}>First Edit</p>
          <h3 className={styles.heading}>Insert the avoidance conditional</h3>
          <p className={styles.body}>
            Drop the prepared conditional before the Gather block. Its side-steps will route around the obstructing rock three
            times before continuing. Watch the branches light up in the editor as soon as it lands.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={handleInsertConditional}>
              Insert conditional
            </button>
          </div>
        </div>
      );
      break;
    case 'celebration':
      content = (
        <div className={styles.card}>
          <p className={styles.kicker}>First Haul Complete</p>
          <h3 className={styles.heading}>Look at them go. We made a friend.</h3>
          <p className={styles.body}>
            Worker-M0 skirts the ridge, bags the scrap, and deposits it into the assembler stores. Power meter spikes. New
            fabrication recipe unlocked: Manipulator Arm — ready when we are.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={handleCelebrateContinue}>
              Continue
            </button>
          </div>
        </div>
      );
      break;
    case 'ethics':
      content = (
        <div className={`${styles.card} ${styles.choiceCard}`}>
          <p className={styles.kicker}>Route Calibration</p>
          <h3 className={styles.heading}>Fast or discreet?</h3>
          <p className={styles.body}>
            The scanner pings curious locals nesting near the rich deposits. Two curated routines are ready — each a different
            answer to “how loud do we arrive?”
          </p>
          <div className={styles.choiceGrid}>
            <button type="button" className={styles.choice} onClick={() => handleSelectChoice('fast')}>
              <span className={styles.choiceTitle}>Fast Route</span>
              <span className={styles.choiceCopy}>
                Ignores the nests, doubles down on throughput, risks spooking the locals. Raises detection but stocks the
                assembler quickly.
              </span>
            </button>
            <button type="button" className={styles.choice} onClick={() => handleSelectChoice('discreet')}>
              <span className={styles.choiceTitle}>Discreet Route</span>
              <span className={styles.choiceCopy}>
                Threads a quiet loop around the nests. Slower gains, calmer neighbours. Sets us up for future social signal reads.
              </span>
            </button>
          </div>
        </div>
      );
      break;
    case 'epilogue': {
      const selectionLabel = choice === 'fast' ? 'fast, noisy haul' : 'discreet, careful path';
      content = (
        <div className={styles.card}>
          <p className={styles.kicker}>Objective Updated</p>
          <h3 className={styles.heading}>Uplink Mast awaits</h3>
          <p className={styles.body}>
            Route locked: {selectionLabel}. Keep refining routines, raise the mast, and see who hears our first call. Act 0 is in
            motion.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={handleDismiss}>
              Back to operations
            </button>
          </div>
        </div>
      );
      break;
    }
    default:
      content = null;
  }

  return <div className={panelClassName}>{content}</div>;
};

export default OnboardingFlow;
