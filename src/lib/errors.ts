import { USER_ERRORS } from "./user-messages";

/** Domain error with a user-safe message and an HTTP status. */
export class AppError extends Error {
  status: number;
  /** message safe to show to the end user (in Russian) */
  userMessage: string;

  constructor(userMessage: string, status = 400, internal?: string) {
    super(internal ?? userMessage);
    this.name = "AppError";
    this.status = status;
    this.userMessage = userMessage;
  }
}

export class ProviderError extends AppError {
  constructor(userMessage: string, internal?: string) {
    super(userMessage, 502, internal);
    this.name = "ProviderError";
  }
}

export function toErrorResponse(err: unknown): { status: number; body: { error: string } } {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: err.userMessage } };
  }
  // eslint-disable-next-line no-console
  console.error("[unexpected error]", err);
  return {
    status: 500,
    // текст из общего каталога: клиент не должен видеть «что-то пошло не так»
    // без объяснения, целы ли его искры и нужно ли повторять
    body: { error: USER_ERRORS.unexpected },
  };
}
