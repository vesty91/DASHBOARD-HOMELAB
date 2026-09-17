export class TopologyError extends Error {
  constructor(
    readonly code:
      "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "CYCLE" | "UNKNOWN_SERVICE",
    message: string,
  ) {
    super(message);
    this.name = "TopologyError";
  }
}
