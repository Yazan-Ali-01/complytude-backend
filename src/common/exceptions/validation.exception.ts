import { HttpException, HttpStatus } from '@nestjs/common';

export class ValidationException extends HttpException {
  constructor(details: any[]) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Variable validation failed',
        details,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}