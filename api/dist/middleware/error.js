import { ZodError } from "zod";
export class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
export function errorHandler(err, _req, res, _next) {
    if (err instanceof ZodError) {
        return res.status(400).json({
            message: "Validation failed",
            errors: err.flatten().fieldErrors,
        });
    }
    if (err instanceof HttpError) {
        return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
}
