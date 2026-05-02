from datetime import datetime, timezone
from pathlib import Path
from copy import deepcopy
from uuid import uuid4
import re

from app.config.settings import MONGO_DB_NAME, UPLOAD_DIR
from app.constants.rrv_constants import COLECCIONES_RRV
from app.repositories.rrv_repository import RRVRepository
from app.services.event_service import EventService
from app.services.log_service import LogService
from app.services.revision_storage_service import (
    append_revision_log,
    save_acta_to_revision,
)
from app.services.csv_observation_service import get_csv_validation_metadata
from app.services.actas_impresas_service import (
    get_acta_impresa,
    get_actas_impresas_status,
    resolve_official_territory_for_acta,
)
from app.utils.hash_utils import calculate_sha256
from app.utils.mongo_utils import serialize_mongo_document, serialize_mongo_documents
from app.validators.file_validator import validate_uploaded_file
from app.validators.oep_observation_validator import validate_oep_inconsistencies
from app.services.ocr_service import OCRService
from app.services.visual_quality_service import VisualQualityService
from app.utils.source_utils import (
    acta_source_for_auto,
    acta_source_for_manual,
    sms_source,
)


class ActaService:
    def __init__(self):
        self.repository = RRVRepository()
        self.event_service = EventService()
        self.log_service = LogService()
        self.ocr_service = OCRService()
        self.visual_quality_service = VisualQualityService()

    def _safe_register_log(self, **kwargs):
        try:
            return self.log_service.register_log(**kwargs)
        except Exception as error:
            append_revision_log(
                f"FALLBACK_LOG_FAIL motivo={error} tipo={kwargs.get('tipo')} "
                f"acta_id={kwargs.get('acta_id')}"
            )
            return None

    def _safe_register_event(self, **kwargs):
        try:
            return self.event_service.register_event(**kwargs)
        except Exception as error:
            append_revision_log(
                f"FALLBACK_EVENT_FAIL motivo={error} tipo={kwargs.get('tipo')} "
                f"acta_id={kwargs.get('acta_id')}"
            )
            return None

    def _safe_insert_acta(self, acta_data, file_bytes, archivo, file_path):
        """Inserta el acta en MongoDB. Si falla, respalda en storage/revision.

        Devuelve dict con keys:
            ok: bool
            backup: dict | None  -> info del respaldo cuando ok=False
            error: str | None
        """
        try:
            self.repository.insert_acta(acta_data)
            return {"ok": True, "backup": None, "error": None}

        except Exception as error:
            archivo_metadata = acta_data.get("archivo") or {}
            auditoria = acta_data.get("auditoriaRecepcion") or {}
            source_info = acta_data.get("source") or {}
            validacion_info = acta_data.get("validacion") or {}

            metadata_revision = {
                "actaId": acta_data.get("actaId"),
                "nombreOriginal": archivo_metadata.get("nombreOriginal")
                    or getattr(archivo, "filename", None),
                "tipoArchivo": archivo_metadata.get("tipoArchivo")
                    or getattr(archivo, "content_type", None),
                "hashArchivo": archivo_metadata.get("hashArchivo"),
                "fechaRecepcion": archivo_metadata.get("fechaRecepcion"),
                "codigoMesa": acta_data.get("codigoMesa"),
                "codigoRecinto": acta_data.get("codigoRecinto"),
                "estadoIntentado": acta_data.get("estado"),
                "motivoRevision": "MONGO_WRITE_ERROR",
                "errorMongo": str(error),
                "endpointOrigen": source_info.get("endpoint"),
                "usuarioId": auditoria.get("usuarioId"),
                "dispositivo": auditoria.get("dispositivo"),
                "datosOCR": acta_data.get("ocr"),
                "validacionesEjecutadas": validacion_info.get("reglasEjecutadas"),
            }

            backup = save_acta_to_revision(
                file_bytes=file_bytes,
                nombre_original=metadata_revision["nombreOriginal"] or "archivo",
                tipo_archivo=metadata_revision["tipoArchivo"] or "application/octet-stream",
                metadata=metadata_revision,
                error_mongo=str(error),
                file_path_original=str(file_path) if file_path else None,
            )

            self._safe_register_log(
                tipo="MONGO_WRITE_ERROR",
                severidad="CRITICAL",
                mensaje=(
                    "Acta no pudo persistirse en MongoDB; "
                    "respaldo local generado en storage/revision"
                ),
                detalle=str(error),
                acta_id=acta_data.get("actaId"),
                codigo_mesa=acta_data.get("codigoMesa"),
                datos_referencia={
                    "rutaArchivoRevision": backup.get("rutaArchivoRevision"),
                    "rutaMetadatosRevision": backup.get("rutaMetadatosRevision"),
                    "estadoIntentado": acta_data.get("estado"),
                    "endpoint": source_info.get("endpoint"),
                },
            )

            self._safe_register_event(
                tipo="ERROR_PROCESAMIENTO",
                acta_id=acta_data.get("actaId"),
                codigo_mesa=acta_data.get("codigoMesa"),
                mensaje="Acta enviada a storage/revision por fallo de MongoDB",
                datos_referencia={
                    "errorMongo": str(error),
                    "backupRevision": backup,
                },
            )

            return {"ok": False, "backup": backup, "error": str(error)}

    def _state_priority(self, estado):
        priorities = {
            "RECIBIDA": 0,
            "PROCESANDO": 0,
            "VALIDADA": 1,
            "PUBLICADA": 1,
            "PENDIENTE_REVISION": 2,
            "SOSPECHOSA": 3,
            "RECHAZADA": 4,
        }
        return priorities.get(estado or "RECIBIDA", 0)

    def _strongest_state(self, current_state, suggested_state):
        current = current_state or "RECIBIDA"
        suggested = suggested_state or current

        if self._state_priority(suggested) > self._state_priority(current):
            return suggested

        return current

    def _flags_for_state(self, estado, es_duplicada=False):
        es_valida = estado in ["VALIDADA", "PUBLICADA"] and not es_duplicada
        es_sospechosa = estado == "SOSPECHOSA" or es_duplicada
        requiere_revision = (
            estado in ["SOSPECHOSA", "PENDIENTE_REVISION", "RECHAZADA"]
            or es_duplicada
        )

        return {
            "esValida": es_valida,
            "esSospechosa": es_sospechosa,
            "requiereRevisionManual": requiere_revision,
        }

    def _complete_codigo_recinto_from_actas_impresas(self, acta):
        codigo_acta = (
            (acta or {}).get("codigoMesa")
            or (acta or {}).get("codigoActa")
        )

        if not acta or acta.get("codigoRecinto") or not codigo_acta:
            return False

        try:
            acta_impresa = get_acta_impresa(codigo_acta)
        except Exception as error:
            self._safe_register_log(
                tipo="SISTEMA",
                severidad="WARNING",
                mensaje="No se pudo consultar ActasImpresas.csv",
                detalle=str(error),
                acta_id=acta.get("actaId"),
                codigo_mesa=codigo_acta,
                datos_referencia={"fase": "ACTAS_IMPRESAS_LOOKUP"},
            )
            return False

        codigo_recinto = (acta_impresa or {}).get("codigoRecinto")

        if not codigo_recinto:
            return False

        acta["codigoRecinto"] = str(codigo_recinto)
        return True

    def _enrich_official_territory(self, acta):
        """Resuelve territorio oficial y lo persiste en `territorioOficial`.

        - No cambia estado ni resultados.
        - Solo rellena codigoMesa/codigoRecinto/ubicacion cuando estan vacios.
        - Si la ubicacion existente no es vacia, NO la sobrescribe (la mantiene
          junto con `territorioOficial` para que el dashboard pueda agrupar).
        """
        if not isinstance(acta, dict):
            return None

        try:
            resolution = resolve_official_territory_for_acta(acta)
        except Exception as error:
            self._safe_register_log(
                tipo="SISTEMA",
                severidad="WARNING",
                mensaje="No se pudo resolver territorio oficial",
                detalle=str(error),
                acta_id=acta.get("actaId"),
                codigo_mesa=acta.get("codigoMesa"),
                datos_referencia={"fase": "TERRITORIO_OFICIAL_LOOKUP"},
            )
            return None

        if not isinstance(resolution, dict):
            return None

        if not resolution.get("resuelto"):
            acta["territorioOficial"] = {
                "resuelto": False,
                "fuente": resolution.get("fuente") or "none",
                "motivoNoResuelto": resolution.get("motivoNoResuelto"),
            }
            return acta["territorioOficial"]

        territorio = {
            "resuelto": True,
            "fuente": resolution.get("fuente"),
            "codigoMesa": resolution.get("codigoMesaOficial"),
            "codigoRecinto": resolution.get("codigoRecintoOficial"),
            "codigoTerritorial": resolution.get("codigoTerritorial"),
            "departamento": resolution.get("departamento"),
            "provincia": resolution.get("provincia"),
            "municipio": resolution.get("municipio"),
            "recinto": {
                "nombre": (resolution.get("recinto") or {}).get("nombre"),
                "direccion": (resolution.get("recinto") or {}).get("direccion"),
            },
        }

        acta["territorioOficial"] = territorio

        # Recuperar codigoMesa SOLO si vino del filename (no contradice OCR).
        if (
            not acta.get("codigoMesa")
            and resolution.get("codigoMesaOficial")
            and resolution.get("fuente") == "filename"
        ):
            acta["codigoMesa"] = resolution.get("codigoMesaOficial")

        # Rellenar codigoRecinto si esta vacio.
        if not acta.get("codigoRecinto") and resolution.get("codigoRecintoOficial"):
            acta["codigoRecinto"] = resolution.get("codigoRecintoOficial")

        # Rellenar ubicacion SOLO cuando este completamente vacia. Nunca
        # sobrescribir una ubicacion no vacia, aunque haya inconsistencias:
        # esas siguen su flujo de validacion (PROVINCIA_NO_COINCIDE, etc).
        ubicacion = acta.get("ubicacion") or {}
        ubicacion_recinto = ubicacion.get("recinto") or {}
        ubicacion_vacia = not any(
            (
                ubicacion.get("departamento"),
                ubicacion.get("provincia"),
                ubicacion.get("municipio"),
                ubicacion_recinto.get("nombre"),
                ubicacion_recinto.get("direccion"),
            )
        )

        if ubicacion_vacia:
            acta["ubicacion"] = {
                "departamento": territorio.get("departamento"),
                "provincia": territorio.get("provincia"),
                "municipio": territorio.get("municipio"),
                "recinto": {
                    "nombre": territorio["recinto"].get("nombre"),
                    "direccion": territorio["recinto"].get("direccion"),
                },
            }

        return territorio

    def _merge_unique_errors(self, *error_lists):
        """Merge sin duplicados.

        Clave de igualdad: (codigo, fuente, campoComparado/campo, descripcion).
        Antes la clave era (codigo, fuente, descripcion); incluir
        campoComparado evita perder entradas legitimas que comparten codigo
        pero apuntan a campos distintos (p.ej. PROVINCIA_NO_COINCIDE en
        provincia vs en municipio), y evita conservar duplicados emitidos
        por dos rutas del validador con la misma descripcion.
        """
        merged = []
        seen = set()

        for error_list in error_lists:
            for error in error_list or []:
                if not isinstance(error, dict):
                    continue

                key = (
                    error.get("codigo"),
                    error.get("fuente"),
                    error.get("campoComparado") or error.get("campo"),
                    (
                        str(error.get("valorOriginal"))
                        if error.get("valorOriginal") is not None
                        else str(error.get("valorExtraido"))
                        if error.get("valorExtraido") is not None
                        else None
                    ),
                    (
                        str(error.get("valorNormalizado"))
                        if error.get("valorNormalizado") is not None
                        else str(error.get("valorCorregido"))
                        if error.get("valorCorregido") is not None
                        else None
                    ),
                    str(error.get("valorEsperado")) if error.get("valorEsperado") is not None else None,
                )

                if key in seen:
                    continue

                seen.add(key)
                merged.append(error)

        return merged

    def _merge_unique_rules(self, *rule_lists):
        merged = []
        seen = set()

        for rule_list in rule_lists:
            if isinstance(rule_list, str):
                candidates = [rule_list]
            else:
                candidates = rule_list or []

            for rule in candidates:
                if not rule or rule in seen:
                    continue

                seen.add(rule)
                merged.append(rule)

        return merged

    def _oep_log_type(self, error):
        codigo = (error.get("codigo") or "").upper()
        fuente = (error.get("fuente") or "").upper()

        if fuente in ["CSV_OBSERVATION", "CSV_CASO_ESPECIAL"]:
            return "OBSERVACION_ACTA"
        if codigo.startswith("HORARIO_") or codigo.startswith("CIERRE_") or codigo.startswith("HORA_"):
            return "HORARIO_INVALIDO"
        if codigo.startswith("FECHA_"):
            return "FECHA_INVALIDA"
        if (
            codigo.startswith("FORMULARIO_")
            or codigo.startswith("FORMATO_")
            or codigo.startswith("ENCABEZADO_")
            or codigo.startswith("MARCADORES_")
            or codigo.startswith("ZONA_RESULTADOS_")
        ):
            return "FORMULARIO_INVALIDO"
        if (
            codigo.startswith("FIRMAS_")
            or codigo.startswith("HUELLAS_")
            or codigo.startswith("ZONA_JURADOS_")
            or codigo.startswith("ZONA_FIRMAS_")
        ):
            return "FIRMA_HUELLA_INVALIDA"
        if codigo.startswith("MESA_"):
            return "MESA_INVALIDA"
        if codigo.startswith("RECINTO_") or codigo.startswith("UBICACION_"):
            return "UBICACION_INVALIDA"
        if (
            codigo.startswith("TOTAL_")
            or codigo.startswith("SUMA_")
            or codigo.startswith("VOTO_")
            or codigo.startswith("VOTOS_")
            or codigo.startswith("PAPELETAS_NO_COINCIDEN_")
        ):
            return "TOTAL_INCOHERENTE"
        if codigo.startswith("PAPELETAS_NO_AUTORIZADAS_") or codigo.startswith("FORMULARIO_O_PAPELETA_"):
            return "PAPELETA_INVALIDA"
        if (
            codigo.startswith("TACHADURA_")
            or codigo.startswith("BORRON_")
            or codigo.startswith("ENMIENDA_")
            or codigo.startswith("ALTERACION_")
            or codigo.startswith("OBSERVACION_")
        ):
            return "OBSERVACION_ACTA"
        if codigo.startswith("IMAGEN_") or codigo.startswith("ACTA_") or codigo.startswith("DATOS_"):
            return "OBSERVACION_ACTA"

        return "OBSERVACION_ACTA"

    def _get_csv_metadata_for_acta(self, acta):
        codigo_mesa = (
            (acta or {}).get("codigoMesa")
            or (acta or {}).get("codigoActa")
        )

        try:
            return get_csv_validation_metadata(codigo_mesa)
        except Exception as error:
            self._safe_register_log(
                tipo="SISTEMA",
                severidad="WARNING",
                mensaje="No se pudo consultar CSV de observaciones OEP",
                detalle=str(error),
                acta_id=(acta or {}).get("actaId"),
                codigo_mesa=codigo_mesa,
                datos_referencia={"fase": "CSV_OBSERVACIONES"},
            )
            return {
                "codigoMesa": codigo_mesa,
                "observacionOficial": None,
                "casoEspecialCSV": None,
                "casosEspecialesCSV": [],
            }

    def _apply_oep_validation(self, acta, extracted_text=None, visual_quality=None, now=None):
        now = now or datetime.now(timezone.utc)
        acta = acta or {}
        validacion = acta.setdefault("validacion", {})
        datos_acta = acta.setdefault("datosActa", {})
        previous_state = acta.get("estado")

        csv_metadata = self._get_csv_metadata_for_acta(acta)
        official_observation = csv_metadata.get("observacionOficial")
        special_case = csv_metadata.get("casoEspecialCSV")

        oep_result = validate_oep_inconsistencies(
            acta,
            extracted_text=extracted_text,
            visual_quality=visual_quality,
            official_observation=official_observation,
            special_case_note=special_case,
        )

        oep_errors = oep_result.get("errores") or []
        oep_rules = oep_result.get("reglasEjecutadas") or []

        validacion["errores"] = self._merge_unique_errors(
            validacion.get("errores") or [],
            oep_errors,
        )
        validacion["reglasEjecutadas"] = self._merge_unique_rules(
            validacion.get("reglasEjecutadas") or [],
            oep_rules,
        )
        validacion["observacionesDetectadas"] = oep_result.get("observacionesDetectadas") or {}

        if official_observation:
            validacion["observacionOficial"] = official_observation
            datos_acta["observacionTranscripcion"] = official_observation

        if special_case:
            validacion["casoEspecialCSV"] = special_case
            validacion["casosEspecialesCSV"] = csv_metadata.get("casosEspecialesCSV") or []
            datos_acta["casoEspecialCSV"] = special_case

        suggested_state = oep_result.get("estadoSugerido")
        final_state = self._strongest_state(previous_state, suggested_state)

        acta["estado"] = final_state
        validacion.update(
            self._flags_for_state(
                final_state,
                es_duplicada=validacion.get("esDuplicada", False),
            )
        )
        validacion["fechaValidacion"] = now

        return {
            "result": oep_result,
            "previousState": previous_state,
            "finalState": final_state,
            "officialObservation": official_observation,
            "specialCase": special_case,
        }

    def _copy_oep_mutations_to_update(self, set_data, draft_acta):
        """Persist validator repairs that mutate the draft acta in memory."""
        draft_acta = draft_acta or {}

        for key in ["codigoMesa", "numeroMesa", "codigoRecinto", "ubicacion"]:
            if draft_acta.get(key) is not None:
                set_data[key] = draft_acta.get(key)

        # Persist territorial enrichment when present (does NOT change state).
        if draft_acta.get("territorioOficial") is not None:
            set_data["territorioOficial"] = draft_acta.get("territorioOficial")

        datos_acta = draft_acta.get("datosActa") or {}
        for key in [
            "cantidadHabilitados",
            "papeletasEnAnfora",
            "papeletasNoUtilizadas",
            "horaApertura",
            "horaCierre",
        ]:
            if key in datos_acta:
                set_data[f"datosActa.{key}"] = datos_acta.get(key)

        resultados = draft_acta.get("resultados") or {}
        if "presidente" in resultados:
            set_data["resultados.presidente"] = resultados.get("presidente") or {}
        if "diputadoUninominal" in resultados:
            set_data["resultados.diputadoUninominal"] = (
                resultados.get("diputadoUninominal") or {}
            )

        validacion = draft_acta.get("validacion") or {}
        if "normalizacionesOCR" in validacion:
            set_data["validacion.normalizacionesOCR"] = (
                validacion.get("normalizacionesOCR") or []
            )
        if "normalizacionesTexto" in validacion:
            set_data["validacion.normalizacionesTexto"] = (
                validacion.get("normalizacionesTexto") or []
            )

    def _emit_oep_logs_and_events(self, acta, oep_context, endpoint=None):
        if not oep_context:
            return

        oep_result = oep_context.get("result") or {}
        previous_state = oep_context.get("previousState")
        final_state = oep_context.get("finalState")
        acta_id = (acta or {}).get("actaId")
        codigo_mesa = (acta or {}).get("codigoMesa")
        errors = oep_result.get("errores") or []

        for error in errors:
            severidad = error.get("severidad")
            if severidad not in ["WARNING", "ERROR", "CRITICAL"]:
                continue

            self._safe_register_log(
                tipo=self._oep_log_type(error),
                severidad=severidad,
                mensaje=f"Validacion OEP detecto {error.get('codigo')}",
                detalle=error.get("descripcion"),
                acta_id=acta_id,
                codigo_mesa=codigo_mesa,
                datos_referencia={
                    "endpoint": endpoint,
                    "errorOEP": error,
                    "estadoAnterior": previous_state,
                    "estadoFinal": final_state,
                },
            )

        has_internal_error = any(
            error.get("codigo") == "OEP_VALIDADOR_ERROR_INTERNO"
            for error in errors
        )

        if has_internal_error:
            self._safe_register_event(
                tipo="ERROR_PROCESAMIENTO",
                acta_id=acta_id,
                codigo_mesa=codigo_mesa,
                mensaje="Validador OEP fallo internamente",
                datos_referencia={
                    "endpoint": endpoint,
                    "estadoFinal": final_state,
                    "errores": errors,
                },
            )
            return

        tipo_evento = None

        if final_state == "SOSPECHOSA" and final_state != previous_state:
            tipo_evento = "ACTA_SOSPECHOSA"
        elif final_state == "RECHAZADA" and final_state != previous_state:
            tipo_evento = "ACTA_RECHAZADA"
        elif final_state == "PENDIENTE_REVISION" and final_state != previous_state:
            tipo_evento = "ACTA_AUTO_PENDIENTE_REVISION"
        elif final_state == "VALIDADA":
            tipo_evento = "ACTA_VALIDADA"

        if tipo_evento:
            self._safe_register_event(
                tipo=tipo_evento,
                acta_id=acta_id,
                codigo_mesa=codigo_mesa,
                mensaje=f"Validacion OEP finalizo con estado {final_state}",
                datos_referencia={
                    "endpoint": endpoint,
                    "estadoAnterior": previous_state,
                    "estadoFinal": final_state,
                    "erroresOEP": [error.get("codigo") for error in errors],
                    "observacionOficial": oep_context.get("officialObservation"),
                    "casoEspecialCSV": oep_context.get("specialCase"),
                },
            )

    @staticmethod
    def _merge_ubicacion_with_territory(ubicacion, territorio_oficial):
        """Devuelve una ubicacion donde los campos vacios caen a territorioOficial.

        Nunca sobrescribe valores no vacios de la ubicacion extraida; eso
        seguiria activando inconsistencias OEP. Solo rellena huecos para que el
        dashboard pueda agrupar.
        """
        ubicacion = ubicacion or {}
        territorio = territorio_oficial or {}
        recinto_acta = ubicacion.get("recinto") or {}
        recinto_oficial = territorio.get("recinto") or {}

        if not territorio.get("resuelto"):
            return {
                "departamento": ubicacion.get("departamento"),
                "provincia": ubicacion.get("provincia"),
                "municipio": ubicacion.get("municipio"),
                "recinto": {
                    "nombre": recinto_acta.get("nombre"),
                    "direccion": recinto_acta.get("direccion"),
                },
            }

        return {
            "departamento": ubicacion.get("departamento") or territorio.get("departamento"),
            "provincia": ubicacion.get("provincia") or territorio.get("provincia"),
            "municipio": ubicacion.get("municipio") or territorio.get("municipio"),
            "recinto": {
                "nombre": recinto_acta.get("nombre") or recinto_oficial.get("nombre"),
                "direccion": recinto_acta.get("direccion") or recinto_oficial.get("direccion"),
            },
        }

    def _build_resultado_document(self, acta):
        now = datetime.now(timezone.utc)
        acta = acta or {}
        acta_id = acta.get("actaId")
        validacion = acta.get("validacion") or {}
        resultados = acta.get("resultados") or {}
        presidente = resultados.get("presidente") or {}
        diputado = resultados.get("diputadoUninominal") or {}
        estado = acta.get("estado")

        incluido = (
            estado in ["VALIDADA", "PUBLICADA"]
            and validacion.get("esDuplicada") is not True
            and validacion.get("esSospechosa") is not True
            and validacion.get("requiereRevisionManual") is not True
        )

        archivo = acta.get("archivo") or {}

        # Enriquecimiento geografico: usa la ubicacion extraida si existe; si
        # esta vacia, cae a territorioOficial. Nunca sobrescribe ubicacion no
        # vacia (la posible inconsistencia ya quedo registrada en validacion).
        ubicacion_acta = acta.get("ubicacion") or {}
        territorio_oficial = acta.get("territorioOficial") or {}
        ubicacion_doc = self._merge_ubicacion_with_territory(
            ubicacion_acta, territorio_oficial
        )

        return {
            "resultadoId": f"RES-{acta_id}",
            "actaId": acta_id,
            "codigoMesa": acta.get("codigoMesa"),
            "numeroMesa": acta.get("numeroMesa"),
            "codigoRecinto": acta.get("codigoRecinto"),
            "estadoActa": estado,
            "incluidoEnDashboard": incluido,
            "fuente": acta.get("fuente"),
            "source": acta.get("source") or {},
            "ubicacion": ubicacion_doc,
            "territorioOficial": territorio_oficial or None,
            "archivo": {
                "nombreOriginal": archivo.get("nombreOriginal"),
                "hashArchivo": archivo.get("hashArchivo"),
                "urlArchivo": archivo.get("urlArchivo"),
            },
            "presidente": {
                "votosPartidos": presidente.get("votosPartidos") or [],
                "votosValidos": presidente.get("votosValidos") or 0,
                "votosBlancos": presidente.get("votosBlancos") or 0,
                "votosNulos": presidente.get("votosNulos") or 0,
                "totalVotos": presidente.get("totalVotos") or 0,
            },
            "diputadoUninominal": diputado,
            "validacionResumen": {
                "esValida": validacion.get("esValida", False),
                "esDuplicada": validacion.get("esDuplicada", False),
                "esSospechosa": validacion.get("esSospechosa", False),
                "requiereRevisionManual": validacion.get("requiereRevisionManual", False),
                "observacionOficial": validacion.get("observacionOficial"),
                "casoEspecialCSV": validacion.get("casoEspecialCSV"),
            },
            "createdAt": acta.get("createdAt") or now,
            "updatedAt": now,
        }

    def _has_result_data(self, acta):
        presidente = ((acta or {}).get("resultados") or {}).get("presidente") or {}
        return bool(
            presidente.get("votosPartidos")
            or presidente.get("votosValidos")
            or presidente.get("votosBlancos")
            or presidente.get("votosNulos")
            or presidente.get("totalVotos")
        )

    def _safe_upsert_resultado(self, acta, endpoint=None, require_results=False):
        if not acta or not acta.get("actaId"):
            return None

        if require_results and not self._has_result_data(acta):
            return None

        try:
            return self.repository.upsert_resultado(
                self._build_resultado_document(acta)
            )
        except Exception as error:
            self._safe_register_log(
                tipo="SISTEMA",
                severidad="WARNING",
                mensaje="No se pudo actualizar rrv_resultados",
                detalle=str(error),
                acta_id=acta.get("actaId"),
                codigo_mesa=acta.get("codigoMesa"),
                datos_referencia={
                    "endpoint": endpoint,
                    "estadoActa": acta.get("estado"),
                },
            )
            return None

    def generate_acta_id(self):
        return f"RRV-2026-{uuid4().hex[:8].upper()}"

    def get_file_extension(self, filename):
        return Path(filename).suffix.lower()

    def run_visual_quality_analysis(
        self,
        file_path,
        content_type,
        pdf_text,
        acta_id,
        codigo_mesa
    ):
        try:
            visual_result = self.visual_quality_service.analyze(
                file_path=str(file_path),
                content_type=content_type,
                pdf_text=pdf_text
            )
        except Exception as error:
            self.log_service.register_log(
                tipo="SISTEMA",
                severidad="WARNING",
                mensaje="Fallo no critico en analisis de calidad visual",
                detalle=str(error),
                acta_id=acta_id,
                codigo_mesa=codigo_mesa,
                datos_referencia={"contentType": content_type}
            )
            return self.visual_quality_service.empty_result()

        if visual_result.get("tieneProblemasVisuales"):
            self.log_service.register_log(
                tipo="ERROR_IMAGEN",
                severidad="WARNING",
                mensaje="Acta con incidentes visuales detectados (advertencia, no afecta estado)",
                detalle=", ".join(
                    item["codigo"]
                    for item in visual_result.get("erroresVisuales", [])
                ),
                acta_id=acta_id,
                codigo_mesa=codigo_mesa,
                datos_referencia={
                    "metricas": visual_result.get("metricas", {}),
                    "afectaZonaCritica": visual_result.get("afectaZonaCritica", False),
                    "requiereRevisionManual": visual_result.get("requiereRevisionManual", False),
                    "erroresVisuales": [
                        {
                            "codigo": item.get("codigo"),
                            "severidad": item.get("severidad")
                        }
                        for item in visual_result.get("erroresVisuales", [])
                    ]
                }
            )

        return visual_result

    async def receive_acta(
        self,
        archivo,
        codigo_mesa,
        numero_mesa,
        codigo_recinto,
        usuario_id,
        nombre_operador,
        dispositivo,
        latitud,
        longitud,
        ip_origen,
        source_tipo=None
    ):
        file_bytes = await archivo.read()

        validate_uploaded_file(
            filename=archivo.filename,
            content_type=archivo.content_type,
            file_bytes=file_bytes
        )

        now = datetime.now(timezone.utc)
        acta_id = self.generate_acta_id()
        hash_archivo = calculate_sha256(file_bytes)
        tamanio_mb = round(len(file_bytes) / (1024 * 1024), 4)

        acta_hash_existente = self.repository.find_acta_by_hash(hash_archivo)
        actas_misma_mesa = self.repository.find_actas_by_codigo_mesa(codigo_mesa)

        es_duplicada = acta_hash_existente is not None or len(actas_misma_mesa) > 0
        estado = "SOSPECHOSA" if es_duplicada else "RECIBIDA"

        errores_validacion = []
        reglas_ejecutadas = ["VALIDACION_ARCHIVO", "CALCULO_HASH", "DETECCION_DUPLICADOS"]

        if acta_hash_existente:
            errores_validacion.append({
                "codigo": "HASH_DUPLICADO",
                "descripcion": "Ya existe un acta registrada con el mismo hash de archivo",
                "severidad": "WARNING"
            })

        if actas_misma_mesa:
            errores_validacion.append({
                "codigo": "MESA_DUPLICADA",
                "descripcion": "Ya existe al menos un acta registrada para la misma mesa",
                "severidad": "WARNING"
            })

        extension = self.get_file_extension(archivo.filename)
        stored_filename = f"{acta_id}{extension}"
        upload_path = Path(UPLOAD_DIR)
        upload_path.mkdir(parents=True, exist_ok=True)

        file_path = upload_path / stored_filename

        with open(file_path, "wb") as output_file:
            output_file.write(file_bytes)

        source = acta_source_for_manual(usuario_id)

        if source_tipo:
            source["tipo"] = source_tipo.strip().upper() or source["tipo"]

        acta_data = {
            "actaId": acta_id,
            "codigoMesa": codigo_mesa,
            "numeroMesa": numero_mesa,
            "codigoRecinto": codigo_recinto,
            "fuente": "APP_MOVIL_O_CARGA_WEB",
            "source": source,
            "estado": estado,
            "ubicacion": {
                "departamento": None,
                "provincia": None,
                "municipio": None,
                "recinto": {
                    "nombre": None,
                    "direccion": None
                }
            },
            "archivo": {
                "nombreOriginal": archivo.filename,
                "tipoArchivo": archivo.content_type,
                "urlArchivo": str(file_path).replace("\\", "/"),
                "hashArchivo": hash_archivo,
                "tamanioMb": tamanio_mb,
                "fechaRecepcion": now
            },
            "datosActa": {
                "cantidadHabilitados": None,
                "papeletasEnAnfora": None,
                "papeletasNoUtilizadas": None,
                "horaApertura": None,
                "horaCierre": None
            },
            "qr": {
                "detectado": False,
                "contenido": None,
                "codigoMesaQr": None,
                "coincideConMesa": False
            },
            "ocr": {
                "procesado": False,
                "motorOCR": None,
                "confianzaPromedio": None,
                "textoExtraido": None,
                "erroresOCR": [],
                "fechaProcesamiento": None
            },
            "resultados": {
                "presidente": {
                    "votosPartidos": [],
                    "votosValidos": 0,
                    "votosBlancos": 0,
                    "votosNulos": 0,
                    "totalVotos": 0
                },
                "diputadoUninominal": {
                    "votosPartidos": [],
                    "votosValidos": 0,
                    "votosBlancos": 0,
                    "votosNulos": 0,
                    "totalVotos": 0
                }
            },
            "validacion": {
                "esValida": False,
                "esDuplicada": es_duplicada,
                "esSospechosa": es_duplicada,
                "requiereRevisionManual": es_duplicada,
                "errores": errores_validacion,
                "reglasEjecutadas": reglas_ejecutadas,
                "fechaValidacion": now
            },
            "auditoriaRecepcion": {
                "usuarioId": usuario_id,
                "nombreOperador": nombre_operador,
                "ipOrigen": ip_origen,
                "dispositivo": dispositivo,
                "ubicacionGps": {
                    "latitud": latitud,
                    "longitud": longitud
                },
                "fechaRegistroSistema": now
            },
            "createdAt": now,
            "updatedAt": now
        }

        self._complete_codigo_recinto_from_actas_impresas(acta_data)
        self._enrich_official_territory(acta_data)

        insert_result = self._safe_insert_acta(
            acta_data=acta_data,
            file_bytes=file_bytes,
            archivo=archivo,
            file_path=file_path,
        )

        if not insert_result["ok"]:
            return {
                "success": False,
                "message": (
                    "Acta no pudo persistirse en MongoDB; "
                    "respaldo local generado en storage/revision"
                ),
                "codigoError": "MONGO_WRITE_ERROR",
                "actaId": acta_id,
                "estado": "PENDIENTE_REVISION",
                "requiereRevisionManual": True,
                "backupRevision": insert_result["backup"],
                "errorMongo": insert_result["error"],
            }

        self._safe_upsert_resultado(
            acta_data,
            endpoint="POST /api/rrv/actas",
            require_results=True,
        )

        self._safe_register_event(
            tipo="ACTA_RECIBIDA",
            acta_id=acta_id,
            codigo_mesa=codigo_mesa,
            mensaje="Acta recibida correctamente en el flujo rápido RRV",
            datos_referencia={
                "codigoRecinto": codigo_recinto,
                "hashArchivo": hash_archivo,
                "tipoArchivo": archivo.content_type,
                "estado": estado
            }
        )

        if es_duplicada:
            try:
                modificadas = self.repository.mark_conflicting_actas_as_suspicious(
                    codigo_mesa=codigo_mesa,
                    hash_archivo=hash_archivo,
                    except_acta_id=acta_id
                )
            except Exception as error:
                append_revision_log(
                    f"FALLBACK_MARK_CONFLICT_FAIL acta_id={acta_id} motivo={error}"
                )
                modificadas = 0

            self._safe_register_event(
                tipo="DUPLICADO_DETECTADO",
                acta_id=acta_id,
                codigo_mesa=codigo_mesa,
                mensaje="Se detectó un posible duplicado de acta",
                datos_referencia={
                    "hashDuplicado": acta_hash_existente is not None,
                    "mesaDuplicada": len(actas_misma_mesa) > 0,
                    "actasPreviasModificadas": modificadas
                }
            )

            self._safe_register_log(
                tipo="DUPLICADO",
                severidad="WARNING",
                mensaje="Acta duplicada o conflicto de mesa detectado",
                detalle="La nueva acta fue guardada y marcada para revisión. No se reemplazó automáticamente ningún registro previo.",
                acta_id=acta_id,
                codigo_mesa=codigo_mesa,
                datos_referencia={
                    "hashDuplicado": acta_hash_existente is not None,
                    "mesaDuplicada": len(actas_misma_mesa) > 0
                }
            )

        return {
            "success": True,
            "message": "Acta recibida correctamente",
            "actaId": acta_id,
            "estado": estado,
            "esDuplicada": es_duplicada,
            "requiereRevisionManual": es_duplicada
        }

    async def receive_acta_auto(
        self,
        archivo,
        usuario_id,
        nombre_operador,
        dispositivo,
        latitud,
        longitud,
        ip_origen,
        source_tipo=None
    ):
        file_bytes = await archivo.read()

        validate_uploaded_file(
            filename=archivo.filename,
            content_type=archivo.content_type,
            file_bytes=file_bytes
        )

        now = datetime.now(timezone.utc)
        acta_id = self.generate_acta_id()
        hash_archivo = calculate_sha256(file_bytes)
        tamanio_mb = round(len(file_bytes) / (1024 * 1024), 4)

        extension = self.get_file_extension(archivo.filename)
        stored_filename = f"{acta_id}{extension}"
        upload_path = Path(UPLOAD_DIR)
        upload_path.mkdir(parents=True, exist_ok=True)

        file_path = upload_path / stored_filename

        with open(file_path, "wb") as output_file:
            output_file.write(file_bytes)

        metadata = None
        extraction_method = None
        pdf_diagnosis = None
        pdf_plano_detectado = False

        if archivo.content_type == "application/pdf":
            try:
                pdf_diagnosis = self.ocr_service.inspect_pdf(str(file_path))
            except Exception as error:
                pdf_diagnosis = {
                    "canOpen": False,
                    "hasUsefulText": False,
                    "text": "",
                    "error": f"INSPECT_PDF_FAILED: {error}",
                }

            if not pdf_diagnosis.get("canOpen"):
                # PDF corrupto -> RECHAZADA (no se intenta OCR).
                self._safe_register_log(
                    tipo="ARCHIVO_INVALIDO",
                    severidad="ERROR",
                    mensaje="PDF corrupto o no se puede abrir, acta rechazada",
                    detalle=str(pdf_diagnosis.get("error")),
                    acta_id=acta_id,
                    codigo_mesa=None,
                    datos_referencia={
                        "tipoArchivo": archivo.content_type,
                        "hashArchivo": hash_archivo,
                    },
                )

                visual_quality_corrupt = self.run_visual_quality_analysis(
                    file_path=file_path,
                    content_type=archivo.content_type,
                    pdf_text=None,
                    acta_id=acta_id,
                    codigo_mesa=None,
                )

                acta_data = self.build_auto_acta_document(
                    acta_id=acta_id,
                    archivo=archivo,
                    file_path=file_path,
                    hash_archivo=hash_archivo,
                    tamanio_mb=tamanio_mb,
                    now=now,
                    metadata=None,
                    extraction_method=None,
                    usuario_id=usuario_id,
                    nombre_operador=nombre_operador,
                    dispositivo=dispositivo,
                    latitud=latitud,
                    longitud=longitud,
                    ip_origen=ip_origen,
                    estado="RECHAZADA",
                    inconsistencias=[{
                        "codigo": "PDF_CORRUPTO",
                        "descripcion": "El PDF no se pudo abrir",
                        "severidad": "ERROR",
                    }],
                    duplicate_info={"esDuplicada": False, "errores": []},
                    visual_quality=visual_quality_corrupt,
                    source_tipo=source_tipo,
                )

                insert_result = self._safe_insert_acta(
                    acta_data=acta_data,
                    file_bytes=file_bytes,
                    archivo=archivo,
                    file_path=file_path,
                )

                if not insert_result["ok"]:
                    return {
                        "success": False,
                        "message": (
                            "Acta automatica rechazada (PDF corrupto) y "
                            "MongoDB no disponible: respaldo en storage/revision"
                        ),
                        "codigoError": "MONGO_WRITE_ERROR",
                        "actaId": acta_id,
                        "estado": "RECHAZADA",
                        "requiereRevisionManual": True,
                        "backupRevision": insert_result["backup"],
                        "errorMongo": insert_result["error"],
                    }

                self._safe_upsert_resultado(
                    acta_data,
                    endpoint="POST /api/rrv/actas/auto",
                )

                return {
                    "success": True,
                    "message": "PDF corrupto: acta marcada como RECHAZADA",
                    "actaId": acta_id,
                    "estado": "RECHAZADA",
                    "codigoError": "PDF_CORRUPTO",
                    "requiereRevisionManual": True,
                    "metodoExtraccion": None,
                }

            if pdf_diagnosis.get("hasUsefulText"):
                metadata = self.ocr_service.extract_acta_metadata_from_pdf(
                    str(file_path),
                    acta_id=acta_id
                )

                if metadata is not None:
                    extraction_method = "pdf-text-extraction"
            else:
                pdf_plano_detectado = True

                self._safe_register_log(
                    tipo="PDF_PLANO",
                    severidad="WARNING",
                    mensaje=(
                        "PDF sin texto digital util (PDF plano / escaneado); "
                        "queda en PENDIENTE_REVISION para OCR posterior"
                    ),
                    detalle=(
                        "El PDF se abrio correctamente pero no contiene texto "
                        "extraible. Use POST /api/rrv/actas/{actaId}/procesar-ocr "
                        "para ejecutar OCR sobre la imagen."
                    ),
                    acta_id=acta_id,
                    codigo_mesa=None,
                    datos_referencia={
                        "tipoArchivo": archivo.content_type,
                        "hashArchivo": hash_archivo,
                    },
                )

                self._safe_register_event(
                    tipo="ACTA_AUTO_PENDIENTE_REVISION",
                    acta_id=acta_id,
                    codigo_mesa=None,
                    mensaje=(
                        "PDF plano detectado: requiere OCR para extraer datos"
                    ),
                    datos_referencia={
                        "tipoArchivo": archivo.content_type,
                        "hashArchivo": hash_archivo,
                        "pdfPlano": True,
                    },
                )

        if metadata is None:
            self._safe_register_event(
                tipo="ACTA_AUTO_PENDIENTE_REVISION",
                acta_id=acta_id,
                codigo_mesa=None,
                mensaje="No se pudo extraer metadatos automaticos del archivo",
                datos_referencia={
                    "tipoArchivo": archivo.content_type,
                    "hashArchivo": hash_archivo,
                    "pdfPlano": pdf_plano_detectado,
                }
            )

            self._safe_register_log(
                tipo="EXTRACCION_AUTOMATICA",
                severidad="WARNING",
                mensaje="Extraccion automatica fallida - acta queda en PENDIENTE_REVISION",
                detalle=(
                    "PDF plano detectado: requiere OCR posterior."
                    if pdf_plano_detectado
                    else "No se pudieron leer metadatos del PDF y no hay fallback automatico para imagenes en /actas/auto"
                ),
                acta_id=acta_id,
                codigo_mesa=None,
                datos_referencia={
                    "tipoArchivo": archivo.content_type,
                    "pdfPlano": pdf_plano_detectado,
                }
            )

            visual_quality_fallback = self.run_visual_quality_analysis(
                file_path=file_path,
                content_type=archivo.content_type,
                pdf_text=None,
                acta_id=acta_id,
                codigo_mesa=None
            )

            acta_data = self.build_auto_acta_document(
                acta_id=acta_id,
                archivo=archivo,
                file_path=file_path,
                hash_archivo=hash_archivo,
                tamanio_mb=tamanio_mb,
                now=now,
                metadata=None,
                extraction_method=None,
                usuario_id=usuario_id,
                nombre_operador=nombre_operador,
                dispositivo=dispositivo,
                latitud=latitud,
                longitud=longitud,
                ip_origen=ip_origen,
                estado="PENDIENTE_REVISION",
                inconsistencias=[],
                duplicate_info={"esDuplicada": False, "errores": []},
                visual_quality=visual_quality_fallback,
                source_tipo=source_tipo
            )

            insert_result = self._safe_insert_acta(
                acta_data=acta_data,
                file_bytes=file_bytes,
                archivo=archivo,
                file_path=file_path,
            )

            if not insert_result["ok"]:
                return {
                    "success": False,
                    "message": (
                        "Acta automatica no pudo persistirse en MongoDB; "
                        "respaldo local generado en storage/revision"
                    ),
                    "codigoError": "MONGO_WRITE_ERROR",
                    "actaId": acta_id,
                    "estado": "PENDIENTE_REVISION",
                    "requiereRevisionManual": True,
                    "backupRevision": insert_result["backup"],
                    "errorMongo": insert_result["error"],
                }

            self._safe_upsert_resultado(
                acta_data,
                endpoint="POST /api/rrv/actas/auto",
            )

            return {
                "success": True,
                "message": (
                    "PDF plano detectado: requiere OCR posterior; acta queda en PENDIENTE_REVISION"
                    if pdf_plano_detectado
                    else "Acta recibida pero no fue posible extraer metadatos automaticamente"
                ),
                "actaId": acta_id,
                "estado": "PENDIENTE_REVISION",
                "requiereRevisionManual": True,
                "metodoExtraccion": None,
                "pdfPlano": pdf_plano_detectado
            }

        metadata = self.resolver_cantidad_habilitados(metadata)
        codigo_mesa = metadata["codigoMesa"]

        acta_hash_existente = self.repository.find_acta_by_hash(hash_archivo)
        actas_misma_mesa = self.repository.find_actas_by_codigo_mesa(codigo_mesa)

        duplicate_errors = []
        es_duplicada = False

        if acta_hash_existente is not None:
            es_duplicada = True
            duplicate_errors.append({
                "codigo": "HASH_DUPLICADO",
                "descripcion": "Ya existe un acta registrada con el mismo hash de archivo",
                "severidad": "WARNING"
            })

        if actas_misma_mesa:
            es_duplicada = True
            duplicate_errors.append({
                "codigo": "MESA_DUPLICADA",
                "descripcion": "Ya existe al menos un acta registrada para la misma mesa",
                "severidad": "WARNING"
            })

        inconsistencias = self.validate_extracted_acta_metadata(metadata)

        visual_quality = self.run_visual_quality_analysis(
            file_path=file_path,
            content_type=archivo.content_type,
            pdf_text=metadata.get("textoExtraido") if metadata else None,
            acta_id=acta_id,
            codigo_mesa=codigo_mesa
        )

        if es_duplicada or inconsistencias:
            estado = "SOSPECHOSA"
        else:
            estado = "VALIDADA"

        acta_data = self.build_auto_acta_document(
            acta_id=acta_id,
            archivo=archivo,
            file_path=file_path,
            hash_archivo=hash_archivo,
            tamanio_mb=tamanio_mb,
            now=now,
            metadata=metadata,
            extraction_method=extraction_method,
            usuario_id=usuario_id,
            nombre_operador=nombre_operador,
            dispositivo=dispositivo,
            latitud=latitud,
            longitud=longitud,
            ip_origen=ip_origen,
            estado=estado,
            inconsistencias=inconsistencias,
            duplicate_info={"esDuplicada": es_duplicada, "errores": duplicate_errors},
            visual_quality=visual_quality,
            source_tipo=source_tipo
        )

        oep_context = self._apply_oep_validation(
            acta_data,
            extracted_text=metadata.get("textoExtraido"),
            visual_quality=visual_quality,
            now=now,
        )
        estado = acta_data["estado"]

        insert_result = self._safe_insert_acta(
            acta_data=acta_data,
            file_bytes=file_bytes,
            archivo=archivo,
            file_path=file_path,
        )

        if not insert_result["ok"]:
            return {
                "success": False,
                "message": (
                    "Acta automatica no pudo persistirse en MongoDB; "
                    "respaldo local generado en storage/revision"
                ),
                "codigoError": "MONGO_WRITE_ERROR",
                "actaId": acta_id,
                "estado": "PENDIENTE_REVISION",
                "codigoMesa": codigo_mesa,
                "numeroMesa": metadata["numeroMesa"],
                "requiereRevisionManual": True,
                "backupRevision": insert_result["backup"],
                "errorMongo": insert_result["error"],
            }

        self._safe_upsert_resultado(
            acta_data,
            endpoint="POST /api/rrv/actas/auto",
        )
        self._emit_oep_logs_and_events(
            acta_data,
            oep_context,
            endpoint="POST /api/rrv/actas/auto",
        )

        self._safe_register_event(
            tipo="ACTA_AUTO_INGRESADA",
            acta_id=acta_id,
            codigo_mesa=codigo_mesa,
            mensaje="Acta ingresada automaticamente via PDF",
            datos_referencia={
                "estado": estado,
                "metodoExtraccion": extraction_method,
                "hashArchivo": hash_archivo,
                "esDuplicada": es_duplicada,
                "inconsistencias": [item["codigo"] for item in inconsistencias]
            }
        )

        if es_duplicada:
            try:
                modificadas = self.repository.mark_conflicting_actas_as_suspicious(
                    codigo_mesa=codigo_mesa,
                    hash_archivo=hash_archivo,
                    except_acta_id=acta_id
                )
            except Exception as error:
                append_revision_log(
                    f"FALLBACK_MARK_CONFLICT_FAIL acta_id={acta_id} motivo={error}"
                )
                modificadas = 0

            self._safe_register_log(
                tipo="DUPLICADO",
                severidad="WARNING",
                mensaje="Acta automatica duplicada o conflicto de mesa detectado",
                detalle="La nueva acta fue almacenada y marcada como SOSPECHOSA. No se reemplazo ningun registro previo.",
                acta_id=acta_id,
                codigo_mesa=codigo_mesa,
                datos_referencia={
                    "hashDuplicado": acta_hash_existente is not None,
                    "mesaDuplicada": len(actas_misma_mesa) > 0,
                    "actasPreviasModificadas": modificadas
                }
            )

        if inconsistencias:
            self._safe_register_log(
                tipo="VALIDACION_AUTOMATICA",
                severidad="WARNING",
                mensaje="Acta automatica con inconsistencias",
                detalle=", ".join(item["codigo"] for item in inconsistencias),
                acta_id=acta_id,
                codigo_mesa=codigo_mesa,
                datos_referencia={"inconsistencias": inconsistencias}
            )

        if visual_quality.get("tieneProblemasVisuales"):
            self._safe_register_event(
                tipo="ACTA_VALIDADA" if estado == "VALIDADA" else "ACTA_SOSPECHOSA",
                acta_id=acta_id,
                codigo_mesa=codigo_mesa,
                mensaje="Acta con observaciones visuales (advertencia, no afecta estado)",
                datos_referencia={
                    "afectaZonaCritica": visual_quality.get("afectaZonaCritica", False),
                    "impactoLectura": visual_quality.get("impactoLectura", "NINGUNO"),
                    "soloAdvertencia": True,
                    "erroresVisuales": [
                        item.get("codigo")
                        for item in visual_quality.get("erroresVisuales", [])
                    ],
                    "metricas": visual_quality.get("metricas", {})
                }
            )

        return {
            "success": True,
            "message": "Acta procesada automaticamente",
            "actaId": acta_id,
            "estado": estado,
            "codigoMesa": codigo_mesa,
            "codigoRecinto": acta_data.get("codigoRecinto"),
            "numeroMesa": metadata["numeroMesa"],
            "esDuplicada": es_duplicada,
            "requiereRevisionManual": acta_data["validacion"].get("requiereRevisionManual", False),
            "metodoExtraccion": extraction_method,
            "inconsistencias": [
                item.get("codigo")
                for item in acta_data["validacion"].get("errores", [])
            ],
            "calidadVisual": {
                "tieneProblemasVisuales": visual_quality.get("tieneProblemasVisuales", False),
                "afectaZonaCritica": visual_quality.get("afectaZonaCritica", False),
                "requiereRevisionManual": visual_quality.get("requiereRevisionManual", False),
                "erroresVisuales": [
                    item.get("codigo")
                    for item in visual_quality.get("erroresVisuales", [])
                ]
            },
            "resultadosPresidente": {
                "votosPartidos": [
                    {"partidoCodigo": "P1", "cantidadVotos": metadata["votos"]["p1"]},
                    {"partidoCodigo": "P2", "cantidadVotos": metadata["votos"]["p2"]},
                    {"partidoCodigo": "P3", "cantidadVotos": metadata["votos"]["p3"]},
                    {"partidoCodigo": "P4", "cantidadVotos": metadata["votos"]["p4"]}
                ],
                "votosValidos": metadata["votos"]["votosValidos"],
                "votosBlancos": metadata["votos"]["votosBlancos"],
                "votosNulos": metadata["votos"]["votosNulos"],
                "totalVotos": metadata["votos"]["totalVotos"]
            },
            "datosActa": metadata["datosActa"]
        }

    def resolver_cantidad_habilitados(self, metadata):
        if metadata is None:
            return metadata

        datos = metadata.get("datosActa", {})

        cantidad_habilitados = datos.get("cantidadHabilitados")
        papeletas_anfora = datos.get("papeletasEnAnfora")
        papeletas_no_utilizadas = datos.get("papeletasNoUtilizadas")

        ya_derivada = metadata.get("cantidadHabilitadosDerivada", False)
        metadata["cantidadHabilitadosDerivada"] = ya_derivada

        if (
            cantidad_habilitados is None
            and papeletas_anfora is not None
            and papeletas_no_utilizadas is not None
        ):
            datos["cantidadHabilitados"] = int(papeletas_anfora) + int(papeletas_no_utilizadas)
            metadata["cantidadHabilitadosDerivada"] = True

        metadata["datosActa"] = datos
        return metadata

    def validate_extracted_acta_metadata(self, metadata):
        metadata = self.resolver_cantidad_habilitados(metadata)

        inconsistencias = []

        votos = metadata["votos"]
        datos = metadata["datosActa"]

        suma_partidos = votos["p1"] + votos["p2"] + votos["p3"] + votos["p4"]

        if suma_partidos != votos["votosValidos"]:
            inconsistencias.append({
                "codigo": "SUMA_PARTIDOS_NO_COINCIDE_VALIDOS",
                "descripcion": (
                    f"Suma de partidos ({suma_partidos}) "
                    f"!= votosValidos ({votos['votosValidos']})"
                ),
                "severidad": "WARNING"
            })

        total_calculado = votos["votosValidos"] + votos["votosBlancos"] + votos["votosNulos"]

        if total_calculado != votos["totalVotos"]:
            inconsistencias.append({
                "codigo": "TOTAL_INCOHERENTE",
                "descripcion": (
                    f"totalVotos ({votos['totalVotos']}) "
                    f"!= votosValidos+blancos+nulos ({total_calculado})"
                ),
                "severidad": "WARNING"
            })

        papeletas_anfora = datos.get("papeletasEnAnfora")
        papeletas_no_util = datos.get("papeletasNoUtilizadas")
        cantidad_habilitados = datos.get("cantidadHabilitados")

        if papeletas_anfora is not None and votos["totalVotos"] != papeletas_anfora:
            inconsistencias.append({
                "codigo": "TOTAL_NO_COINCIDE_PAPELETAS_ANFORA",
                "descripcion": (
                    f"totalVotos ({votos['totalVotos']}) "
                    f"!= papeletasEnAnfora ({papeletas_anfora})"
                ),
                "severidad": "WARNING"
            })

        if (
            papeletas_anfora is not None
            and papeletas_no_util is not None
            and cantidad_habilitados is not None
        ):
            suma_papeletas = int(papeletas_anfora) + int(papeletas_no_util)

            if suma_papeletas != int(cantidad_habilitados):
                inconsistencias.append({
                    "codigo": "PAPELETAS_NO_COINCIDEN_HABILITADOS",
                    "descripcion": (
                        f"papeletasEnAnfora+papeletasNoUtilizadas "
                        f"({suma_papeletas}) "
                        f"!= cantidadHabilitados ({cantidad_habilitados})"
                    ),
                    "severidad": "WARNING"
                })

        return inconsistencias

    def build_auto_acta_document(
        self,
        acta_id,
        archivo,
        file_path,
        hash_archivo,
        tamanio_mb,
        now,
        metadata,
        extraction_method,
        usuario_id,
        nombre_operador,
        dispositivo,
        latitud,
        longitud,
        ip_origen,
        estado,
        inconsistencias,
        duplicate_info,
        visual_quality=None,
        source_tipo=None
    ):
        if metadata is not None:
            metadata = self.resolver_cantidad_habilitados(metadata)

        es_duplicada = duplicate_info["esDuplicada"]
        duplicate_errors = duplicate_info["errores"]

        es_valida = estado == "VALIDADA"
        es_sospechosa = estado == "SOSPECHOSA"
        requiere_revision = estado != "VALIDADA"

        reglas_ejecutadas = [
            "VALIDACION_ARCHIVO",
            "CALCULO_HASH",
            "DETECCION_DUPLICADOS",
            "INGRESO_AUTOMATICO"
        ]

        if visual_quality and visual_quality.get("procesado"):
            reglas_ejecutadas.append("ANALISIS_CALIDAD_VISUAL")

        if metadata is not None:
            reglas_ejecutadas.extend([
                "EXTRACCION_PDF_TEXTO_NATIVO",
                "VALIDACION_SUMA_PARTIDOS_VS_VALIDOS",
                "VALIDACION_TOTAL_VOTOS_COHERENTE",
                "VALIDACION_TOTAL_VS_PAPELETAS_ANFORA",
                "VALIDACION_PAPELETAS_VS_HABILITADOS"
            ])

            inconsistencia_codigos = {item["codigo"] for item in inconsistencias}

            if metadata.get("cantidadHabilitadosDerivada"):
                reglas_ejecutadas.append("CANTIDAD_HABILITADOS_DERIVADA_DE_PAPELETAS")
            elif "PAPELETAS_NO_COINCIDEN_HABILITADOS" not in inconsistencia_codigos:
                reglas_ejecutadas.append("PAPELETAS_CUADRAN_CON_HABILITADOS")

            if "TOTAL_NO_COINCIDE_PAPELETAS_ANFORA" not in inconsistencia_codigos:
                reglas_ejecutadas.append("TOTAL_CUADRA_CON_PAPELETAS_ANFORA")

            if "SUMA_PARTIDOS_NO_COINCIDE_VALIDOS" not in inconsistencia_codigos:
                reglas_ejecutadas.append("SUMA_PARTIDOS_CUADRA_CON_VALIDOS")

        ubicacion = {
            "departamento": None,
            "provincia": None,
            "municipio": None,
            "recinto": {
                "nombre": None,
                "direccion": None
            }
        }

        datos_acta = {
            "cantidadHabilitados": None,
            "papeletasEnAnfora": None,
            "papeletasNoUtilizadas": None,
            "horaApertura": None,
            "horaCierre": None
        }

        resultados_presidente = {
            "votosPartidos": [],
            "votosValidos": 0,
            "votosBlancos": 0,
            "votosNulos": 0,
            "totalVotos": 0
        }

        codigo_mesa = None
        numero_mesa = None
        texto_extraido = None

        if metadata is not None:
            codigo_mesa = metadata["codigoMesa"]
            numero_mesa = metadata["numeroMesa"]

            ubicacion = {
                "departamento": metadata["ubicacion"]["departamento"],
                "provincia": metadata["ubicacion"]["provincia"],
                "municipio": metadata["ubicacion"]["municipio"],
                "recinto": {
                    "nombre": metadata["ubicacion"]["recintoNombre"],
                    "direccion": metadata["ubicacion"]["recintoDireccion"]
                }
            }

            datos_acta = {
                "cantidadHabilitados": metadata["datosActa"]["cantidadHabilitados"],
                "papeletasEnAnfora": metadata["datosActa"]["papeletasEnAnfora"],
                "papeletasNoUtilizadas": metadata["datosActa"]["papeletasNoUtilizadas"],
                "horaApertura": metadata["datosActa"]["horaApertura"],
                "horaCierre": metadata["datosActa"]["horaCierre"]
            }

            votos = metadata["votos"]
            resultados_presidente = {
                "votosPartidos": [
                    {"partidoCodigo": "P1", "partidoNombre": "Partido 1", "cantidadVotos": votos["p1"]},
                    {"partidoCodigo": "P2", "partidoNombre": "Partido 2", "cantidadVotos": votos["p2"]},
                    {"partidoCodigo": "P3", "partidoNombre": "Partido 3", "cantidadVotos": votos["p3"]},
                    {"partidoCodigo": "P4", "partidoNombre": "Partido 4", "cantidadVotos": votos["p4"]}
                ],
                "votosValidos": votos["votosValidos"],
                "votosBlancos": votos["votosBlancos"],
                "votosNulos": votos["votosNulos"],
                "totalVotos": votos["totalVotos"]
            }

            texto_extraido = metadata.get("textoExtraido")

        tipo_fuente_auto = (source_tipo or "").strip().upper()

        return {
            "actaId": acta_id,
            "codigoMesa": codigo_mesa,
            "numeroMesa": numero_mesa,
            "codigoRecinto": None,
            "fuente": "APP_MOVIL" if tipo_fuente_auto in ["APP_MOVIL", "APP_MOVIL_PDF"] else "CARGA_WEB",
            "source": acta_source_for_auto(source_tipo, usuario_id),
            "estado": estado,
            "ubicacion": ubicacion,
            "archivo": {
                "nombreOriginal": archivo.filename,
                "tipoArchivo": archivo.content_type,
                "urlArchivo": str(file_path).replace("\\", "/"),
                "hashArchivo": hash_archivo,
                "tamanioMb": tamanio_mb,
                "fechaRecepcion": now
            },
            "datosActa": datos_acta,
            "qr": {
                "detectado": False,
                "contenido": None,
                "codigoMesaQr": None,
                "coincideConMesa": False
            },
            "ocr": {
                "procesado": metadata is not None,
                "motorOCR": extraction_method,
                "confianzaPromedio": 0.99 if metadata is not None else None,
                "textoExtraido": texto_extraido,
                "erroresOCR": [item["codigo"] for item in inconsistencias],
                "fechaProcesamiento": now if metadata is not None else None
            },
            "resultados": {
                "presidente": resultados_presidente,
                "diputadoUninominal": {
                    "votosPartidos": [],
                    "votosValidos": 0,
                    "votosBlancos": 0,
                    "votosNulos": 0,
                    "totalVotos": 0
                }
            },
            "validacion": {
                "esValida": es_valida,
                "esDuplicada": es_duplicada,
                "esSospechosa": es_sospechosa,
                "requiereRevisionManual": requiere_revision,
                "errores": (
                    inconsistencias
                    + duplicate_errors
                    + (
                        list(visual_quality.get("erroresVisuales", []))
                        if visual_quality
                        else []
                    )
                ),
                "reglasEjecutadas": reglas_ejecutadas,
                "fechaValidacion": now
            },
            "calidadVisual": (
                visual_quality
                if visual_quality is not None
                else self.visual_quality_service.empty_result()
            ),
            "auditoriaRecepcion": {
                "usuarioId": usuario_id,
                "nombreOperador": nombre_operador,
                "ipOrigen": ip_origen,
                "dispositivo": dispositivo,
                "ubicacionGps": {
                    "latitud": latitud,
                    "longitud": longitud
                },
                "fechaRegistroSistema": now
            },
            "createdAt": now,
            "updatedAt": now
        }

        def calcular_inconsistencias_acta(self, acta):
            inconsistencias = []

            resultados = acta.get("resultados", {}).get("presidente", {})
            datos_acta = acta.get("datosActa", {})
            validacion = acta.get("validacion", {})

            votos_partidos = resultados.get("votosPartidos", [])
            votos_validos = resultados.get("votosValidos", 0)
            votos_blancos = resultados.get("votosBlancos", 0)
            votos_nulos = resultados.get("votosNulos", 0)
            total_votos = resultados.get("totalVotos", 0)

            cantidad_habilitados = datos_acta.get("cantidadHabilitados")
            papeletas_anfora = datos_acta.get("papeletasEnAnfora")
            papeletas_no_utilizadas = datos_acta.get("papeletasNoUtilizadas")

            suma_partidos = sum(
                partido.get("cantidadVotos", 0)
                for partido in votos_partidos
            )

            if votos_partidos and suma_partidos != votos_validos:
                inconsistencias.append({
                    "codigo": "SUMA_PARTIDOS_NO_COINCIDE_VALIDOS",
                    "descripcion": (
                        f"Suma de partidos ({suma_partidos}) "
                        f"!= votosValidos ({votos_validos})"
                    ),
                    "severidad": "WARNING"
                })

            total_calculado = votos_validos + votos_blancos + votos_nulos

            if total_votos != total_calculado:
                inconsistencias.append({
                    "codigo": "TOTAL_INCOHERENTE",
                    "descripcion": (
                        f"totalVotos ({total_votos}) "
                        f"!= votosValidos+blancos+nulos ({total_calculado})"
                    ),
                    "severidad": "WARNING"
                })

            if papeletas_anfora is not None and total_votos != papeletas_anfora:
                inconsistencias.append({
                    "codigo": "TOTAL_NO_COINCIDE_PAPELETAS_ANFORA",
                    "descripcion": (
                        f"totalVotos ({total_votos}) "
                        f"!= papeletasEnAnfora ({papeletas_anfora})"
                    ),
                    "severidad": "WARNING"
                })

            if (
                papeletas_anfora is not None
                and papeletas_no_utilizadas is not None
                and cantidad_habilitados is not None
            ):
                suma_papeletas = int(papeletas_anfora) + int(papeletas_no_utilizadas)

                if suma_papeletas != int(cantidad_habilitados):
                    inconsistencias.append({
                        "codigo": "PAPELETAS_NO_COINCIDEN_HABILITADOS",
                        "descripcion": (
                            f"papeletasEnAnfora+papeletasNoUtilizadas "
                            f"({suma_papeletas}) "
                            f"!= cantidadHabilitados ({cantidad_habilitados})"
                        ),
                        "severidad": "WARNING"
                    })

            if cantidad_habilitados is not None and total_votos > int(cantidad_habilitados):
                inconsistencias.append({
                    "codigo": "TOTAL_SUPERA_HABILITADOS",
                    "descripcion": (
                        f"totalVotos ({total_votos}) "
                        f"> cantidadHabilitados ({cantidad_habilitados})"
                    ),
                    "severidad": "ERROR"
                })

            if validacion.get("esDuplicada"):
                inconsistencias.append({
                    "codigo": "ACTA_DUPLICADA",
                    "descripcion": "El acta está marcada como duplicada o en conflicto de mesa/hash",
                    "severidad": "WARNING"
                })

            return inconsistencias

        def validate_acta(self, acta_id):
            now = datetime.now(timezone.utc)
            acta = self.repository.find_acta_by_id(acta_id)

            if not acta:
                return {
                    "success": False,
                    "message": "Acta no encontrada",
                    "codigoError": "ACTA_NO_ENCONTRADA"
                }

            inconsistencias = self.calcular_inconsistencias_acta(acta)

            es_duplicada = acta.get("validacion", {}).get("esDuplicada", False)
            es_sospechosa = es_duplicada or len(inconsistencias) > 0
            estado = "SOSPECHOSA" if es_sospechosa else "VALIDADA"

            self.repository.update_acta_by_id(
                acta_id,
                {
                    "$set": {
                        "estado": estado,
                        "validacion.esValida": not es_sospechosa,
                        "validacion.esSospechosa": es_sospechosa,
                        "validacion.requiereRevisionManual": es_sospechosa,
                        "validacion.errores": inconsistencias,
                        "validacion.fechaValidacion": now,
                        "updatedAt": now
                    },
                    "$addToSet": {
                        "validacion.reglasEjecutadas": {
                            "$each": [
                                "VALIDACION_MANUAL_BACKEND",
                                "VALIDACION_SUMA_PARTIDOS_VS_VALIDOS",
                                "VALIDACION_TOTAL_VOTOS_COHERENTE",
                                "VALIDACION_TOTAL_VS_PAPELETAS_ANFORA",
                                "VALIDACION_PAPELETAS_VS_HABILITADOS"
                            ]
                        }
                    }
                }
            )

            tipo_evento = "ACTA_SOSPECHOSA" if es_sospechosa else "ACTA_VALIDADA"

            self.event_service.register_event(
                tipo=tipo_evento,
                acta_id=acta_id,
                codigo_mesa=acta.get("codigoMesa"),
                mensaje=f"Acta validada desde endpoint backend con estado {estado}",
                datos_referencia={
                    "estado": estado,
                    "inconsistencias": [item["codigo"] for item in inconsistencias]
                }
            )

            if es_sospechosa:
                self.log_service.register_log(
                    tipo="TOTAL_INCOHERENTE",
                    severidad="WARNING",
                    mensaje="Acta validada con inconsistencias o duplicidad",
                    detalle=", ".join(item["codigo"] for item in inconsistencias),
                    acta_id=acta_id,
                    codigo_mesa=acta.get("codigoMesa"),
                    datos_referencia={
                        "inconsistencias": inconsistencias
                    }
                )

            updated_acta = self.repository.find_acta_by_id(acta_id)

            return {
                "success": True,
                "actaId": acta_id,
                "estado": estado,
                "errores": inconsistencias,
                "requiereRevisionManual": es_sospechosa,
                "acta": serialize_mongo_document(updated_acta)
            }

        def list_actas_sospechosas(
            self,
            codigo_mesa=None,
            departamento=None,
            municipio=None,
            limit=50
        ):
            actas = self.repository.list_actas(filters={}, limit=10000)
            actas_serializadas = serialize_mongo_documents(actas)

            sospechosas = []

            for acta in actas_serializadas:
                validacion = acta.get("validacion", {})

                es_sospechosa = (
                    acta.get("estado") == "SOSPECHOSA"
                    or validacion.get("esSospechosa") is True
                    or validacion.get("requiereRevisionManual") is True
                    or validacion.get("esDuplicada") is True
                )

                if not es_sospechosa:
                    continue

                if codigo_mesa and acta.get("codigoMesa") != codigo_mesa:
                    continue

                if departamento and acta.get("ubicacion", {}).get("departamento") != departamento:
                    continue

                if municipio and acta.get("ubicacion", {}).get("municipio") != municipio:
                    continue

                sospechosas.append(acta)

            return {
                "success": True,
                "total": len(sospechosas[:limit]),
                "actas": sospechosas[:limit]
            }

        def get_rrv_summary(self):
            actas_raw = self.repository.list_actas(filters={}, limit=10000)
            actas = serialize_mongo_documents(actas_raw)

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

                resumen["actasRecibidas"] += 1

                estado = acta.get("estado") or "SIN_ESTADO"
                validacion = acta.get("validacion") or {}
                ocr = acta.get("ocr") or {}
                ubicacion = acta.get("ubicacion") or {}
                resultados_root = acta.get("resultados") or {}
                resultados = resultados_root.get("presidente") or {}

                if ocr.get("procesado") is True:
                        resumen["actasProcesadas"] += 1

                if estado == "VALIDADA":
                        resumen["actasValidadas"] += 1

                if (
                        estado == "SOSPECHOSA"
                        or validacion.get("esSospechosa") is True
                        or validacion.get("requiereRevisionManual") is True
                    ):
                        resumen["actasSospechosas"] += 1

                if estado == "RECHAZADA":
                        resumen["actasRechazadas"] += 1

                if estado in ["RECIBIDA", "PROCESANDO", "PENDIENTE_REVISION"]:
                        resumen["actasPendientes"] += 1

                if validacion.get("esDuplicada") is True:
                        resumen["actasDuplicadas"] += 1

                errores_ocr = ocr.get("erroresOCR") or []

                if len(errores_ocr) > 0:
                        resumen["actasConErrorOCR"] += 1

                es_acta_valida_para_totales = (
                        estado == "VALIDADA"
                        and validacion.get("esDuplicada") is not True
                        and validacion.get("esSospechosa") is not True
                    )

                if es_acta_valida_para_totales:
                        resumen["totalVotos"] += int(resultados.get("totalVotos") or 0)
                        resumen["votosValidos"] += int(resultados.get("votosValidos") or 0)
                        resumen["votosBlancos"] += int(resultados.get("votosBlancos") or 0)
                        resumen["votosNulos"] += int(resultados.get("votosNulos") or 0)

                departamento = ubicacion.get("departamento") or "SIN_DEPARTAMENTO"
                municipio = ubicacion.get("municipio") or "SIN_MUNICIPIO"

                resumen["actasPorDepartamento"][departamento] = (
                        resumen["actasPorDepartamento"].get(departamento, 0) + 1
                    )

                resumen["actasPorMunicipio"][municipio] = (
                        resumen["actasPorMunicipio"].get(municipio, 0) + 1
                    )

            return resumen

    def calcular_inconsistencias_acta(self, acta):
        inconsistencias = []

        resultados = (acta.get("resultados") or {}).get("presidente") or {}
        datos_acta = acta.get("datosActa") or {}
        validacion = acta.get("validacion") or {}

        votos_partidos = resultados.get("votosPartidos") or []
        votos_validos = int(resultados.get("votosValidos") or 0)
        votos_blancos = int(resultados.get("votosBlancos") or 0)
        votos_nulos = int(resultados.get("votosNulos") or 0)
        total_votos = int(resultados.get("totalVotos") or 0)

        cantidad_habilitados = (
            datos_acta.get("cantidadHabilitados")
            if datos_acta.get("cantidadHabilitados") is not None
            else datos_acta.get("cantidadElectoresHabilitados")
        )

        papeletas_anfora = datos_acta.get("papeletasEnAnfora")
        papeletas_no_utilizadas = datos_acta.get("papeletasNoUtilizadas")
        hora_apertura = datos_acta.get("horaApertura")
        hora_cierre = datos_acta.get("horaCierre")
        codigo_mesa = acta.get("codigoMesa")
        codigo_recinto = acta.get("codigoRecinto")
        qr_data = acta.get("qr") or {}

        # ----- Identidad -----
        if not codigo_mesa:
            inconsistencias.append({
                "codigo": "MESA_REQUERIDA",
                "descripcion": "El acta no tiene codigoMesa registrado",
                "severidad": "ERROR"
            })

        if not codigo_recinto:
            inconsistencias.append({
                "codigo": "RECINTO_REQUERIDO",
                "descripcion": "El acta no tiene codigoRecinto registrado",
                "severidad": "WARNING"
            })

        if (
            qr_data.get("detectado") is True
            and qr_data.get("codigoMesaQr")
            and codigo_mesa
            and str(qr_data.get("codigoMesaQr")) != str(codigo_mesa)
        ):
            inconsistencias.append({
                "codigo": "QR_MESA_NO_COINCIDE",
                "descripcion": (
                    f"QR ({qr_data.get('codigoMesaQr')}) "
                    f"no coincide con codigoMesa ({codigo_mesa})"
                ),
                "severidad": "WARNING"
            })

        # ----- Votos: tipo, signo, suma -----
        for index, partido in enumerate(votos_partidos):
            cantidad = partido.get("cantidadVotos")

            if cantidad is None:
                continue

            if not isinstance(cantidad, (int,)) or isinstance(cantidad, bool):
                inconsistencias.append({
                    "codigo": "VOTO_PARTIDO_NO_NUMERICO",
                    "descripcion": (
                        f"Voto de {partido.get('partidoCodigo') or f'partido_{index}'} "
                        f"no es un entero"
                    ),
                    "severidad": "WARNING"
                })
                continue

            if cantidad < 0:
                inconsistencias.append({
                    "codigo": "VOTO_PARTIDO_NEGATIVO",
                    "descripcion": (
                        f"Voto negativo en {partido.get('partidoCodigo') or f'partido_{index}'} "
                        f"({cantidad})"
                    ),
                    "severidad": "ERROR"
                })

        if votos_blancos < 0:
            inconsistencias.append({
                "codigo": "VOTOS_BLANCOS_NEGATIVO",
                "descripcion": f"votosBlancos negativo ({votos_blancos})",
                "severidad": "ERROR"
            })

        if votos_nulos < 0:
            inconsistencias.append({
                "codigo": "VOTOS_NULOS_NEGATIVO",
                "descripcion": f"votosNulos negativo ({votos_nulos})",
                "severidad": "ERROR"
            })

        if votos_validos < 0:
            inconsistencias.append({
                "codigo": "VOTOS_VALIDOS_NEGATIVO",
                "descripcion": f"votosValidos negativo ({votos_validos})",
                "severidad": "ERROR"
            })

        suma_partidos = sum(
            int(partido.get("cantidadVotos") or 0)
            for partido in votos_partidos
        )

        if votos_partidos and suma_partidos != votos_validos:
            inconsistencias.append({
                "codigo": "SUMA_PARTIDOS_NO_COINCIDE_VALIDOS",
                "descripcion": (
                    f"Suma de partidos ({suma_partidos}) "
                    f"!= votosValidos ({votos_validos})"
                ),
                "severidad": "WARNING"
            })

        total_calculado = votos_validos + votos_blancos + votos_nulos

        if total_votos != total_calculado:
            inconsistencias.append({
                "codigo": "TOTAL_INCOHERENTE",
                "descripcion": (
                    f"totalVotos ({total_votos}) "
                    f"!= votosValidos+blancos+nulos ({total_calculado})"
                ),
                "severidad": "WARNING"
            })

        if papeletas_anfora is not None and total_votos != int(papeletas_anfora):
            inconsistencias.append({
                "codigo": "TOTAL_NO_COINCIDE_PAPELETAS_ANFORA",
                "descripcion": (
                    f"totalVotos ({total_votos}) "
                    f"!= papeletasEnAnfora ({papeletas_anfora})"
                ),
                "severidad": "WARNING"
            })

        # totalVotos no debe exceder papeletasEnAnfora.
        if (
            papeletas_anfora is not None
            and total_votos > int(papeletas_anfora)
        ):
            inconsistencias.append({
                "codigo": "TOTAL_SUPERA_PAPELETAS_ANFORA",
                "descripcion": (
                    f"totalVotos ({total_votos}) > papeletasEnAnfora ({papeletas_anfora})"
                ),
                "severidad": "ERROR"
            })

        if (
            papeletas_anfora is not None
            and papeletas_no_utilizadas is not None
            and cantidad_habilitados is not None
        ):
            suma_papeletas = int(papeletas_anfora) + int(papeletas_no_utilizadas)

            if suma_papeletas != int(cantidad_habilitados):
                inconsistencias.append({
                    "codigo": "PAPELETAS_NO_COINCIDEN_HABILITADOS",
                    "descripcion": (
                        f"papeletasEnAnfora+papeletasNoUtilizadas "
                        f"({suma_papeletas}) "
                        f"!= cantidadHabilitados ({cantidad_habilitados})"
                    ),
                    "severidad": "WARNING"
                })

        if cantidad_habilitados is not None and total_votos > int(cantidad_habilitados):
            inconsistencias.append({
                "codigo": "TOTAL_SUPERA_HABILITADOS",
                "descripcion": (
                    f"totalVotos ({total_votos}) "
                    f"> cantidadHabilitados ({cantidad_habilitados})"
                ),
                "severidad": "ERROR"
            })

        # ----- Control electoral -----
        if cantidad_habilitados is not None and int(cantidad_habilitados) <= 0:
            inconsistencias.append({
                "codigo": "HABILITADOS_NO_VALIDO",
                "descripcion": f"cantidadHabilitados invalida ({cantidad_habilitados})",
                "severidad": "ERROR"
            })

        if papeletas_anfora is not None and int(papeletas_anfora) < 0:
            inconsistencias.append({
                "codigo": "PAPELETAS_ANFORA_NEGATIVO",
                "descripcion": f"papeletasEnAnfora negativo ({papeletas_anfora})",
                "severidad": "ERROR"
            })

        if papeletas_no_utilizadas is not None and int(papeletas_no_utilizadas) < 0:
            inconsistencias.append({
                "codigo": "PAPELETAS_NO_UTILIZADAS_NEGATIVO",
                "descripcion": (
                    f"papeletasNoUtilizadas negativo ({papeletas_no_utilizadas})"
                ),
                "severidad": "ERROR"
            })

        if (
            papeletas_anfora is not None
            and cantidad_habilitados is not None
            and int(papeletas_anfora) > int(cantidad_habilitados)
        ):
            inconsistencias.append({
                "codigo": "PAPELETAS_ANFORA_EXCEDE_HABILITADOS",
                "descripcion": (
                    f"papeletasEnAnfora ({papeletas_anfora}) > "
                    f"cantidadHabilitados ({cantidad_habilitados})"
                ),
                "severidad": "ERROR"
            })

        if (
            papeletas_no_utilizadas is not None
            and cantidad_habilitados is not None
            and int(papeletas_no_utilizadas) > int(cantidad_habilitados)
        ):
            inconsistencias.append({
                "codigo": "PAPELETAS_NO_UTILIZADAS_EXCEDE_HABILITADOS",
                "descripcion": (
                    f"papeletasNoUtilizadas ({papeletas_no_utilizadas}) > "
                    f"cantidadHabilitados ({cantidad_habilitados})"
                ),
                "severidad": "ERROR"
            })

        # ----- Coherencia de horarios -----
        apertura_minutos = self._parse_hhmm_to_minutes(hora_apertura)
        cierre_minutos = self._parse_hhmm_to_minutes(hora_cierre)

        if hora_apertura and apertura_minutos is None:
            inconsistencias.append({
                "codigo": "HORA_APERTURA_FORMATO_INVALIDO",
                "descripcion": f"horaApertura con formato invalido ({hora_apertura})",
                "severidad": "WARNING"
            })

        if hora_cierre and cierre_minutos is None:
            inconsistencias.append({
                "codigo": "HORA_CIERRE_FORMATO_INVALIDO",
                "descripcion": f"horaCierre con formato invalido ({hora_cierre})",
                "severidad": "WARNING"
            })

        # Apertura razonable: entre 06:00 y 11:00.
        if apertura_minutos is not None and not (6 * 60 <= apertura_minutos <= 11 * 60):
            inconsistencias.append({
                "codigo": "HORA_APERTURA_FUERA_RANGO",
                "descripcion": (
                    f"horaApertura ({hora_apertura}) fuera del rango razonable 06:00-11:00"
                ),
                "severidad": "WARNING"
            })

        # Cierre razonable: no antes de las 12:00.
        if cierre_minutos is not None and cierre_minutos < 12 * 60:
            inconsistencias.append({
                "codigo": "HORA_CIERRE_DEMASIADO_TEMPRANO",
                "descripcion": (
                    f"horaCierre ({hora_cierre}) anterior a 12:00"
                ),
                "severidad": "WARNING"
            })

        if (
            apertura_minutos is not None
            and cierre_minutos is not None
            and cierre_minutos <= apertura_minutos
        ):
            inconsistencias.append({
                "codigo": "HORA_CIERRE_NO_POSTERIOR_APERTURA",
                "descripcion": (
                    f"horaCierre ({hora_cierre}) no es posterior a horaApertura "
                    f"({hora_apertura})"
                ),
                "severidad": "WARNING"
            })

        if validacion.get("esDuplicada") is True:
            inconsistencias.append({
                "codigo": "ACTA_DUPLICADA",
                "descripcion": "El acta está marcada como duplicada o en conflicto de mesa/hash",
                "severidad": "WARNING"
            })

        return inconsistencias

    def _parse_hhmm_to_minutes(self, value):
        """Convierte 'HH:MM' a minutos desde medianoche; None si no es valido."""
        if not value or not isinstance(value, str):
            return None

        match = re.fullmatch(r"\s*(\d{1,2})\s*:\s*(\d{2})\s*", value)

        if not match:
            return None

        hours = int(match.group(1))
        minutes = int(match.group(2))

        if hours < 0 or hours > 23 or minutes < 0 or minutes > 59:
            return None

        return hours * 60 + minutes

    def validate_acta(self, acta_id):
        now = datetime.now(timezone.utc)
        acta = self.repository.find_acta_by_id(acta_id)

        if not acta:
            return {
                "success": False,
                "message": "Acta no encontrada",
                "codigoError": "ACTA_NO_ENCONTRADA"
            }

        draft_acta = deepcopy(acta)
        self._complete_codigo_recinto_from_actas_impresas(draft_acta)
        self._enrich_official_territory(draft_acta)
        inconsistencias = self.calcular_inconsistencias_acta(draft_acta)

        es_duplicada = acta.get("validacion", {}).get("esDuplicada", False)
        es_sospechosa = es_duplicada or len(inconsistencias) > 0
        estado = "SOSPECHOSA" if es_sospechosa else "VALIDADA"

        draft_acta["estado"] = estado
        draft_validacion = draft_acta.setdefault("validacion", {})
        draft_validacion["esDuplicada"] = es_duplicada
        draft_validacion["errores"] = inconsistencias
        draft_validacion["fechaValidacion"] = now
        draft_validacion["reglasEjecutadas"] = self._merge_unique_rules(
            draft_validacion.get("reglasEjecutadas") or [],
            [
                "VALIDACION_MANUAL_BACKEND",
                "VALIDACION_SUMA_PARTIDOS_VS_VALIDOS",
                "VALIDACION_TOTAL_VOTOS_COHERENTE",
                "VALIDACION_TOTAL_VS_PAPELETAS_ANFORA",
                "VALIDACION_PAPELETAS_VS_HABILITADOS",
            ],
        )
        draft_validacion.update(
            self._flags_for_state(estado, es_duplicada=es_duplicada)
        )

        oep_context = self._apply_oep_validation(
            draft_acta,
            extracted_text=(acta.get("ocr") or {}).get("textoExtraido"),
            visual_quality=acta.get("calidadVisual"),
            now=now,
        )

        estado = draft_acta["estado"]
        draft_validacion = draft_acta.get("validacion") or {}
        reglas_ejecutadas = self._merge_unique_rules(
            [
                "VALIDACION_MANUAL_BACKEND",
                "VALIDACION_SUMA_PARTIDOS_VS_VALIDOS",
                "VALIDACION_TOTAL_VOTOS_COHERENTE",
                "VALIDACION_TOTAL_VS_PAPELETAS_ANFORA",
                "VALIDACION_PAPELETAS_VS_HABILITADOS",
            ],
            (oep_context.get("result") or {}).get("reglasEjecutadas") or [],
        )

        set_data = {
            "estado": estado,
            "validacion.esValida": draft_validacion.get("esValida", False),
            "validacion.esSospechosa": draft_validacion.get("esSospechosa", False),
            "validacion.requiereRevisionManual": draft_validacion.get("requiereRevisionManual", False),
            "validacion.errores": draft_validacion.get("errores", []),
            "validacion.fechaValidacion": now,
            "validacion.observacionesDetectadas": draft_validacion.get("observacionesDetectadas", {}),
            "updatedAt": now
        }
        self._copy_oep_mutations_to_update(set_data, draft_acta)

        if draft_validacion.get("observacionOficial"):
            set_data["validacion.observacionOficial"] = draft_validacion.get("observacionOficial")
            set_data["datosActa.observacionTranscripcion"] = draft_validacion.get("observacionOficial")

        if draft_validacion.get("casoEspecialCSV"):
            set_data["validacion.casoEspecialCSV"] = draft_validacion.get("casoEspecialCSV")
            set_data["validacion.casosEspecialesCSV"] = draft_validacion.get("casosEspecialesCSV", [])
            set_data["datosActa.casoEspecialCSV"] = draft_validacion.get("casoEspecialCSV")

        if draft_acta.get("codigoRecinto") != acta.get("codigoRecinto"):
            set_data["codigoRecinto"] = draft_acta.get("codigoRecinto")

        self.repository.update_acta_by_id(
            acta_id,
            {
                "$set": set_data,
                "$addToSet": {
                    "validacion.reglasEjecutadas": {
                        "$each": reglas_ejecutadas
                    }
                }
            }
        )

        updated_acta = self.repository.find_acta_by_id(acta_id)
        self._safe_upsert_resultado(
            updated_acta,
            endpoint="POST /api/rrv/actas/{actaId}/validar",
        )
        self._emit_oep_logs_and_events(
            updated_acta,
            oep_context,
            endpoint="POST /api/rrv/actas/{actaId}/validar",
        )

        if estado == "SOSPECHOSA":
            tipo_evento = "ACTA_SOSPECHOSA"
        elif estado == "RECHAZADA":
            tipo_evento = "ACTA_RECHAZADA"
        elif estado == "PENDIENTE_REVISION":
            tipo_evento = "ACTA_AUTO_PENDIENTE_REVISION"
        else:
            tipo_evento = "ACTA_VALIDADA"

        self._safe_register_event(
            tipo=tipo_evento,
            acta_id=acta_id,
            codigo_mesa=acta.get("codigoMesa"),
            mensaje=f"Acta validada desde endpoint backend con estado {estado}",
            datos_referencia={
                "estado": estado,
                "inconsistencias": [
                    item.get("codigo")
                    for item in draft_validacion.get("errores", [])
                ]
            }
        )

        if draft_validacion.get("esSospechosa") or draft_validacion.get("requiereRevisionManual"):
            self._safe_register_log(
                tipo="VALIDACION_RRV",
                severidad="WARNING",
                mensaje="Acta validada con inconsistencias o duplicidad",
                detalle=", ".join(
                    item.get("codigo", "")
                    for item in draft_validacion.get("errores", [])
                ),
                acta_id=acta_id,
                codigo_mesa=acta.get("codigoMesa"),
                datos_referencia={
                    "inconsistencias": draft_validacion.get("errores", [])
                }
            )

        return {
            "success": True,
            "actaId": acta_id,
            "estado": estado,
            "errores": draft_validacion.get("errores", []),
            "requiereRevisionManual": draft_validacion.get("requiereRevisionManual", False),
            "acta": serialize_mongo_document(updated_acta)
        }

    def parse_sms_content(self, contenido_original):
        if not contenido_original or not isinstance(contenido_original, str):
            return None

        parsed = {}

        for parte in re.split(r"[;\r\n]+", contenido_original):
            if ":" not in parte:
                continue

            key, value = parte.split(":", 1)
            key_normalized = key.strip().upper()
            if key_normalized:
                parsed[key_normalized] = value.strip()

        # SMS Forwarder apps often send compact text such as:
        # "RRV MESA 1010200001001 P1 10 P2 20 ...".
        # Keep the legacy key:value parser above, then fill missing fields from
        # whitespace-separated labels.
        for key in ["MESA", "RECINTO", "P1", "P2", "P3", "P4", "BLANCOS", "NULOS", "TOKEN"]:
            if key in parsed:
                continue

            match = re.search(
                rf"(?<!\w){re.escape(key)}(?!\w)\s*:?\s*([^\s;,:]+)",
                contenido_original,
                flags=re.IGNORECASE,
            )

            if match:
                parsed[key] = match.group(1).strip()

        return parsed or None

    def _normalize_sms_phone(self, numero):
        text = re.sub(r"\s+", "", str(numero or "").strip())

        if not text:
            return None

        if text.startswith("+"):
            return text

        if text.startswith("591"):
            return f"+{text}"

        if text.startswith("0"):
            text = text[1:]

        return f"+591{text}"

    def _sms_bool(self, value):
        if isinstance(value, bool):
            return value
        return str(value or "").strip().lower() in ["1", "true", "yes", "si"]

    def _first_present_field(self, body, keys):
        if not isinstance(body, dict):
            return None

        for key in keys:
            if key in body and body.get(key) not in [None, ""]:
                return body.get(key)

        return None

    def _normalize_sms_payload(self, body):
        raw_payload = deepcopy(body) if isinstance(body, dict) else {"value": body}
        payload = body if isinstance(body, dict) else {}
        datos_body = payload.get("datos") if isinstance(payload.get("datos"), dict) else {}

        sender_raw = self._first_present_field(payload, [
            "numeroOrigen",
            "telefonoRemitente",
            "from",
            "From",
            "sender",
            "Sender",
            "phone",
            "Phone",
            "number",
            "Number",
            "msisdn",
            "originator",
        ])
        message_raw = self._first_present_field(payload, [
            "contenidoOriginal",
            "mensaje",
            "message",
            "Message",
            "body",
            "Body",
            "text",
            "Text",
            "sms",
            "Sms",
            "smsText",
            "messageBody",
        ])

        message = str(message_raw).strip() if message_raw not in [None, ""] else None
        if not message:
            message = self._build_sms_content_from_datos(datos_body)

        timestamp_raw = self._first_present_field(payload, [
            "fechaRecepcion",
            "timestamp",
            "Timestamp",
            "timestampMovil",
            "time",
            "date",
            "sentAt",
            "receivedAt",
        ])

        sender_normalized = self._normalize_sms_phone(sender_raw)

        return {
            "payload": payload,
            "rawPayload": raw_payload,
            "datos": datos_body,
            "senderRaw": sender_raw,
            "sender": sender_normalized or (str(sender_raw).strip() if sender_raw else None),
            "message": message,
            "timestamp": timestamp_raw,
        }

    def _sms_content_signature(self, parsed):
        if not parsed:
            return ""

        keys = ["MESA", "RECINTO", "P1", "P2", "P3", "P4", "BLANCOS", "NULOS", "TOKEN"]
        return ";".join(
            f"{key}:{str(parsed.get(key, '')).strip()}"
            for key in keys
            if key in parsed
        )

    def _sms_vote_signature_from_values(self, valores):
        return {
            "P1": valores.get("P1"),
            "P2": valores.get("P2"),
            "P3": valores.get("P3"),
            "P4": valores.get("P4"),
            "BLANCOS": valores.get("BLANCOS"),
            "NULOS": valores.get("NULOS"),
        }

    def _sms_vote_signature_from_document(self, sms_document):
        datos = (sms_document or {}).get("datosParseados") or {}
        return {
            "P1": datos.get("p1"),
            "P2": datos.get("p2"),
            "P3": datos.get("p3"),
            "P4": datos.get("p4"),
            "BLANCOS": datos.get("votosBlancos"),
            "NULOS": datos.get("votosNulos"),
        }

    def _sms_source(self, numero_origen, fuente=None, canal=None, modulo_origen=None):
        source = sms_source(numero_origen)

        if fuente:
            source["tipo"] = str(fuente).strip().upper()

        if canal:
            source["canal"] = str(canal).strip().upper()

        if modulo_origen:
            source["moduloOrigen"] = str(modulo_origen).strip()

        return source

    def _build_sms_content_from_datos(self, datos):
        if not isinstance(datos, dict):
            return None

        votos = datos.get("votos") or {}
        codigo_mesa = datos.get("codigoMesa") or datos.get("mesa")
        codigo_recinto = datos.get("codigoRecinto") or datos.get("recinto")

        required_values = [
            codigo_mesa,
            codigo_recinto,
            votos.get("P1"),
            votos.get("P2"),
            votos.get("P3"),
            votos.get("P4"),
            votos.get("BLANCOS"),
            votos.get("NULOS"),
        ]

        if any(value is None for value in required_values):
            return None

        return (
            f"MESA:{codigo_mesa};RECINTO:{codigo_recinto};"
            f"P1:{votos.get('P1')};P2:{votos.get('P2')};"
            f"P3:{votos.get('P3')};P4:{votos.get('P4')};"
            f"BLANCOS:{votos.get('BLANCOS')};NULOS:{votos.get('NULOS')}"
        )

    def receive_sms(self, body):
        endpoint = "POST /api/rrv/sms"
        collection_name = COLECCIONES_RRV["sms"]
        now = datetime.now(timezone.utc)

        normalized = self._normalize_sms_payload(body)
        payload = normalized["payload"]
        raw_payload = normalized["rawPayload"]
        datos_body = normalized["datos"]
        sms_id = payload.get("smsId") or f"SMS-RRV-{uuid4().hex[:12].upper()}"
        numero_origen = normalized["sender"]
        contenido_original = normalized["message"]
        timestamp_cliente = normalized["timestamp"]
        fuente = payload.get("fuente")
        canal = payload.get("canal")
        modulo_origen = payload.get("moduloOrigen")
        autorizado_servidor_pc = self._sms_bool(payload.get("autorizadoServidorPc"))

        print(f"[RRV SMS] Request received endpoint={endpoint}")
        print(f"[RRV SMS] Payload received: {raw_payload}")
        print(f"[RRV SMS] Mongo target database={MONGO_DB_NAME} collection={collection_name}")

        es_app_movil_sms = (
            autorizado_servidor_pc
            or str(fuente or "").strip().upper() == "APP_MOVIL_SMS"
            or str(canal or "").strip().upper() == "SMS_APP_MOVIL"
        )

        sms_document = {
            "smsId": sms_id,
            "origen": "SMS",
            "sender": numero_origen,
            "message": contenido_original or "",
            "receivedAt": now,
            "status": "RECIBIDO",
            "processed": False,
            "rawPayload": raw_payload,
            "numeroOrigen": numero_origen or "",
            "telefonoRemitente": payload.get("telefonoRemitente") or numero_origen or "",
            "contenidoOriginal": contenido_original or "",
            "contenidoNormalizado": "",
            "mensaje": contenido_original or "",
            "fechaRecepcion": now,
            "fechaRecepcionCliente": timestamp_cliente,
            "timestampMovil": payload.get("timestampMovil") or timestamp_cliente,
            "autorizadoServidorPc": autorizado_servidor_pc,
            "fuente": fuente or ("APP_MOVIL_SMS" if es_app_movil_sms else "SMS"),
            "canal": canal or ("SMS_APP_MOVIL" if es_app_movil_sms else "RRV_SMS"),
            "moduloOrigen": modulo_origen,
            "estado": "RECIBIDO",
            "estadoSms": "RECIBIDO",
            "codigoMesa": None,
            "codigoRecinto": None,
            "source": self._sms_source(numero_origen, fuente, canal, modulo_origen),
            "token": None,
            "duplicado": False,
            "duplicadoDeSmsId": None,
            "conflicto": False,
            "smsConflictivos": [],
            "datos": datos_body,
            "datosParseados": {},
            "datosInterpretados": None,
            "resultados": {},
            "territorioOficial": {},
            "seguridad": {
                "numeroInformado": numero_origen is not None,
                "formatoValido": False,
                "numeroAutorizado": autorizado_servidor_pc,
            },
            "validacion": {
                "esValido": False,
                "esRechazado": False,
                "esInvalido": False,
                "esDuplicado": False,
                "esSospechoso": False,
                "errores": [],
                "fechaValidacion": None,
            },
            "createdAt": now,
            "updatedAt": now,
        }

        try:
            inserted_id = self.repository.insert_sms(sms_document)
        except Exception as error:
            print(f"[RRV SMS] Mongo write error database={MONGO_DB_NAME} collection={collection_name}: {error}")
            self._safe_register_log(
                tipo="MONGO_WRITE_ERROR",
                severidad="CRITICAL",
                mensaje="No se pudo guardar SMS en MongoDB",
                detalle=str(error),
                datos_referencia={
                    "endpoint": endpoint,
                    "database": MONGO_DB_NAME,
                    "collection": collection_name,
                    "payload": raw_payload,
                },
            )

            return {
                "success": False,
                "message": "Could not save SMS",
                "error": str(error),
                "codigoError": "MONGO_WRITE_ERROR_SMS",
            }

        print(
            f"[RRV SMS] Saved document smsId={sms_id} insertedId={inserted_id} "
            f"database={MONGO_DB_NAME} collection={collection_name}"
        )

        self._safe_register_log(
            tipo="SISTEMA",
            severidad="INFO",
            mensaje="SMS request received and saved in MongoDB",
            detalle=f"database={MONGO_DB_NAME} collection={collection_name} insertedId={inserted_id}",
            datos_referencia={
                "endpoint": endpoint,
                "smsId": sms_id,
                "database": MONGO_DB_NAME,
                "collection": collection_name,
                "payload": raw_payload,
            },
        )

        errores_estructurales = []
        errores_revision = []
        parsed = {}
        valores_numericos = {}
        codigo_mesa = None
        codigo_recinto = None
        votos_validos = 0
        total_votos = 0
        resultados = {}
        territorio_oficial = {}
        sms_duplicado = None
        sms_conflictivos = []

        try:
            if not numero_origen:
                errores_estructurales.append("NUMERO_ORIGEN_NO_INFORMADO")

            if not contenido_original:
                errores_estructurales.append("CONTENIDO_SMS_REQUERIDO")

            parsed = self.parse_sms_content(contenido_original)

            if parsed is None:
                errores_estructurales.append("SMS_FORMATO_INVALIDO")
                parsed = {}

            campos_requeridos = ["MESA", "P1", "P2", "P3", "P4", "BLANCOS", "NULOS"]

            for campo in campos_requeridos:
                if campo not in parsed:
                    errores_estructurales.append(f"SMS_CAMPO_FALTANTE_{campo}")

            codigo_mesa = parsed.get("MESA")
            codigo_recinto = parsed.get("RECINTO")

            for campo in ["P1", "P2", "P3", "P4", "BLANCOS", "NULOS"]:
                valor = parsed.get(campo)

                if valor is None:
                    continue

                if not re.fullmatch(r"\d+", str(valor)):
                    errores_estructurales.append(f"SMS_VALOR_NO_NUMERICO_{campo}")
                    continue

                valores_numericos[campo] = int(valor)

            votos_validos = (
                valores_numericos.get("P1", 0)
                + valores_numericos.get("P2", 0)
                + valores_numericos.get("P3", 0)
                + valores_numericos.get("P4", 0)
            )

            total_votos = (
                votos_validos
                + valores_numericos.get("BLANCOS", 0)
                + valores_numericos.get("NULOS", 0)
            )

            if not errores_estructurales:
                acta_impresa = None
                actas_impresas_disponibles = False

                try:
                    actas_impresas_disponibles = get_actas_impresas_status().get(
                        "actasImpresasAvailable",
                        False,
                    )
                    acta_impresa = get_acta_impresa(codigo_mesa) if codigo_mesa else None
                except Exception as error:
                    errores_revision.append("SMS_ACTAS_IMPRESAS_NO_DISPONIBLE")
                    self._safe_register_log(
                        tipo="SISTEMA",
                        severidad="WARNING",
                        mensaje="No se pudo validar SMS contra ActasImpresas.csv",
                        detalle=str(error),
                        codigo_mesa=codigo_mesa,
                        datos_referencia={"endpoint": endpoint, "smsId": sms_id},
                    )

                if actas_impresas_disponibles and codigo_mesa:
                    if not acta_impresa:
                        errores_revision.append("SMS_MESA_NO_EXISTE_ACTAS_IMPRESAS")
                    else:
                        recinto_oficial = acta_impresa.get("codigoRecinto")
                        habilitados = acta_impresa.get("votantesHabilitados")

                        if (
                            codigo_recinto
                            and recinto_oficial
                            and str(codigo_recinto) != str(recinto_oficial)
                        ):
                            errores_revision.append("SMS_RECINTO_NO_COINCIDE_OFICIAL")

                        if habilitados is not None and total_votos > int(habilitados):
                            errores_revision.append("SMS_TOTAL_SUPERA_HABILITADOS")

                try:
                    territorio_oficial = resolve_official_territory_for_acta({
                        "codigoMesa": codigo_mesa,
                        "codigoRecinto": codigo_recinto,
                        "archivo": {},
                    })
                except Exception as error:
                    errores_revision.append("SMS_TERRITORIO_NO_RESUELTO")
                    self._safe_register_log(
                        tipo="SISTEMA",
                        severidad="WARNING",
                        mensaje="No se pudo resolver territorio oficial del SMS",
                        detalle=str(error),
                        codigo_mesa=codigo_mesa,
                        datos_referencia={"endpoint": endpoint, "smsId": sms_id},
                    )

                contenido_normalizado = self._sms_content_signature(parsed)
                firma_votos = self._sms_vote_signature_from_values(valores_numericos)
                sms_previos_mesa = (
                    self.repository.find_sms_by_codigo_mesa(codigo_mesa)
                    if codigo_mesa
                    else []
                )

                for sms_previo in sms_previos_mesa:
                    if sms_previo.get("smsId") == sms_id:
                        continue

                    firma_previa = self._sms_vote_signature_from_document(sms_previo)
                    contenido_previo = (
                        sms_previo.get("contenidoNormalizado")
                        or self._sms_content_signature(
                            self.parse_sms_content(sms_previo.get("contenidoOriginal")) or {}
                        )
                    )
                    numero_previo = self._normalize_sms_phone(sms_previo.get("numeroOrigen"))

                    es_mismo_sms = (
                        numero_previo == numero_origen
                        and contenido_previo == contenido_normalizado
                        and firma_previa == firma_votos
                    )

                    if es_mismo_sms:
                        sms_duplicado = sms_previo
                        break

                    if (
                        all(value is not None for value in firma_previa.values())
                        and all(value is not None for value in firma_votos.values())
                        and firma_previa != firma_votos
                    ):
                        sms_conflictivos.append(sms_previo)

                if sms_duplicado:
                    errores_revision.append("SMS_DUPLICADO")

                if sms_conflictivos:
                    errores_revision.append("CONFLICTO_SMS_MESA")

            errores = errores_estructurales + errores_revision

            if errores_estructurales:
                estado = "INVALIDO"
                status = "ERROR_PARSE"
                processed = False
            elif sms_duplicado:
                estado = "DUPLICADO"
                status = "RECIBIDO"
                processed = True
            elif errores_revision:
                estado = "SOSPECHOSO"
                status = "RECIBIDO"
                processed = True
            else:
                estado = "VALIDO"
                status = "RECIBIDO"
                processed = True

            resultados = {
                "votosValidos": votos_validos,
                "votosBlancos": valores_numericos.get("BLANCOS", 0),
                "votosNulos": valores_numericos.get("NULOS", 0),
                "totalVotos": total_votos,
            }

            datos_parseados = {
                "p1": valores_numericos.get("P1"),
                "p2": valores_numericos.get("P2"),
                "p3": valores_numericos.get("P3"),
                "p4": valores_numericos.get("P4"),
                "votosBlancos": valores_numericos.get("BLANCOS"),
                "votosNulos": valores_numericos.get("NULOS"),
                "votosValidos": votos_validos,
                "totalVotos": total_votos,
            }

            datos_interpretados = None
            if processed:
                datos_interpretados = {
                    "votosPartidos": [
                        {"partidoCodigo": "P1", "cantidadVotos": valores_numericos.get("P1", 0)},
                        {"partidoCodigo": "P2", "cantidadVotos": valores_numericos.get("P2", 0)},
                        {"partidoCodigo": "P3", "cantidadVotos": valores_numericos.get("P3", 0)},
                        {"partidoCodigo": "P4", "cantidadVotos": valores_numericos.get("P4", 0)},
                    ],
                    **resultados,
                }

            update_fields = {
                "status": status,
                "processed": processed,
                "procesadoEnFlujoRRV": estado == "VALIDO",
                "contenidoNormalizado": self._sms_content_signature(parsed),
                "estado": estado,
                "estadoSms": estado,
                "codigoMesa": codigo_mesa,
                "codigoRecinto": codigo_recinto,
                "token": parsed.get("TOKEN"),
                "duplicado": sms_duplicado is not None,
                "duplicadoDeSmsId": (sms_duplicado or {}).get("smsId"),
                "conflicto": len(sms_conflictivos) > 0,
                "smsConflictivos": [
                    item.get("smsId")
                    for item in sms_conflictivos
                    if item.get("smsId")
                ],
                "datosParseados": datos_parseados,
                "datosInterpretados": datos_interpretados,
                "resultados": resultados,
                "territorioOficial": territorio_oficial,
                "errores": errores,
                "seguridad": {
                    "numeroInformado": numero_origen is not None,
                    "formatoValido": len(errores_estructurales) == 0,
                    "numeroAutorizado": autorizado_servidor_pc,
                    "numeroAsociadoMesa": len(errores_revision) == 0 if codigo_mesa else False,
                    "numeroAsociadoRecinto": bool(codigo_recinto),
                },
                "validacion": {
                    "esValido": estado == "VALIDO",
                    "esRechazado": estado == "INVALIDO",
                    "esInvalido": estado == "INVALIDO",
                    "esDuplicado": estado == "DUPLICADO",
                    "esSospechoso": estado == "SOSPECHOSO",
                    "errores": errores,
                    "fechaValidacion": now,
                },
                "updatedAt": datetime.now(timezone.utc),
            }

            self.repository.update_sms_by_id(sms_id, {"$set": update_fields})
            sms_document.update(update_fields)

            self._safe_register_event(
                tipo="SMS_RECIBIDO",
                acta_id=None,
                codigo_mesa=codigo_mesa,
                mensaje="SMS recibido en RRV",
                datos_referencia={
                    "endpoint": endpoint,
                    "smsId": sms_id,
                    "numeroOrigen": numero_origen,
                    "fuente": sms_document["fuente"],
                    "canal": sms_document["canal"],
                    "database": MONGO_DB_NAME,
                    "collection": collection_name,
                },
            )

            tipo_evento = {
                "VALIDO": "SMS_VALIDADO",
                "INVALIDO": "SMS_RECHAZADO",
                "DUPLICADO": "SMS_DUPLICADO",
                "SOSPECHOSO": "SMS_CONFLICTO_MESA" if sms_conflictivos else "SMS_RECHAZADO",
            }.get(estado, "SMS_RECHAZADO")

            self._safe_register_event(
                tipo=tipo_evento,
                acta_id=None,
                codigo_mesa=codigo_mesa,
                mensaje=f"SMS procesado con estado {estado}",
                datos_referencia={
                    "endpoint": endpoint,
                    "smsId": sms_id,
                    "numeroOrigen": numero_origen,
                    "estado": estado,
                    "status": status,
                    "errores": errores,
                    "autorizadoServidorPc": autorizado_servidor_pc,
                },
            )

            if estado != "VALIDO":
                self._safe_register_log(
                    tipo="SMS_INVALIDO",
                    severidad="WARNING",
                    mensaje="SMS RRV guardado con advertencias de parseo o validacion",
                    detalle=", ".join(errores),
                    acta_id=None,
                    codigo_mesa=codigo_mesa,
                    datos_referencia={
                        "endpoint": endpoint,
                        "smsId": sms_id,
                        "numeroOrigen": numero_origen,
                        "estado": estado,
                        "status": status,
                        "errores": errores,
                    },
                )

            print(f"[RRV SMS] Parsed smsId={sms_id} estado={estado} status={status} errores={errores}")

        except Exception as error:
            parse_error = str(error)
            update_fields = {
                "status": "ERROR_PARSE",
                "processed": False,
                "estado": "INVALIDO",
                "estadoSms": "INVALIDO",
                "errores": ["SMS_PARSE_EXCEPTION"],
                "validacion": {
                    "esValido": False,
                    "esRechazado": True,
                    "esInvalido": True,
                    "esDuplicado": False,
                    "esSospechoso": False,
                    "errores": ["SMS_PARSE_EXCEPTION"],
                    "detalle": parse_error,
                    "fechaValidacion": datetime.now(timezone.utc),
                },
                "updatedAt": datetime.now(timezone.utc),
            }
            self.repository.update_sms_by_id(sms_id, {"$set": update_fields})
            sms_document.update(update_fields)

            print(f"[RRV SMS] Parse error smsId={sms_id}: {parse_error}")
            self._safe_register_log(
                tipo="SMS_INVALIDO",
                severidad="WARNING",
                mensaje="SMS guardado pero no pudo parsearse",
                detalle=parse_error,
                codigo_mesa=codigo_mesa,
                datos_referencia={
                    "endpoint": endpoint,
                    "smsId": sms_id,
                    "database": MONGO_DB_NAME,
                    "collection": collection_name,
                    "payload": raw_payload,
                },
            )

        data = {
            "smsId": sms_id,
            "insertedId": inserted_id,
            "database": MONGO_DB_NAME,
            "collection": collection_name,
            "sender": sms_document.get("sender"),
            "message": sms_document.get("message"),
            "receivedAt": sms_document.get("receivedAt"),
            "status": sms_document.get("status"),
            "processed": sms_document.get("processed"),
            "estado": sms_document.get("estado"),
            "estadoSms": sms_document.get("estadoSms"),
            "codigoMesa": sms_document.get("codigoMesa"),
            "codigoRecinto": sms_document.get("codigoRecinto"),
            "duplicado": sms_document.get("duplicado"),
            "conflicto": sms_document.get("conflicto"),
            "errores": sms_document.get("errores", []),
            "datosParseados": sms_document.get("datosParseados"),
            "rawPayload": raw_payload,
        }

        serialized_data = serialize_mongo_document(data)

        return {
            "success": True,
            "message": "SMS received and saved successfully",
            "data": serialized_data,
            "smsId": sms_id,
            "codigoMesa": sms_document.get("codigoMesa"),
            "codigoRecinto": sms_document.get("codigoRecinto"),
            "estado": sms_document.get("estado"),
            "estadoSms": sms_document.get("estadoSms"),
            "status": sms_document.get("status"),
            "processed": sms_document.get("processed"),
            "duplicado": sms_document.get("duplicado"),
            "conflicto": sms_document.get("conflicto"),
            "errores": sms_document.get("errores", []),
            "datosParseados": sms_document.get("datosParseados"),
        }
    

    def apply_manual_results(self, acta_id, datos):
        now = datetime.now(timezone.utc)
        acta = self.repository.find_acta_by_id(acta_id)

        if not acta:
            return {
                "success": False,
                "message": "Acta no encontrada",
                "codigoError": "ACTA_NO_ENCONTRADA"
            }

        votos_partidos = [
            {
                "partidoCodigo": p.partidoCodigo,
                "partidoNombre": f"Partido {p.partidoCodigo[1:]}",
                "cantidadVotos": p.cantidadVotos
            }
            for p in datos.votosPartidos
        ]

        votos_validos = datos.votosValidos
        votos_blancos = datos.votosBlancos
        votos_nulos = datos.votosNulos
        total_votos = votos_validos + votos_blancos + votos_nulos
        suma_partidos = sum(p.cantidadVotos for p in datos.votosPartidos)

        resultados_presidente = {
            "votosPartidos": votos_partidos,
            "votosValidos": votos_validos,
            "votosBlancos": votos_blancos,
            "votosNulos": votos_nulos,
            "totalVotos": total_votos
        }

        draft_acta = deepcopy(acta)
        draft_acta.setdefault("resultados", {})["presidente"] = resultados_presidente
        self._complete_codigo_recinto_from_actas_impresas(draft_acta)
        self._enrich_official_territory(draft_acta)
        inconsistencias = self.calcular_inconsistencias_acta(draft_acta)
        es_duplicada = (acta.get("validacion") or {}).get("esDuplicada", False)
        es_sospechosa = es_duplicada or len(inconsistencias) > 0
        estado = "SOSPECHOSA" if es_sospechosa else "VALIDADA"

        draft_acta["estado"] = estado
        draft_validacion = draft_acta.setdefault("validacion", {})
        draft_validacion["esDuplicada"] = es_duplicada
        draft_validacion["errores"] = inconsistencias
        draft_validacion["fechaValidacion"] = now
        draft_validacion["reglasEjecutadas"] = self._merge_unique_rules(
            draft_validacion.get("reglasEjecutadas") or [],
            [
                "CORRECCION_MANUAL",
                "VALIDACION_CONSISTENCIA_MANUAL",
                "VALIDACION_SUMA_PARTIDOS_VS_VALIDOS",
                "VALIDACION_TOTAL_VOTOS_COHERENTE",
                "VALIDACION_TOTAL_VS_PAPELETAS_ANFORA",
                "VALIDACION_PAPELETAS_VS_HABILITADOS",
            ],
        )
        draft_validacion.update(
            self._flags_for_state(estado, es_duplicada=es_duplicada)
        )

        oep_context = self._apply_oep_validation(
            draft_acta,
            extracted_text=(acta.get("ocr") or {}).get("textoExtraido"),
            visual_quality=acta.get("calidadVisual"),
            now=now,
        )

        estado = draft_acta["estado"]
        draft_validacion = draft_acta.get("validacion") or {}
        reglas_ejecutadas = self._merge_unique_rules(
            [
                "CORRECCION_MANUAL",
                "VALIDACION_CONSISTENCIA_MANUAL",
                "VALIDACION_SUMA_PARTIDOS_VS_VALIDOS",
                "VALIDACION_TOTAL_VOTOS_COHERENTE",
                "VALIDACION_TOTAL_VS_PAPELETAS_ANFORA",
                "VALIDACION_PAPELETAS_VS_HABILITADOS",
            ],
            (oep_context.get("result") or {}).get("reglasEjecutadas") or [],
        )

        set_data = {
            "estado": estado,
            "resultados.presidente": resultados_presidente,
            "validacion.esValida": draft_validacion.get("esValida", False),
            "validacion.esSospechosa": draft_validacion.get("esSospechosa", False),
            "validacion.requiereRevisionManual": draft_validacion.get("requiereRevisionManual", False),
            "validacion.errores": draft_validacion.get("errores", []),
            "validacion.fechaValidacion": now,
            "validacion.observacionesDetectadas": draft_validacion.get("observacionesDetectadas", {}),
            "updatedAt": now
        }
        self._copy_oep_mutations_to_update(set_data, draft_acta)

        if draft_validacion.get("observacionOficial"):
            set_data["validacion.observacionOficial"] = draft_validacion.get("observacionOficial")
            set_data["datosActa.observacionTranscripcion"] = draft_validacion.get("observacionOficial")

        if draft_validacion.get("casoEspecialCSV"):
            set_data["validacion.casoEspecialCSV"] = draft_validacion.get("casoEspecialCSV")
            set_data["validacion.casosEspecialesCSV"] = draft_validacion.get("casosEspecialesCSV", [])
            set_data["datosActa.casoEspecialCSV"] = draft_validacion.get("casoEspecialCSV")

        if draft_acta.get("codigoRecinto") != acta.get("codigoRecinto"):
            set_data["codigoRecinto"] = draft_acta.get("codigoRecinto")

        self.repository.update_acta_by_id(
            acta_id,
            {
                "$set": set_data,
                "$addToSet": {
                    "validacion.reglasEjecutadas": {
                        "$each": reglas_ejecutadas
                    }
                }
            }
        )

        updated_acta = self.repository.find_acta_by_id(acta_id)
        self._safe_upsert_resultado(
            updated_acta,
            endpoint="PATCH /api/rrv/actas/{actaId}/resultados-manuales",
        )
        self._emit_oep_logs_and_events(
            updated_acta,
            oep_context,
            endpoint="PATCH /api/rrv/actas/{actaId}/resultados-manuales",
        )

        self._safe_register_event(
            tipo="RESULTADOS_MANUALES_APLICADOS",
            acta_id=acta_id,
            codigo_mesa=acta.get("codigoMesa"),
            mensaje="Resultados corregidos manualmente por operador",
            datos_referencia={
                "operadorId": datos.operadorId,
                "estado": estado,
                "sumaPartidos": suma_partidos,
                "votosValidos": votos_validos,
                "inconsistencias": len(inconsistencias)
            }
        )

        self._safe_register_log(
            tipo="CORRECCION_MANUAL",
            severidad="WARNING" if draft_validacion.get("requiereRevisionManual") else "INFO",
            mensaje="Resultados manuales aplicados al acta RRV",
            detalle=datos.observacion,
            acta_id=acta_id,
            codigo_mesa=acta.get("codigoMesa"),
            datos_referencia={
                "operadorId": datos.operadorId,
                "estado": estado,
                "inconsistencias": draft_validacion.get("errores", [])
            }
        )

        return {
            "success": True,
            "actaId": acta_id,
            "estado": estado,
            "totalVotos": total_votos,
            "sumaPartidos": suma_partidos,
            "inconsistencias": draft_validacion.get("errores", []),
            "requiereRevisionManual": draft_validacion.get("requiereRevisionManual", False),
            "acta": serialize_mongo_document(updated_acta)
        }

    def list_actas(self, filters=None, limit=50):
        actas = self.repository.list_actas(filters=filters, limit=limit)
        return serialize_mongo_documents(actas)

    def get_acta_detail(self, acta_id):
        acta = self.repository.find_acta_by_id(acta_id)
        return serialize_mongo_document(acta)

    def process_ocr(self, acta_id):
        now = datetime.now(timezone.utc)
        acta = self.repository.find_acta_by_id(acta_id)

        if not acta:
            return {
                "success": False,
                "message": "Acta no encontrada",
                "codigoError": "ACTA_NO_ENCONTRADA"
            }

        self.repository.update_acta_by_id(
            acta_id,
            {
                "$set": {
                    "estado": "PROCESANDO",
                    "updatedAt": now
                },
                "$addToSet": {
                    "validacion.reglasEjecutadas": "OCR_INICIADO"
                }
            }
        )

        self.event_service.register_event(
            tipo="OCR_INICIADO",
            acta_id=acta_id,
            codigo_mesa=acta.get("codigoMesa"),
            mensaje="OCR iniciado para acta RRV",
            datos_referencia={
                "archivo": acta.get("archivo", {}).get("urlArchivo")
            }
        )

        file_path = acta.get("archivo", {}).get("urlArchivo")
        content_type = acta.get("archivo", {}).get("tipoArchivo")
        codigo_mesa = acta.get("codigoMesa")

        result = self.ocr_service.process_file(
            file_path=file_path,
            content_type=content_type,
            codigo_mesa=codigo_mesa
        )

        estado_sugerido = result.get("estadoSugerido", "PENDIENTE_REVISION")
        ocr_data = result.get("ocr", {})
        qr_data = result.get("qr", {})
        campos = result.get("campos", {})
        quality = result.get("quality", {})
        debug_files = result.get("debugFiles", {})
        validacion_actual = acta.get("validacion", {})
        es_duplicada_actual = validacion_actual.get("esDuplicada", False)
        errores_previos = validacion_actual.get("errores", [])
        errores_validacion = []

        for error in ocr_data.get("erroresOCR", []):
            errores_validacion.append({
                "codigo": error,
                "descripcion": f"Error detectado durante OCR: {error}",
                "severidad": "WARNING"
            })

        visual_quality = self.run_visual_quality_analysis(
            file_path=file_path,
            content_type=content_type,
            pdf_text=ocr_data.get("textoExtraido"),
            acta_id=acta_id,
            codigo_mesa=codigo_mesa
        )

        if es_duplicada_actual:
            estado_sugerido = "SOSPECHOSA"
            requiere_revision = True
            es_sospechosa = True
        elif estado_sugerido in ["SOSPECHOSA", "PENDIENTE_REVISION", "RECHAZADA"]:
            requiere_revision = True
            es_sospechosa = estado_sugerido != "RECHAZADA"
        else:
            requiere_revision = False
            es_sospechosa = False

        resultados_presidente = {
            "votosPartidos": campos.get("votosPartidos", []),
            "votosValidos": campos.get("votosValidos", 0),
            "votosBlancos": campos.get("votosBlancos", 0),
            "votosNulos": campos.get("votosNulos", 0),
            "totalVotos": campos.get("totalVotos", 0)
        }

        errores_visuales = list(visual_quality.get("erroresVisuales", []))

        set_data = {
            "estado": estado_sugerido,
            "ocr": ocr_data,
            "qr": qr_data,
            "resultados.presidente": resultados_presidente,
            "validacion.esValida": estado_sugerido == "VALIDADA" and not es_duplicada_actual,
            "validacion.esSospechosa": es_sospechosa,
            "validacion.requiereRevisionManual": requiere_revision,
            "validacion.fechaValidacion": now,
            "validacion.errores": errores_previos + errores_validacion + errores_visuales,
            "calidadVisual": visual_quality,
            "updatedAt": now,
        }

        cantidad_habilitados_ocr = campos.get("cantidadHabilitados")

        if cantidad_habilitados_ocr is not None:
            set_data["datosActa.cantidadHabilitados"] = cantidad_habilitados_ocr

        reglas_ejecutadas_ocr = [
            "OCR_PROCESADO",
            "QR_DETECTADO",
            "EXTRACCION_DATOS_ELECTORALES"
        ]

        if visual_quality.get("procesado"):
            reglas_ejecutadas_ocr.append("ANALISIS_CALIDAD_VISUAL")

        draft_acta = deepcopy(acta)
        draft_acta["estado"] = estado_sugerido
        draft_acta["ocr"] = ocr_data
        draft_acta["qr"] = qr_data
        draft_acta.setdefault("resultados", {})["presidente"] = resultados_presidente
        draft_acta["calidadVisual"] = visual_quality
        draft_acta.setdefault("datosActa", {})

        codigo_mesa_ocr = campos.get("codigoMesa")
        if codigo_mesa_ocr and not draft_acta.get("codigoMesa"):
            draft_acta["codigoMesa"] = str(codigo_mesa_ocr)
            codigo_mesa = str(codigo_mesa_ocr)
            set_data["codigoMesa"] = codigo_mesa

        if cantidad_habilitados_ocr is not None:
            draft_acta["datosActa"]["cantidadHabilitados"] = cantidad_habilitados_ocr

        self._complete_codigo_recinto_from_actas_impresas(draft_acta)
        self._enrich_official_territory(draft_acta)

        draft_validacion = draft_acta.setdefault("validacion", {})
        draft_validacion["esDuplicada"] = es_duplicada_actual
        draft_validacion["esValida"] = estado_sugerido == "VALIDADA" and not es_duplicada_actual
        draft_validacion["esSospechosa"] = es_sospechosa
        draft_validacion["requiereRevisionManual"] = requiere_revision
        draft_validacion["fechaValidacion"] = now
        draft_validacion["errores"] = set_data["validacion.errores"]
        draft_validacion["reglasEjecutadas"] = self._merge_unique_rules(
            draft_validacion.get("reglasEjecutadas") or [],
            reglas_ejecutadas_ocr,
        )

        oep_context = self._apply_oep_validation(
            draft_acta,
            extracted_text=ocr_data.get("textoExtraido"),
            visual_quality=visual_quality,
            now=now,
        )

        estado_sugerido = draft_acta["estado"]
        draft_validacion = draft_acta.get("validacion") or {}
        set_data.update({
            "estado": estado_sugerido,
            "validacion.esValida": draft_validacion.get("esValida", False),
            "validacion.esSospechosa": draft_validacion.get("esSospechosa", False),
            "validacion.requiereRevisionManual": draft_validacion.get("requiereRevisionManual", False),
            "validacion.fechaValidacion": now,
            "validacion.errores": draft_validacion.get("errores", []),
            "validacion.observacionesDetectadas": draft_validacion.get("observacionesDetectadas", {}),
        })
        self._copy_oep_mutations_to_update(set_data, draft_acta)

        if draft_validacion.get("observacionOficial"):
            set_data["validacion.observacionOficial"] = draft_validacion.get("observacionOficial")
            set_data["datosActa.observacionTranscripcion"] = draft_validacion.get("observacionOficial")

        if draft_validacion.get("casoEspecialCSV"):
            set_data["validacion.casoEspecialCSV"] = draft_validacion.get("casoEspecialCSV")
            set_data["validacion.casosEspecialesCSV"] = draft_validacion.get("casosEspecialesCSV", [])
            set_data["datosActa.casoEspecialCSV"] = draft_validacion.get("casoEspecialCSV")

        if draft_acta.get("codigoRecinto") != acta.get("codigoRecinto"):
            set_data["codigoRecinto"] = draft_acta.get("codigoRecinto")

        reglas_ejecutadas_ocr = self._merge_unique_rules(
            reglas_ejecutadas_ocr,
            (oep_context.get("result") or {}).get("reglasEjecutadas") or [],
        )

        update_data = {
            "$set": set_data,
            "$addToSet": {
                "validacion.reglasEjecutadas": {
                    "$each": reglas_ejecutadas_ocr
                }
            }
        }

        self.repository.update_acta_by_id(acta_id, update_data)
        updated_acta = self.repository.find_acta_by_id(acta_id)
        self._safe_upsert_resultado(
            updated_acta,
            endpoint="POST /api/rrv/actas/{actaId}/procesar-ocr",
        )
        self._emit_oep_logs_and_events(
            updated_acta,
            oep_context,
            endpoint="POST /api/rrv/actas/{actaId}/procesar-ocr",
        )

        self.event_service.register_event(
            tipo="OCR_PROCESADO",
            acta_id=acta_id,
            codigo_mesa=codigo_mesa,
            mensaje="OCR procesado para acta RRV",
            datos_referencia={
                "estadoSugerido": estado_sugerido,
                "confianzaPromedio": ocr_data.get("confianzaPromedio"),
                "quality": quality,
                "erroresOCR": ocr_data.get("erroresOCR", []),
                "debugFiles": debug_files
            }
        )

        if ocr_data.get("erroresOCR"):
            self.log_service.register_log(
                tipo="ERROR_OCR",
                severidad="WARNING",
                mensaje="OCR ejecutado con advertencias",
                detalle=", ".join(ocr_data.get("erroresOCR", [])),
                acta_id=acta_id,
                codigo_mesa=codigo_mesa,
                datos_referencia={
                    "confianzaPromedio": ocr_data.get("confianzaPromedio"),
                    "quality": quality
                }
            )

        if visual_quality.get("tieneProblemasVisuales"):
            self.event_service.register_event(
                tipo="ACTA_VALIDADA" if estado_sugerido == "VALIDADA" else "ACTA_SOSPECHOSA",
                acta_id=acta_id,
                codigo_mesa=codigo_mesa,
                mensaje="Acta con observaciones visuales (advertencia, no afecta estado)",
                datos_referencia={
                    "afectaZonaCritica": visual_quality.get("afectaZonaCritica", False),
                    "impactoLectura": visual_quality.get("impactoLectura", "NINGUNO"),
                    "soloAdvertencia": True,
                    "erroresVisuales": [
                        item.get("codigo")
                        for item in visual_quality.get("erroresVisuales", [])
                    ],
                    "metricas": visual_quality.get("metricas", {})
                }
            )

        return {
            "success": True,
            "actaId": acta_id,
            "estado": estado_sugerido,
            "confianzaPromedio": ocr_data.get("confianzaPromedio"),
            "erroresOCR": ocr_data.get("erroresOCR", []),
            "textoExtraido": ocr_data.get("textoExtraido"),
            "calidadVisual": {
                "tieneProblemasVisuales": visual_quality.get("tieneProblemasVisuales", False),
                "afectaZonaCritica": visual_quality.get("afectaZonaCritica", False),
                "requiereRevisionManual": visual_quality.get("requiereRevisionManual", False),
                "erroresVisuales": [
                    item.get("codigo")
                    for item in visual_quality.get("erroresVisuales", [])
                ]
            },
            "acta": serialize_mongo_document(updated_acta)
        }
