# GestorIA

Gestor de gastos personal para Android/iOS con entrada en **lenguaje natural**: le escribís algo como *"gasté 5000 en comida con Mercado Pago"* o *"transferí 20000 de efectivo a MP"*, una IA (DeepSeek o Gemini, a elección) interpreta el movimiento, y la app lo registra en el fondo correspondiente. Todo el almacenamiento es **local** (SQLite en el dispositivo); la única llamada a internet es la de la IA para interpretar el texto.

## Características

- **Entrada en lenguaje natural** para gastos, ingresos y transferencias entre fondos, con **confirmación automática** cuando el texto es claro, o una vista previa editable cuando falta información (por ejemplo, a qué fondo se refiere).
- **Proveedores de IA intercambiables**: DeepSeek o Gemini, cada uno con su propia API key guardada cifrada en el dispositivo (`expo-secure-store`). Ninguna key sale del teléfono salvo hacia la API del proveedor elegido.
- **Fondos** (Efectivo, Mercado Pago, cuentas bancarias, etc.): cada uno con saldo, ingresos, gastos y variación mensual calculados a partir de los movimientos (nunca un número mutable). Soporta alias ("MP", "BNA") para que la IA los reconozca sin ambigüedad.
- **Carrusel** en la pantalla principal: "Total" + cada fondo activo, con su propia lista de movimientos.
- **Presupuestos** por categoría con alertas cuando se supera el límite mensual.
- **Resumen**: gráfico de torta por categoría, tendencia de los últimos 6 meses, selector "Este mes" / "Todo".
- **Tema claro/oscuro** con botón manual en el header (además de seguir el tema del sistema por defecto).
- **Deshacer** al eliminar un movimiento, swipe-to-delete, feedback háptico.
- Todos los montos en **pesos argentinos (ARS)**, sin soporte multimoneda.

## Stack técnico

- [Expo](https://docs.expo.dev/) SDK 54 + React Native 0.81 + TypeScript estricto
- `expo-sqlite` para persistencia local, con migraciones versionadas (`PRAGMA user_version`)
- `expo-secure-store` para las API keys
- `@react-navigation` (native-stack)
- `react-native-svg` (gráfico de torta), `react-native-gesture-handler` (swipe-to-delete), `expo-haptics`
- `expo-updates` + EAS Update para actualizaciones over-the-air
- Jest + `ts-jest` + `better-sqlite3` para tests de la capa de datos, sin mocks: corren las mismas queries SQL que la app

## Cómo correr el proyecto

```bash
npm install
npm start          # levanta Metro; escaneá el QR con Expo Go
```

Otros scripts:

```bash
npm run typecheck  # tsc --noEmit
npm test           # suite de Jest (migraciones, saldos, fondos, presupuestos, etc.)
```

### Configurar una API key de IA

Desde la app: **Configuración → elegí DeepSeek o Gemini → pegá tu API key**.

- DeepSeek: [platform.deepseek.com](https://platform.deepseek.com)
- Gemini: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

## Arquitectura

```
src/
  domain/          Reglas de negocio puras (sin DB ni React): normalización de
                    nombres de fondos, matching de alias, invariantes de
                    movimientos, selección automática de fondo.
  db/               Acceso a datos. schema.ts tiene el esquema + migración
                    idempotente desde la tabla legacy `expenses`. balances.ts
                    es la ÚNICA fuente de cálculo de saldos. Un repo por
                    entidad (fundsRepo, movementsRepo, summaryRepo,
                    budgetsRepo). sqlDatabase.ts abstrae expo-sqlite para
                    poder testear con better-sqlite3 en Node.
  services/         Integración con IA: prompt dinámico (movementPrompt.ts),
                    parseo/validación de la respuesta, resolución local de
                    nombres de fondo contra fondos reales (nunca se confía en
                    un id que devuelva la IA).
  screens/          Pantallas (Home, Summary, Budgets, Settings, Funds,
                    FundEditor, MovementDetail).
  components/       Piezas reutilizables (FundCarousel, FundSelector,
                    Skeleton, ThemeToggleButton).
  theme.tsx         Theming claro/oscuro (tokens + contexto + persistencia).
```

### Modelo de datos

Una tabla `movements` reemplaza a la vieja `expenses`, con 4 tipos:

| Tipo | Origen | Destino | Categoría |
|---|---|---|---|
| `gasto` | ✅ | ❌ | ✅ |
| `ingreso` | ❌ | ✅ | ✅ |
| `transferencia` | ✅ | ✅ (distinto) | ❌ |
| `ajuste` | uno de los dos | uno de los dos | ❌ |

Los saldos de cada fondo se derivan siempre de `SUM(destino) - SUM(origen)` sobre `movements` — no existe una columna de saldo almacenada.

## Build y distribución (EAS)

```bash
npx eas-cli login
npx eas-cli build --profile preview --platform android   # genera un .apk instalable
npx eas-cli update --branch preview --message "..."      # actualización OTA (solo cambios JS)
```

Un build nuevo (no un update) es necesario cuando se agrega una dependencia nativa, se cambian permisos, el ícono, o la versión de Expo SDK.

## Fuera de alcance (por ahora)

Multi-moneda, autenticación, sincronización en la nube/backend remoto, presupuestos o resúmenes filtrados por fondo, reconocimiento de voz (evaluado: requeriría un development build propio o una API con costo para transcribir audio).
