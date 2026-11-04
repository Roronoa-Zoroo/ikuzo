export class InvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvariantError";
  }
}

function invariant(condition: unknown, message?: string): asserts condition {
  if (condition) {
    return;
  }

  throw new InvariantError(message ?? "Invariant violated");
}

export default invariant;
