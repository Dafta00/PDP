import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidNigerianPhone } from '../utils/identity-normalization';

export function IsNigerianPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNigerianPhone',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Enter a valid Nigerian phone number, e.g. 08012345678 or +2348012345678.',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isValidNigerianPhone(value);
        },
      },
    });
  };
}
