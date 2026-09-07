// Request validation with zod.
//
// Everything that reaches a handler through this is typed and trusted; anything
// that does not match is refused before any work happens.
import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type Source = "body" | "query" | "params";

/**
 * Validate one part of the request, replacing it with the parsed value so
 * handlers see coerced, stripped data rather than raw input.
 */
export function validate<T>(schema: ZodType<T>, source: Source = "body"): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue?.path.join(".");
      res.status(400).json({
        error: {
          message: field
            ? `That request's "${field}" field isn't valid: ${issue.message.toLowerCase()}.`
            : "That request didn't match what this endpoint expects.",
          next: "Correct the field and send it again.",
        },
      });
      return;
    }
    // req.query is a getter-only property in Express 5, so it is replaced by
    // definition rather than assignment.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}
