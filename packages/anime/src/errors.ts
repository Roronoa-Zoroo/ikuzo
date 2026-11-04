export class HttpError extends Error {
  readonly status: number;
  /** Response body, when the server sent one (often holds the real reason). */
  readonly body: string;

  constructor(status: number, url: string, body = "") {
    super(`Request to ${url} failed with status ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}
