export class VaaDecodeError extends Error {
  constructor(message: string, public readonly offset?: number) {
    super(offset === undefined ? message : `${message} at byte ${offset}`);
    this.name = "VaaDecodeError";
  }
}

export class VaaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaaValidationError";
  }
}
