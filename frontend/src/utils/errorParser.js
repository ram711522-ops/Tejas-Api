/**
 * Normalizes FastAPI HTTPException, RequestValidationError, and Axios network errors
 * into a predictable structure for UI components.
 */
export function parseApiError(error) {
  if (!error) {
    return {
      status: null,
      message: 'An unexpected error occurred.',
      fieldErrors: {},
      isAuthError: false,
      isNetworkError: false,
    };
  }

  if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') {
    return {
      status: null,
      message: 'Request cancelled.',
      fieldErrors: {},
      isAuthError: false,
      isNetworkError: false,
      isCanceled: true,
    };
  }

  const response = error.response;
  if (!response) {
    return {
      status: null,
      message:
        error.code === 'ECONNABORTED'
          ? 'Request timed out while contacting the TEJAS backend.'
          : 'Unable to reach the TEJAS backend server. Check that FastAPI is running and CORS is allowed.',
      fieldErrors: {},
      isAuthError: false,
      isNetworkError: true,
    };
  }

  const { status, data } = response;
  const fieldErrors = {};
  let message = `Request failed with status ${status}.`;

  if (data && typeof data === 'object') {
    if (typeof data.detail === 'string') {
      message = data.detail;
    } else if (Array.isArray(data.detail)) {
      const messages = [];
      for (const item of data.detail) {
        const loc = Array.isArray(item?.loc) ? item.loc : [];
        const fieldName = loc.length > 0 ? String(loc[loc.length - 1]) : null;
        const msg = item?.msg ? String(item.msg) : 'Invalid value';
        if (fieldName && fieldName !== 'body' && fieldName !== '__root__') {
          fieldErrors[fieldName] = msg;
        }
        messages.push(fieldName && fieldName !== 'body' ? `${fieldName}: ${msg}` : msg);
      }
      if (messages.length > 0) {
        message = messages.join(' • ');
      }
    } else if (typeof data.message === 'string') {
      message = data.message;
    }
  }

  return {
    status,
    message,
    fieldErrors,
    isAuthError: status === 401,
    isNetworkError: false,
  };
}
