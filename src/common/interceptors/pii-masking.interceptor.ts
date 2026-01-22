import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RbacService } from '../../modules/rbac/rbac.service';

const PII_PATTERNS = {
  email: /[\w.-]+@[\w.-]+.\w+/g,
  phone: /\\+?[\\d\\s-]{10,}/g,
  name: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
};

@Injectable()
export class PiiMaskingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PiiMaskingInterceptor.name);

  constructor(private readonly rbacService: RbacService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return next.handle();
    }

    const canViewUnmasked = this.rbacService.hasPermission(
      user.role,
      'pii:view_unmasked',
    );

    if (canViewUnmasked) {
      return next.handle();
    }

    return next.handle().pipe(map((data) => this.maskPiiInResponse(data)));
  }

  private maskPiiInResponse(data: any): any {
    if (!data) return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.maskPiiInResponse(item));
    }

    if (typeof data === 'object') {
      const masked: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (this.isPiiField(key)) {
          masked[key] = this.maskPiiValue(value, key);
        } else {
          masked[key] = this.maskPiiInResponse(value);
        }
      }
      return masked;
    }

    if (typeof data === 'string') {
      return this.maskPiiString(data);
    }

    return data;
  }

  private isPiiField(fieldName: string): boolean {
    const piiFields = [
      'email',
      'phoneNumber',
      'phone',
      'mobile',
      'firstName',
      'lastName',
      'fullName',
      'name',
      'address',
      'ssn',
      'nationalId',
      'passportNumber',
      'bankAccount',
      'creditCard',
    ];

    const lowerFieldName = fieldName.toLowerCase();
    return piiFields.some((field) =>
      lowerFieldName.includes(field.toLowerCase()),
    );
  }

  private maskPiiValue(value: any, fieldName: string): string {
    if (value === null || value === undefined) return value;

    const strValue = String(value);

    const lowerFieldName = fieldName.toLowerCase();

    if (lowerFieldName.includes('email')) {
      return this.maskEmail(strValue);
    }

    if (lowerFieldName.includes('phone') || lowerFieldName.includes('mobile')) {
      return this.maskPhone(strValue);
    }

    return this.maskGeneric(strValue);
  }

  private maskPiiString(text: unknown): string {
    const strText = String(text);

    let masked = strText;

    if (PII_PATTERNS.email.test(masked)) {
      masked = masked.replace(PII_PATTERNS.email, (match) =>
        this.maskEmail(match),
      );
    }

    if (PII_PATTERNS.phone.test(masked)) {
      masked = masked.replace(PII_PATTERNS.phone, (match) =>
        this.maskPhone(match),
      );
    }

    return masked;
  }

  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!domain) return email;

    const visibleChars = Math.min(2, localPart.length);
    const maskedPart =
      localPart.slice(0, visibleChars) +
      '*'.repeat(localPart.length - visibleChars);
    return `${maskedPart}@${domain}`;
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return '***';

    const visible = digits.slice(-2);
    return '*'.repeat(Math.min(digits.length - 2, 8)) + visible;
  }

  private maskGeneric(value: string): string {
    if (value.length <= 2) return '**';
    return value.charAt(0) + '*'.repeat(value.length - 1);
  }
}
