function toFieldErrors(errors: unknown[]): Array<{ message?: string }> {
  return errors.map((error) => {
    if (typeof error === "string") {
      return { message: error };
    }

    if (typeof error === "object" && error !== null && "message" in error) {
      const { message } = error;
      return { message: typeof message === "string" ? message : undefined };
    }

    return {};
  });
}

export function fieldErrorItems(errors: unknown[]) {
  return toFieldErrors(errors);
}

export function isFieldInvalid(errors: unknown[]) {
  return errors.length > 0;
}
