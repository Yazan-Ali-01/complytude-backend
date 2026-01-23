"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IsFileMaxSizeConstraint = exports.IsFileMimeTypeConstraint = exports.IsFileUploadedConstraint = exports.IsMulterLikeFileConstraint = void 0;
exports.IsMulterLikeFile = IsMulterLikeFile;
exports.IsFileUploaded = IsFileUploaded;
exports.IsFileMimeType = IsFileMimeType;
exports.IsFileMaxSize = IsFileMaxSize;
const class_validator_1 = require("class-validator");
const helper_1 = require("../helper");
let IsMulterLikeFileConstraint = class IsMulterLikeFileConstraint {
    validate(file) {
        if (!file) {
            return true;
        }
        return (0, helper_1.isMulterLikeFile)(file);
    }
    defaultMessage(_args) {
        return 'A valid file must be provided';
    }
};
exports.IsMulterLikeFileConstraint = IsMulterLikeFileConstraint;
exports.IsMulterLikeFileConstraint = IsMulterLikeFileConstraint = __decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'isValidFile', async: false })
], IsMulterLikeFileConstraint);
function IsMulterLikeFile(validationOptions) {
    return function (object, propertyName) {
        (0, class_validator_1.registerDecorator)({
            name: 'isValidFile',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: IsMulterLikeFileConstraint,
        });
    };
}
let IsFileUploadedConstraint = class IsFileUploadedConstraint {
    validate(file) {
        return !!file;
    }
    defaultMessage(_args) {
        return 'File is required';
    }
};
exports.IsFileUploadedConstraint = IsFileUploadedConstraint;
exports.IsFileUploadedConstraint = IsFileUploadedConstraint = __decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'isFileUploaded', async: false })
], IsFileUploadedConstraint);
function IsFileUploaded(validationOptions) {
    return function (object, propertyName) {
        (0, class_validator_1.registerDecorator)({
            name: 'isFileUploaded',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: IsFileUploadedConstraint,
        });
    };
}
let IsFileMimeTypeConstraint = class IsFileMimeTypeConstraint {
    validate(file, args) {
        const allowedTypes = args.constraints[0];
        if (!(0, helper_1.isMulterLikeFile)(file)) {
            return true;
        }
        const mimetype = typeof file?.mimetype === 'string' ? file.mimetype : '';
        return allowedTypes.includes(mimetype);
    }
    defaultMessage(args) {
        const allowedTypes = args.constraints[0];
        const file = args.value;
        const actualType = typeof file?.mimetype === 'string' ? file.mimetype : 'unknown';
        return `Invalid file type. Allowed: ${allowedTypes.join(', ')}. Received: ${actualType}`;
    }
};
exports.IsFileMimeTypeConstraint = IsFileMimeTypeConstraint;
exports.IsFileMimeTypeConstraint = IsFileMimeTypeConstraint = __decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'isFileMimeType', async: false })
], IsFileMimeTypeConstraint);
function IsFileMimeType(allowedTypes, validationOptions) {
    return function (object, propertyName) {
        (0, class_validator_1.registerDecorator)({
            name: 'isFileMimeType',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [allowedTypes],
            options: {
                ...validationOptions,
                context: {
                    ...(validationOptions?.context ?? {}),
                    constraint: allowedTypes,
                },
            },
            validator: IsFileMimeTypeConstraint,
        });
    };
}
let IsFileMaxSizeConstraint = class IsFileMaxSizeConstraint {
    validate(file, args) {
        const maxSize = args.constraints[0];
        if (!(0, helper_1.isMulterLikeFile)(file)) {
            return true;
        }
        return file.size <= maxSize;
    }
    defaultMessage(args) {
        const maxSize = args.constraints[0];
        const file = args.value;
        const expected = (0, helper_1.formatFileSize)(maxSize);
        const actual = typeof file?.size === 'number'
            ? (0, helper_1.formatFileSize)(file.size)
            : 'unknown size';
        return `File too large. Maximum size: ${expected}. Provided: ${actual}`;
    }
};
exports.IsFileMaxSizeConstraint = IsFileMaxSizeConstraint;
exports.IsFileMaxSizeConstraint = IsFileMaxSizeConstraint = __decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'isFileMaxSize', async: false })
], IsFileMaxSizeConstraint);
function IsFileMaxSize(maxBytes, validationOptions) {
    return function (object, propertyName) {
        (0, class_validator_1.registerDecorator)({
            name: 'isFileMaxSize',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [maxBytes],
            options: {
                ...validationOptions,
                context: {
                    ...(validationOptions?.context ?? {}),
                    constraint: maxBytes,
                },
            },
            validator: IsFileMaxSizeConstraint,
        });
    };
}
//# sourceMappingURL=file-validators.decorator.js.map