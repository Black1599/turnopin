# Demo de kiosco aislada y ajustes de copy

## Demo `/kiosco/demo`
- Separar por completo la demo del kiosco real: para el token `demo`, no consultar ni escribir en la base de datos y mantener trabajadores, PIN, fichajes, pausas e incidencias únicamente en el estado de memoria de esa carga.
- Inicializar Ana fuera con un turno completo de hoy, Luis con el único turno abierto del día anterior y Marta trabajando hoy con pausas activadas.
- Reutilizar la misma pantalla y reglas visibles del kiosco, simulando PIN, cambio de PIN, fichajes, pausas y salida olvidada; conservar los cambios al alternar trabajadores y restaurarlos al recargar.
- Añadir “Salir de la demo” para abandonar la demo y descartar el estado. Mantener intacta la ruta real para cualquier otro token y sus llamadas actuales.

## Textos públicos
- Actualizar la FAQ de instalación para describir el kiosco web por enlace y PIN, con WhatsApp opcional; eliminar la FAQ de garantía legal.
- Sustituir referencias restrictivas de marketing principal y SEO a bares/cafeterías por “negocios pequeños”, sin cambiar “Bar Demo”.
- Cambiar el CTA final a “Empieza hoy” y simplificar el copyright a “© [año] TurnoPIN.”, sin editar los avisos de las páginas legales.

## Verificación
- Comprobar en navegador la demo, su reinicio tras recarga y la ausencia de peticiones persistentes/RPC de escritura.
- Verificar que un kiosco real conserva su ruta de llamadas actual.
- Ejecutar pruebas, comprobación de tipos y confirmar que la compilación queda limpia.
