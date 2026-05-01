ESTADOS_ACTA_RRV = [
    "RECIBIDA",
    "PROCESANDO",
    "VALIDADA",
    "SOSPECHOSA",
    "RECHAZADA",
    "PUBLICADA",
    "PENDIENTE_REVISION"
]

TIPOS_LOG_RRV = [
    "ERROR_IMAGEN",
    "ERROR_OCR",
    "FRAUDE",
    "DUPLICADO",
    "SMS_INVALIDO",
    "SISTEMA",
    "QR_INVALIDO",
    "MESA_INVALIDA",
    "TOTAL_INCOHERENTE",
    "ARCHIVO_INVALIDO",
    "CLUSTER_ERROR",
    "PDF_PLANO",
    "MONGO_WRITE_ERROR",
    "OBSERVACION_ACTA",
    "FORMULARIO_INVALIDO",
    "FIRMA_HUELLA_INVALIDA",
    "FECHA_INVALIDA",
    "HORARIO_INVALIDO",
    "UBICACION_INVALIDA",
    "PAPELETA_INVALIDA"
]

SEVERIDADES_LOG_RRV = [
    "INFO",
    "WARNING",
    "ERROR",
    "CRITICAL"
]

TIPOS_EVENTO_RRV = [
    "ACTA_RECIBIDA",
    "OCR_INICIADO",
    "OCR_PROCESADO",
    "ACTA_VALIDADA",
    "ACTA_RECHAZADA",
    "ACTA_SOSPECHOSA",
    "ACTA_PUBLICADA",
    "SMS_RECIBIDO",
    "SMS_VALIDADO",
    "SMS_RECHAZADO",
    "DUPLICADO_DETECTADO",
    "FRAUDE_DETECTADO",
    "ERROR_PROCESAMIENTO"
]

COLECCIONES_RRV = {
    "actas": "rrv_actas",
    "sms": "rrv_sms",
    "eventos": "rrv_eventos",
    "logs": "rrv_logs",
    "cluster_status": "rrv_cluster_status",
    "resultados": "rrv_resultados"
}
