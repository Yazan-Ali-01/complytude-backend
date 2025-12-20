import 'reflect-metadata';

export const JSON_FIELDS_KEY = 'json_fields';

export function JsonField(): PropertyDecorator {
  return (target, propertyKey) => {
    const existing =
      Reflect.getMetadata(JSON_FIELDS_KEY, target.constructor) || [];
    Reflect.defineMetadata(
      JSON_FIELDS_KEY,
      [...new Set([...existing, propertyKey])],
      target.constructor,
    );
  };
}
