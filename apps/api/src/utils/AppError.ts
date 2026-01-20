// apps/api/src/utils/AppError.ts

/**
 * Operational Error Class
 * Use this to throw errors that are expected and should be sent to the client.
 */
export class AppError extends Error {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;
  public errorCode?: string;

  constructor(message: string, statusCode: number, errorCode?: string) {
    super(message);

    this.statusCode = statusCode;
    // If code is 4xx, status is 'fail', else 'error'
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    // Operational errors are predictable (user input bad, etc.)
    this.isOperational = true;
    this.errorCode = errorCode;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
