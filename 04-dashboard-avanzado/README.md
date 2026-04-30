# 04-dashboard-avanzado

## Sistema Nacional de Cómputo Electoral Bolivia

Módulo correspondiente a la **Persona 4 — Dashboard avanzado**.

Este módulo implementa el frontend de visualización del Sistema Nacional de Cómputo Electoral Bolivia. Su objetivo es presentar de forma clara, moderna y responsive los datos del Recuento Rápido de Votos — RRV, el Cómputo Oficial, las inconsistencias detectadas, el análisis geográfico, las métricas técnicas y el estado de clústeres.

---

# 1. Contexto del módulo

El módulo `04-dashboard-avanzado` forma parte de un sistema distribuido electoral compuesto por varios módulos:

- Clústeres, bases de datos y tolerancia a fallos.
- Flujo rápido RRV.
- Flujo oficial.
- Dashboard avanzado.
- App móvil + SMS.
- Integración + SQA.

Este módulo corresponde únicamente al **Dashboard avanzado**, por lo tanto su responsabilidad es visualizar información ya procesada por el backend.

---

# 2. Alcance del módulo

## Este módulo SÍ realiza

- Crear la vista principal del dashboard.
- Mostrar resultados del conteo rápido RRV.
- Mostrar resultados del Cómputo Oficial.
- Comparar RRV vs Oficial.
- Mostrar KPIs principales.
- Mostrar actas procesadas, rechazadas, pendientes y sospechosas.
- Mostrar inconsistencias detectadas.
- Mostrar métricas técnicas básicas.
- Mostrar estado de clústeres.
- Mostrar análisis geográfico.
- Mostrar mapa interactivo de Bolivia por departamentos.
- Crear gráficos y tablas claras para defensa.
- Preparar conexión a endpoints reales cuando estén disponibles.
- Usar datos mock mientras los endpoints reales no existan.

## Este módulo NO realiza

- No implementa OCR.
- No implementa app móvil.
- No implementa SMS.
- No carga archivos CSV.
- No consume endpoints POST.
- No escribe en MongoDB.
- No escribe en PostgreSQL.
- No modifica resultados electorales.
- No oficializa actas.
- No resuelve inconsistencias.
- No se conecta directamente a bases de datos.

El dashboard es principalmente de lectura y visualización.

---

# 3. Stack utilizado

El dashboard fue desarrollado con:

- React
- Vite
- TypeScript
- React Router DOM
- Axios
- Recharts
- Lucide React
- CSS propio moderno

No se utilizó Tailwind CSS en el código final del proyecto.  
El diseño se trabajó con archivos CSS propios separados por página.

---

# 4. Versiones usadas en el entorno actual

El proyecto fue ejecutado y probado con las siguientes versiones:

```txt
Node.js: v24.5.0
npm: 11.5.1
Vite: 8.0.10
@vitejs/plugin-react: 6.0.1
React DOM: 19.2.5
React Router DOM: 7.14.2
React Router: 7.14.2
Recharts: 3.8.1
TypeScript: 6.0.3
typescript-eslint: 8.59.1

Instalacion
npm install

Ejecutar el proeycto
npm run dev