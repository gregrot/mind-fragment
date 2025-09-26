export const describeError = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    return error.message?.trim() || fallback;
  }

  if (typeof error === 'string') {
    const trimmed = error.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return fallback;
};

export default describeError;
