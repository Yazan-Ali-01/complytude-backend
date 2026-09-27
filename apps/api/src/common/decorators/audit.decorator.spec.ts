/* eslint-disable @typescript-eslint/unbound-method */
import { AUDIT_KEY, Audit, AuditConfig } from './audit.decorator';

describe('Audit decorator', () => {
  it('sets metadata with action name and empty options', () => {
    class TestController {
      @Audit('CONTRACT_EXPORTED')
      testMethod() {}
    }

    const metadata: AuditConfig = Reflect.getMetadata(
      AUDIT_KEY,
      TestController.prototype.testMethod,
    );
    expect(metadata).toEqual({
      action: 'CONTRACT_EXPORTED',
      options: {},
    });
  });

  it('sets metadata with action name and custom options', () => {
    class TestController {
      @Audit('CONTRACT_EXPORTED', {
        resourceIdParam: 'id',
        includeBody: true,
        resourceType: 'contracts',
      })
      testMethod() {}
    }

    const metadata: AuditConfig = Reflect.getMetadata(
      AUDIT_KEY,
      TestController.prototype.testMethod,
    );
    expect(metadata).toEqual({
      action: 'CONTRACT_EXPORTED',
      options: {
        resourceIdParam: 'id',
        includeBody: true,
        resourceType: 'contracts',
      },
    });
  });

  it('uses AUDIT_KEY as the metadata key', () => {
    expect(AUDIT_KEY).toBe('audit:config');
  });
});
