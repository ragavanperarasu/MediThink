/** An error whose message is safe to show the person who caused it. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Lets an async handler throw instead of calling next(err) by hand (Express 4). */
export const wrap = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
