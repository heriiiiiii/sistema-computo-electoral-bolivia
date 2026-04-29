import re

def _section(text, name):
    pattern = rf"\[{name}\](.*?)(?=\[[A-Z_]+\]|$)"
    match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    return match.group(1) if match else text

def _digits(value):
    if value is None:
        return None
    clean = re.sub(r"\D", "", str(value))
    return int(clean) if clean else None

def _extract_after_labels(text, labels):
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for index, line in enumerate(lines):
        upper = line.upper()

        for label in labels:
            if label in upper:
                value = _digits(line.split(label, 1)[-1])
                if value is not None:
                    return value

                if index + 1 < len(lines):
                    value = _digits(lines[index + 1])
                    if value is not None:
                        return value

    return None

def _extract_by_regex(pattern, text):
    match = re.search(pattern, text, re.IGNORECASE)
    if not match:
        return None
    return _digits(match.group(1))

def _extract_candidate_votes(text):
    candidate_section = _section(text, "CANDIDATOS")
    lines = [line.strip() for line in candidate_section.splitlines() if line.strip()]

    excluded = [
        "MESA", "RECINTO", "VALIDOS", "VÁLIDOS", "BLANCOS", "NULOS",
        "TOTAL", "HABILITADOS", "ANFORA", "ÁNFORA", "PAPELETAS"
    ]

    votes = []

    for line in lines:
        upper = line.upper()

        if any(word in upper for word in excluded):
            continue

        direct_match = re.search(r"\b(P[1-9])\s*[:\-]?\s*([0-9\s]{1,8})\b", upper)
        if direct_match:
            votes.append({
                "partidoCodigo": direct_match.group(1),
                "partidoNombre": f"Partido {direct_match.group(1)[1:]}",
                "cantidadVotos": _digits(direct_match.group(2))
            })
            continue

        if re.search(r"[A-ZÁÉÍÓÚÑ]{3,}", upper) and re.search(r"\d", upper):
            digit_groups = re.findall(r"(?:\d\s*){1,4}$", upper)
            if digit_groups:
                value = _digits(digit_groups[-1])
                if value is not None:
                    votes.append({
                        "partidoCodigo": f"P{len(votes) + 1}",
                        "partidoNombre": line,
                        "cantidadVotos": value
                    })

    clean_votes = []
    for item in votes:
        if item["cantidadVotos"] is not None:
            clean_votes.append(item)

    return clean_votes[:10]

def extract_electoral_fields(text):
    left_info = _section(text, "INFO_IZQUIERDA")
    totals_text = _section(text, "TOTALES")
    full_text = text

    codigo_mesa = (
        _extract_by_regex(r"MESA\s*[:\-]?\s*([0-9]+)", left_info)
        or _extract_by_regex(r"MESA\s*[:\-]?\s*([0-9]+)", full_text)
    )

    codigo_recinto = (
        _extract_by_regex(r"RECINTO\s*[:\-]?\s*([0-9]+)", full_text)
        or _extract_by_regex(r"RECINTO\s*[:\-]?\s*([0-9]+)", left_info)
    )

    cantidad_habilitados = _extract_after_labels(
        left_info,
        ["HABILITADOS", "CANTIDAD HABILITADA", "CANTIDAD DE HABILITADOS"]
    )

    papeletas_en_anfora = _extract_after_labels(
        left_info,
        ["ANFORA", "ÁNFORA", "PAPELETAS EN ANFORA", "PAPELETAS EN ÁNFORA"]
    )

    papeletas_no_utilizadas = _extract_after_labels(
        left_info,
        ["NO UTILIZADAS", "PAPELETAS NO UTILIZADAS"]
    )

    votos_validos = _extract_after_labels(
        totals_text,
        ["VOTOS VALIDOS", "VOTOS VÁLIDOS", "VALIDOS", "VÁLIDOS"]
    )

    votos_blancos = _extract_after_labels(
        totals_text,
        ["VOTOS BLANCOS", "BLANCOS"]
    )

    votos_nulos = _extract_after_labels(
        totals_text,
        ["VOTOS NULOS", "NULOS"]
    )

    total_votos = _extract_after_labels(
        totals_text,
        ["TOTAL VOTOS", "TOTAL"]
    )

    votos_partidos = _extract_candidate_votes(text)
    suma_partidos = sum(item["cantidadVotos"] for item in votos_partidos)

    if votos_validos is None and votos_partidos:
        votos_validos = suma_partidos

    if total_votos is None and votos_validos is not None:
        total_votos = votos_validos + (votos_blancos or 0) + (votos_nulos or 0)

    return {
        "codigoMesaDetectado": str(codigo_mesa) if codigo_mesa is not None else None,
        "codigoRecintoDetectado": str(codigo_recinto) if codigo_recinto is not None else None,
        "cantidadHabilitados": cantidad_habilitados,
        "papeletasEnAnfora": papeletas_en_anfora,
        "papeletasNoUtilizadas": papeletas_no_utilizadas,
        "votosPartidos": votos_partidos,
        "votosValidos": votos_validos or 0,
        "votosBlancos": votos_blancos or 0,
        "votosNulos": votos_nulos or 0,
        "totalVotos": total_votos or 0,
        "camposDetectados": {
            "codigoMesa": codigo_mesa is not None,
            "codigoRecinto": codigo_recinto is not None,
            "cantidadHabilitados": cantidad_habilitados is not None,
            "papeletasEnAnfora": papeletas_en_anfora is not None,
            "papeletasNoUtilizadas": papeletas_no_utilizadas is not None,
            "votosPartidos": len(votos_partidos) > 0,
            "votosBlancos": votos_blancos is not None,
            "votosNulos": votos_nulos is not None,
            "votosValidos": votos_validos is not None,
            "totalVotos": total_votos is not None
        }
    }
