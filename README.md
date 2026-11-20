# Tareas de casa (web)

Versión web instalable de la app nativa *TareasCasa*: reparto de las tareas del hogar con puntos, podio mensual y premios.

- **Misma lógica que la app nativa.** Reglas de puntos, bonus por retraso, extra por días fuera de casa y recompensas, traducidas de `TareasCasa/Logica/*.swift` y comprobadas con sus mismos casos de prueba.
- **Cifrado de extremo a extremo y varios hogares.** Usa la misma cuenta, el mismo hogar y la misma contraseña del hogar que la app **Gastos**. Los datos se guardan en Supabase como documentos cifrados que empiezan por `t-`.
- **Sin datos en el código.** Un hogar nuevo empieza con la lista de tareas de la app nativa y sin personas ni registros.

Publicada en https://l-rero.github.io/tareas/

## Instalar en el iPhone
Abre la dirección en **Safari** y pulsa **Compartir → Añadir a pantalla de inicio**. Después elige **Entrar en un hogar que ya existe**, inicia sesión con tu cuenta de Gastos, elige el hogar y escribe la contraseña del hogar.

## Reglas de puntos
| Cada cuántos días | Bonus por retraso |
|---|---|
| 1 | +2 % por día |
| 2–4 | +5 % cada 2 días |
| 5–10 | +20 % cada semana |
| 11–22 | +50 % cada 15 días |
| 23 o más | +120 % cada mes |

- **Puntuales:** siempre valen su base.
- **Extra por días fuera de casa:** +10 % por cada día fuera.
- **Total al registrar:** `ceil(base × (100 + bonus) × (100 + fuera) / 10000)`.

## Código compartido con Gastos
`js/crypto.js`, `js/common.js`, `js/sync.js`, `js/setup.js`, `config.js` y `vendor/supabase.js` salen de `../gastos-app`, que es la fuente original. Tras cambiarlos allí, ejecuta `herramientas/actualizar-comunes.sh`.

## Publicar cambios
Cambia `VERSION` en `sw.js` para que los móviles descarguen la versión nueva.
