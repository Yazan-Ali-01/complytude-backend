"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatFileSize = formatFileSize;
exports.isMulterLikeFile = isMulterLikeFile;
function formatFileSize(bytes) {
    if (bytes === 0)
        return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const decimals = 2;
    if (bytes < k) {
        return `${bytes} B`;
    }
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = bytes / Math.pow(k, i);
    return `${size.toFixed(decimals)} ${units[i]}`;
}
function isMulterLikeFile(file) {
    if (!file || typeof file !== 'object') {
        return false;
    }
    const f = file;
    return (typeof f.fieldname === 'string' &&
        typeof f.originalname === 'string' &&
        typeof f.encoding === 'string' &&
        typeof f.mimetype === 'string' &&
        Buffer.isBuffer(f.buffer) &&
        typeof f.size === 'number');
}
//# sourceMappingURL=helper.js.map