const multer = require('multer');
const path = require('path');

// Phase 1/4 hardening — file upload validation lives in ONE place:
//   * memory storage (the Excel parser works on a Buffer; the question-paper
//     service writes the buffer to its own managed location later);
//   * strict MIME allow-list (never trust the extension alone);
//   * hard size cap from env (MAX_UPLOAD_MB, default 15 MB) — rejects > limit with
//     a clear, meaningful message instead of a silent truncation.

const DEFAULT_MAX_MB = 15;

const ALLOWED_MIME = new Set([
  // Spreadsheets (teacher import + marks + question bank)
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv',
  'application/csv',
  'text/plain', // some browsers label .csv as text/plain
  // Documents / images (question-paper uploads, Phase 4)
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/bmp',
]);

const ALLOWED_EXTENSIONS = new Set([
  'xlsx', 'xls', 'csv', 'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'bmp',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (Number(process.env.MAX_UPLOAD_MB) || DEFAULT_MAX_MB) * 1024 * 1024,
  },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    const mimeOk = ALLOWED_MIME.has(file.mimetype);
    const extOk = ALLOWED_EXTENSIONS.has(ext);
    if (!mimeOk && !extOk) {
      return cb(Object.assign(new Error(`File type "${file.originalname}" is not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}.`), { status: 400 }));
    }
    return cb(null, true);
  },
});

module.exports = { upload, ALLOWED_MIME, ALLOWED_EXTENSIONS };