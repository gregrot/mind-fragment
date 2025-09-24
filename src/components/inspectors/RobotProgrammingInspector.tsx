import RobotProgrammingPanel from '../RobotProgrammingPanel';
import type { InspectorProps } from '../../overlay/inspectorRegistry';
import { useProgrammingInspector } from '../../state/ProgrammingInspectorContext';

const RobotProgrammingInspector = ({ onClose }: InspectorProps): JSX.Element => {
  const { workspace, onDrop, onTouchDrop, onUpdateBlock, onRemoveBlock, robotId } =
    useProgrammingInspector();

  return (
    <RobotProgrammingPanel
      workspace={workspace}
      onDrop={onDrop}
      onTouchDrop={onTouchDrop}
      onUpdateBlock={onUpdateBlock}
      onRemoveBlock={onRemoveBlock}
      onClose={onClose}
      onConfirm={onClose}
      robotId={robotId}
    />
  );
};

export default RobotProgrammingInspector;
