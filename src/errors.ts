export enum ErrorCode {
    INVALID_FILE_PATH = 1,
    INVALID_REQ_URL,
    UNKNOWN,
}

export class AppError extends Error {
    constructor(public code: ErrorCode, message?: string) {
        super(message);
    }
}
