import { editEngine } from '../engine/EditEngine';
import {
  RestoreEditorSnapshotCommand,
  takeEditorSnapshot,
  type EditorSnapshot,
} from '../engine/commands';
import { trimEngine } from '../engine/TrimEngine';

function snapshotsEqual(left: EditorSnapshot, right: EditorSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function subscribeTrimHistoryToEditEngine(): () => void {
  let beforeSnapshot: EditorSnapshot | null = null;

  const resetSession = () => {
    beforeSnapshot = null;
  };

  const unsubscribeEnter = trimEngine.on('enter', () => {
    beforeSnapshot = takeEditorSnapshot();
  });

  const unsubscribeExit = trimEngine.on('exit', () => {
    if (!beforeSnapshot) {
      resetSession();
      return;
    }

    const afterSnapshot = takeEditorSnapshot();
    if (!snapshotsEqual(beforeSnapshot, afterSnapshot)) {
      editEngine.execute(
        new RestoreEditorSnapshotCommand(beforeSnapshot, afterSnapshot, 'Trim session'),
      );
    }

    resetSession();
  });

  return () => {
    unsubscribeEnter();
    unsubscribeExit();
  };
}
