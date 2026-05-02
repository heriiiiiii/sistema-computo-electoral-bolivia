from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import APIRouter, Query, UploadFile, File, Form, Request, Body
from fastapi.responses import JSONResponse

from app.schemas.manual_results_schema import ManualResultsRequest
from app.services.acta_service import ActaService
from app.services.log_service import LogService
from app.validators.file_validator import FileValidationError

router = APIRouter(prefix="/api/rrv", tags=["RRV"])

log_service = LogService()
acta_service = ActaService()


@router.post("/actas")
async def receive_acta(
    request: Request,
    archivo: UploadFile = File(...),
    codigoMesa: str = Form(...),
    numeroMesa: int = Form(...),
    codigoRecinto: str = Form(...),
    usuarioId: str = Form(...),
    nombreOperador: str = Form(...),
    dispositivo: str = Form(...),
    latitud: float = Form(...),
    longitud: float = Form(...),
    sourceTipo: Optional[str] = Form(default=None)
):
    try:
        ip_origen = request.client.host if request.client else None

        result = await acta_service.receive_acta(
            archivo=archivo,
            codigo_mesa=codigoMesa,
            numero_mesa=numeroMesa,
            codigo_recinto=codigoRecinto,
            usuario_id=usuarioId,
            nombre_operador=nombreOperador,
            dispositivo=dispositivo,
            latitud=latitud,
            longitud=longitud,
            ip_origen=ip_origen,
            source_tipo=sourceTipo
        )

        return result

    except FileValidationError as error:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": error.message,
                "codigoError": error.codigo_error
            }
        )

    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA",
            severidad="ERROR",
            mensaje="Error inesperado al recibir acta RRV",
            detalle=str(error),
            datos_referencia={
                "endpoint": "POST /api/rrv/actas"
            }
        )

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Error interno al recibir el acta",
                "codigoError": "ERROR_INTERNO_RRV"
            }
        )


@router.post("/actas/auto")
async def receive_acta_auto(
    request: Request,
    archivo: UploadFile = File(...),
    usuarioId: Optional[str] = Form(default=None),
    nombreOperador: Optional[str] = Form(default=None),
    dispositivo: Optional[str] = Form(default=None),
    latitud: Optional[float] = Form(default=None),
    longitud: Optional[float] = Form(default=None),
    sourceTipo: Optional[str] = Form(default=None)
):
    try:
        ip_origen = request.client.host if request.client else None

        result = await acta_service.receive_acta_auto(
            archivo=archivo,
            usuario_id=usuarioId or "operador-auto",
            nombre_operador=nombreOperador or "Operador automatico",
            dispositivo=dispositivo or "carga-web-auto",
            latitud=latitud if latitud is not None else 0,
            longitud=longitud if longitud is not None else 0,
            ip_origen=ip_origen,
            source_tipo=sourceTipo
        )

        return result

    except FileValidationError as error:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": error.message,
                "codigoError": error.codigo_error
            }
        )

    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA",
            severidad="ERROR",
            mensaje="Error inesperado al recibir acta automatica RRV",
            detalle=str(error),
            datos_referencia={
                "endpoint": "POST /api/rrv/actas/auto"
            }
        )

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Error interno al recibir el acta automatica",
                "codigoError": "ERROR_INTERNO_RRV_AUTO"
            }
        )


@router.post("/actas/{actaId}/procesar-ocr")
def process_acta_ocr(actaId: str):
    result = acta_service.process_ocr(actaId)

    if not result.get("success"):
        return JSONResponse(
            status_code=404,
            content=result
        )

    return result


@router.post("/actas/{actaId}/validar")
def validate_acta_rrv(actaId: str):
    try:
        result = acta_service.validate_acta(actaId)

        if not result.get("success"):
            status_code = 404 if result.get("codigoError") == "ACTA_NO_ENCONTRADA" else 422
            return JSONResponse(status_code=status_code, content=result)

        return result

    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA",
            severidad="ERROR",
            mensaje="Error inesperado al validar acta RRV",
            detalle=str(error),
            acta_id=actaId,
            datos_referencia={
                "endpoint": "POST /api/rrv/actas/{actaId}/validar"
            }
        )

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Error interno al validar el acta",
                "codigoError": "ERROR_INTERNO_VALIDACION_RRV"
            }
        )


@router.patch("/actas/{actaId}/resultados-manuales")
def apply_manual_results(actaId: str, body: ManualResultsRequest):
    result = acta_service.apply_manual_results(actaId, body)

    if not result.get("success"):
        status_code = 404 if result.get("codigoError") == "ACTA_NO_ENCONTRADA" else 422
        return JSONResponse(status_code=status_code, content=result)

    return result


@router.post("/sms")
def receive_sms_rrv(body: Dict[str, Any] = Body(...)):
    try:
        result = acta_service.receive_sms(body)

        if not result.get("success"):
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "message": "Could not save SMS",
                    "error": result.get("error") or result.get("message") or "Unknown error",
                },
            )

        return result

    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA",
            severidad="ERROR",
            mensaje="Error inesperado al recibir SMS RRV",
            detalle=str(error),
            datos_referencia={
                "endpoint": "POST /api/rrv/sms",
                "body": body
            }
        )

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Could not save SMS",
                "error": str(error)
            }
        )


@router.get("/actas")
def list_actas(
    estado: Optional[str] = None,
    departamento: Optional[str] = None,
    municipio: Optional[str] = None,
    codigoRecinto: Optional[str] = None,
    codigoMesa: Optional[str] = None,
    fechaInicio: Optional[str] = None,
    fechaFin: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200)
):
    filters = {}

    if estado:
        filters["estado"] = estado

    if departamento:
        filters["ubicacion.departamento"] = departamento

    if municipio:
        filters["ubicacion.municipio"] = municipio

    if codigoRecinto:
        filters["codigoRecinto"] = codigoRecinto

    if codigoMesa:
        filters["codigoMesa"] = codigoMesa

    if fechaInicio or fechaFin:
        filters["createdAt"] = {}

        if fechaInicio:
            filters["createdAt"]["$gte"] = datetime.fromisoformat(fechaInicio)

        if fechaFin:
            filters["createdAt"]["$lte"] = datetime.fromisoformat(fechaFin)

    actas = acta_service.list_actas(filters=filters, limit=limit)

    return {
        "success": True,
        "total": len(actas),
        "actas": actas
    }


@router.get("/actas-sospechosas")
def list_actas_sospechosas(
    codigoMesa: Optional[str] = None,
    departamento: Optional[str] = None,
    municipio: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200)
):
    try:
        actas = acta_service.list_actas(filters={}, limit=10000)
        sospechosas = []

        for acta in actas:
            if not isinstance(acta, dict):
                continue

            validacion = acta.get("validacion") or {}
            ubicacion = acta.get("ubicacion") or {}

            es_sospechosa = (
                acta.get("estado") == "SOSPECHOSA"
                or validacion.get("esSospechosa") is True
                or validacion.get("requiereRevisionManual") is True
                or validacion.get("esDuplicada") is True
            )

            if not es_sospechosa:
                continue

            if codigoMesa and acta.get("codigoMesa") != codigoMesa:
                continue

            if departamento and ubicacion.get("departamento") != departamento:
                continue

            if municipio and ubicacion.get("municipio") != municipio:
                continue

            sospechosas.append(acta)

        return {
            "success": True,
            "total": len(sospechosas[:limit]),
            "actas": sospechosas[:limit]
        }

    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA",
            severidad="ERROR",
            mensaje="Error inesperado al listar actas sospechosas",
            detalle=str(error),
            datos_referencia={
                "endpoint": "GET /api/rrv/actas-sospechosas"
            }
        )

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Error interno al listar actas sospechosas",
                "codigoError": "ERROR_INTERNO_ACTAS_SOSPECHOSAS",
                "detalle": str(error)
            }
        )

@router.get("/resumen")
def get_rrv_resumen():
    try:
        actas = acta_service.list_actas(filters={}, limit=10000)

        resumen = {
            "success": True,
            "actasRecibidas": 0,
            "actasProcesadas": 0,
            "actasValidadas": 0,
            "actasSospechosas": 0,
            "actasRechazadas": 0,
            "actasPendientes": 0,
            "actasDuplicadas": 0,
            "actasConErrorOCR": 0,
            "actasNoPublicables": 0,
            "inconsistenciasAbiertas": 0,
            "incluidasDashboard": 0,
            "totalVotos": 0,
            "votosValidos": 0,
            "votosBlancos": 0,
            "votosNulos": 0,
            "actasPorDepartamento": {},
            "actasPorMunicipio": {}
        }

        for acta in actas:
            if not isinstance(acta, dict):
                continue

            # actasRecibidas == actasProcesadas: cada acta almacenada ya entro
            # al pipeline RRV. ocr.procesado refleja solo el subpaso OCR y no
            # representa todo el procesamiento.
            resumen["actasRecibidas"] += 1
            resumen["actasProcesadas"] += 1

            estado = acta.get("estado") or "SIN_ESTADO"
            validacion = acta.get("validacion") or {}
            ocr = acta.get("ocr") or {}
            ubicacion = acta.get("ubicacion") or {}
            territorio_oficial = acta.get("territorioOficial") or {}
            resultados_root = acta.get("resultados") or {}
            resultados = resultados_root.get("presidente") or {}

            if estado in ["VALIDADA", "PUBLICADA"]:
                resumen["actasValidadas"] += 1
                resumen["incluidasDashboard"] += 1

            if estado == "SOSPECHOSA":
                resumen["actasSospechosas"] += 1

            if estado == "RECHAZADA":
                resumen["actasRechazadas"] += 1

            if estado == "PENDIENTE_REVISION":
                resumen["actasPendientes"] += 1

            if estado in ["SOSPECHOSA", "PENDIENTE_REVISION", "RECHAZADA"]:
                resumen["actasNoPublicables"] += 1
                resumen["inconsistenciasAbiertas"] += 1

            if validacion.get("esDuplicada") is True:
                resumen["actasDuplicadas"] += 1

            errores_ocr = ocr.get("erroresOCR") or []

            if len(errores_ocr) > 0:
                resumen["actasConErrorOCR"] += 1

            es_acta_valida_para_totales = (
                estado == "VALIDADA"
                and validacion.get("esDuplicada") is not True
                and validacion.get("esSospechosa") is not True
                and validacion.get("requiereRevisionManual") is not True
            )

            if es_acta_valida_para_totales:
                resumen["totalVotos"] += int(resultados.get("totalVotos") or 0)
                resumen["votosValidos"] += int(resultados.get("votosValidos") or 0)
                resumen["votosBlancos"] += int(resultados.get("votosBlancos") or 0)
                resumen["votosNulos"] += int(resultados.get("votosNulos") or 0)

            # Prioridad geografica: territorioOficial -> ubicacion -> SIN_*.
            # Coincide con la regla aplicada en /api/rrv/dashboard/geografico.
            if territorio_oficial.get("resuelto"):
                departamento = (
                    territorio_oficial.get("departamento")
                    or ubicacion.get("departamento")
                    or "SIN_DEPARTAMENTO"
                )
                municipio = (
                    territorio_oficial.get("municipio")
                    or ubicacion.get("municipio")
                    or "SIN_MUNICIPIO"
                )
            else:
                departamento = ubicacion.get("departamento") or "SIN_DEPARTAMENTO"
                municipio = ubicacion.get("municipio") or "SIN_MUNICIPIO"

            resumen["actasPorDepartamento"][departamento] = (
                resumen["actasPorDepartamento"].get(departamento, 0) + 1
            )

            resumen["actasPorMunicipio"][municipio] = (
                resumen["actasPorMunicipio"].get(municipio, 0) + 1
            )

        return resumen

    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA",
            severidad="ERROR",
            mensaje="Error inesperado al generar resumen RRV",
            detalle=str(error),
            datos_referencia={
                "endpoint": "GET /api/rrv/resumen"
            }
        )

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Error interno al generar resumen RRV",
                "codigoError": "ERROR_INTERNO_RESUMEN_RRV",
                "detalle": str(error)
            }
        )


@router.get("/actas/{actaId}")
def get_acta_detail(actaId: str):
    acta = acta_service.get_acta_detail(actaId)

    if not acta:
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "message": "Acta no encontrada",
                "codigoError": "ACTA_NO_ENCONTRADA"
            }
        )

    return {
        "success": True,
        "acta": acta
    }


@router.get("/logs")
def get_rrv_logs(
    tipo: Optional[str] = None,
    severidad: Optional[str] = None,
    codigoMesa: Optional[str] = None,
    actaId: Optional[str] = None,
    fechaInicio: Optional[str] = None,
    fechaFin: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200)
):
    filters = {}

    if tipo:
        filters["tipo"] = tipo

    if severidad:
        filters["severidad"] = severidad

    if codigoMesa:
        filters["codigoMesa"] = codigoMesa

    if actaId:
        filters["actaId"] = actaId

    if fechaInicio or fechaFin:
        filters["fechaHora"] = {}

        if fechaInicio:
            filters["fechaHora"]["$gte"] = datetime.fromisoformat(fechaInicio)

        if fechaFin:
            filters["fechaHora"]["$lte"] = datetime.fromisoformat(fechaFin)

    logs = log_service.list_logs(filters=filters, limit=limit)

    return {
        "success": True,
        "total": len(logs),
        "logs": logs
    }
