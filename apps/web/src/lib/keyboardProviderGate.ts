let suspensionCount = 0;

export function suspendKeyboardProviderDispatch(): () => void {
  suspensionCount += 1;

  return () => {
    suspensionCount = Math.max(0, suspensionCount - 1);
  };
}

export function isKeyboardProviderDispatchSuspended(): boolean {
  return suspensionCount > 0;
}
