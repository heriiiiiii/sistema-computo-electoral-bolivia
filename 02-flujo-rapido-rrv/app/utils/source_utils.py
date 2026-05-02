"""Helpers para construir el campo estandarizado `source` en documentos RRV.

El campo `source` es ADITIVO y convive con `fuente` (string corto, requerido por
el schema de Mongo). `source` describe en detalle de donde proviene el registro
para que el evaluador pueda inspeccionar los documentos directamente en
MongoDB y entender el origen exacto.

Forma estandar:
    source = {
        "tipo":          str,   # ej: APP_MOVIL_O_CARGA_WEB, SMS, CARGA_LOTE, OCR
        "canal":         str,   # ej: RRV_ACTA, RRV_SMS, RRV_LOG, RRV_EVENTO
        "modulo":        str,   # siempre "02-flujo-rapido-rrv"
        "endpoint":      str | None,
        "descripcion":   str | None,
        "generadoPor":   str,   # usuarioId, numeroOrigen, "sistema", etc.
        "fechaRegistro": datetime,
    }
"""

from datetime import datetime, timezone

MODULO_RRV = "02-flujo-rapido-rrv"


# tipo del log -> tipo del source (para defaults en log_service)
LOG_TIPO_A_SOURCE_TIPO = {
    "ERROR_OCR": "OCR",
    "ERROR_IMAGEN": "CALIDAD_VISUAL",
    "CALIDAD_VISUAL": "CALIDAD_VISUAL",
    "DUPLICADO": "DUPLICADO",
    "SMS_INVALIDO": "SMS",
    "SMS_NUMERO_NO_AUTORIZADO": "SMS",
    "INCONSISTENCIA": "VALIDACION",
    "VALIDACION_RRV": "VALIDACION",
    "VALIDACION_AUTOMATICA": "VALIDACION",
    "TOTAL_INCOHERENTE": "VALIDACION",
    "OBSERVACION_ACTA": "VALIDACION",
    "FORMULARIO_INVALIDO": "VALIDACION",
    "FIRMA_HUELLA_INVALIDA": "VALIDACION",
    "FECHA_INVALIDA": "VALIDACION",
    "HORARIO_INVALIDO": "VALIDACION",
    "UBICACION_INVALIDA": "VALIDACION",
    "MESA_INVALIDA": "VALIDACION",
    "PAPELETA_INVALIDA": "VALIDACION",
    "CORRECCION_MANUAL": "VALIDACION",
    "EXTRACCION_AUTOMATICA": "OCR",
}


# tipoEvento -> tipo del source (para defaults en event_service)
EVENT_TIPO_A_SOURCE_TIPO = {
    "ACTA_RECIBIDA": "RECEPCION",
    "ACTA_AUTO_INGRESADA": "RECEPCION",
    "ACTA_AUTO_PENDIENTE_REVISION": "RECEPCION",
    "OCR_INICIADO": "OCR",
    "OCR_PROCESADO": "OCR",
    "ACTA_VALIDADA": "VALIDACION",
    "ACTA_SOSPECHOSA": "VALIDACION",
    "ACTA_RECHAZADA": "VALIDACION",
    "ACTA_PUBLICADA": "VALIDACION",
    "INCONSISTENCIA_DETECTADA": "VALIDACION",
    "RESULTADOS_MANUALES_APLICADOS": "VALIDACION",
    "DUPLICADO_DETECTADO": "DUPLICADO",
    "SMS_RECIBIDO": "SMS",
    "SMS_VALIDADO": "SMS",
    "SMS_RECHAZADO": "SMS",
    "SMS_DUPLICADO": "SMS",
    "SMS_CONFLICTO_MESA": "SMS",
    "SMS_SYNC_PC_SERVER": "SMS",
}


def build_source(
    tipo,
    canal,
    endpoint=None,
    descripcion=None,
    generado_por=None,
    modulo=MODULO_RRV,
):
    return {
        "tipo": tipo or "SISTEMA",
        "canal": canal,
        "modulo": modulo,
        "endpoint": endpoint,
        "descripcion": descripcion,
        "generadoPor": generado_por or "sistema",
        "fechaRegistro": datetime.now(timezone.utc),
    }


def default_log_source(tipo, mensaje=None, endpoint=None, generado_por=None):
    source_tipo = LOG_TIPO_A_SOURCE_TIPO.get(tipo, "SISTEMA")

    return build_source(
        tipo=source_tipo,
        canal="RRV_LOG",
        endpoint=endpoint,
        descripcion=mensaje,
        generado_por=generado_por,
    )


def default_event_source(tipo_evento, mensaje=None, endpoint=None, generado_por=None):
    source_tipo = EVENT_TIPO_A_SOURCE_TIPO.get(tipo_evento, "SISTEMA")

    return build_source(
        tipo=source_tipo,
        canal="RRV_EVENTO",
        endpoint=endpoint,
        descripcion=mensaje,
        generado_por=generado_por,
    )


def acta_source_for_manual(usuario_id):
    return build_source(
        tipo="APP_MOVIL_O_CARGA_WEB",
        canal="RRV_ACTA",
        endpoint="POST /api/rrv/actas",
        descripcion="Acta recibida con metadatos manuales desde app movil o carga web",
        generado_por=usuario_id or "operador-manual",
    )


def acta_source_for_auto(source_tipo, usuario_id):
    """Selecciona la variante correcta para POST /api/rrv/actas/auto.

    Si el script de carga masiva envia sourceTipo=CARGA_LOTE, marcamos el acta
    como proveniente del lote. En cualquier otro caso es CARGA_WEB_AUTOMATICA.
    """
    tipo_normalizado = (source_tipo or "").strip().upper()

    if tipo_normalizado == "CARGA_LOTE":
        return build_source(
            tipo="CARGA_LOTE",
            canal="RRV_ACTA_LOTE",
            endpoint="POST /api/rrv/actas/auto",
            descripcion="Acta enviada por script de carga masiva desde carpeta",
            generado_por=usuario_id or "operador-lote",
        )

    if tipo_normalizado in ["APP_MOVIL", "APP_MOVIL_PDF"]:
        return build_source(
            tipo="APP_MOVIL",
            canal="APP_MOVIL_PDF",
            endpoint="POST /api/rrv/actas/auto",
            descripcion="Acta recibida desde app movil via servidor PC",
            generado_por=usuario_id or "servidor-pc-app-movil",
        )

    return build_source(
        tipo="CARGA_WEB_AUTOMATICA",
        canal="RRV_ACTA_AUTO",
        endpoint="POST /api/rrv/actas/auto",
        descripcion="Acta procesada automaticamente desde PDF o imagen",
        generado_por=usuario_id or "operador-auto",
    )


def sms_source(numero_origen):
    return build_source(
        tipo="SMS",
        canal="RRV_SMS",
        endpoint="POST /api/rrv/sms",
        descripcion="Datos recibidos desde modulo SMS o simulacion SMS",
        generado_por=numero_origen or "modulo-sms",
    )
