export function okResponse(data: any, message = 'OK') {
  return { success: true, message, data };
}

export function errResponse(message: string, codigoError: string, data: any = null) {
  return { success: false, message, codigoError, data };
}
