class ExternalServiceError extends Error {
  constructor(message = 'External service request failed', code = 'EXTERNAL_SERVICE_FAILED') {
    super(message);
    this.name = 'ExternalServiceError';
    this.code = code;
    this.safe = true;
  }
}

function safeExternalError(message, code) {
  return new ExternalServiceError(message, code);
}

module.exports = { ExternalServiceError, safeExternalError };
