# Auditoría jurídica vLex (10/10/2026) — contraste con el estado real de TurnoPIN

Fuente: «Auditoría jurídica integral de comercialización en España del SaaS TurnoPIN a fecha 10 octubre 2026» (vLex). Conclusión del informe: **viabilidad jurídica CONDICIONADA**.

> **Nota expresa.** Legalmente viable ≠ económicamente rentable. Este documento no constituye homologación ni certificación, ni garantiza el cumplimiento normativo. Todo lo marcado **PENDIENTE DE VALIDACIÓN LEGAL** requiere revisión por abogada/asesoría antes de producción comercial. Proyectos normativos (jornada 37,5 h, registro digital obligatorio, acceso remoto permanente de la ITSS) **no** se tratan como ley vigente: PENDIENTE DE VALIDACIÓN LEGAL sobre su estado en BOE.

Referencias oficiales a contrastar: ET arts. 34.9, 12.4.c, 35.5 (BOE-A-2015-11430); AEPD «La protección de datos en las relaciones laborales» y FAQ-0312; RGPD art. 28.3.g y 33; LOPDGDD art. 33. El texto de este documento resume el informe y el código; no reproduce ni sustituye la norma.

Prioridades: P0 = antes del primer cliente de pago; P1 = antes de comercialización amplia; P2 = mejora recomendable.

## 1. Requisitos OBLIGATORIOS

| Requisito | Estado verificado (código) | Brecha | Prioridad | Referencia |
|---|---|---|---|---|
| Registro diario de hora de inicio y fin por persona | `time_entries` con timestamp de servidor UTC, tipo, local; `punch_core` serializado; visualización Europe/Madrid | Ninguna funcional | — | ET 34.9 |
| Fiabilidad / no alteración oculta | Originales inmutables (triggers `prevent_time_entry_mutation`); correcciones append-only con motivo, actor y fecha; audit_logs append-only | Ninguna funcional | — | ET 34.9; informe §correcciones |
| Conservación 4 años | Nada borra fichajes; no hay purga automática | Falta política documentada de conservación vs. fin de contrato (ver §7) | P0 | ET 34.9 |
| Disponibilidad para trabajador | Portal `/mi/$token` + PIN, solo registros propios, PDF mensual | Ninguna funcional | — | ET 34.9 |
| Disponibilidad para RLT e ITSS | Admin exporta PDF/CSV por trabajador/mes y global | No hay guía de entrega a ITSS/RLT ni export multi-mes/multi-año en un paso | P1 | ET 34.9; informe §acceso |
| Sin tecnología específica obligatoria (firma, blockchain, WORM) | No se usan; no se afirman | — | — | Informe §1 |

## 2. Requisitos CONDICIONALES

| Requisito | Estado verificado | Brecha | Prioridad | Referencia |
|---|---|---|---|---|
| Tiempo parcial: totalización mensual, copia con nómina, ordinarias vs complementarias, conservar resúmenes 4 años | `workers` **no** tiene tipo de contrato ni jornada pactada; no se distingue ordinaria/complementaria; no hay evidencia de entrega del resumen | Brecha real si hay trabajadores a tiempo parcial | P0 | ET 12.4.c — PENDIENTE DE VALIDACIÓN LEGAL del alcance exacto |
| Horas extraordinarias: totalización | Informes suman horas trabajadas; no calculan extras (no hay jornada pactada) | Sin cálculo de extras; responsabilidad del cliente hasta definir | P1 | ET 35.5 |
| Pausas, turnos partidos, nocturnos | Pausas por trabajador con flag computa/no computa; múltiples turnos/día; turno cruzando medianoche continuo (tests) | Convenios concretos no modelados (por diseño) | P2 | Convenio aplicable |
| No inventar horas | Turno sin salida = «Sin salida · incompleto», excluido de totales | — | — | Informe §2 |
| Presencia vs. trabajo efectivo | Solo se registra presencia/fichaje y pausas | Aclarar en guía cliente | P2 | Informe §2 |

## 3. PIN en kiosco compartido (RECOMENDABLE / seguridad proporcionada)

| Medida | Estado verificado | Brecha | Prioridad |
|---|---|---|---|
| Hash no reversible | bcrypt (`crypt` + `gen_salt('bf')`); clientes nunca reciben `pin_hash` | Texto del panel admin aún dice «cifrado» (no público) | P2 |
| Rate limiting backend | `pin_attempts`, bloqueo tras fallos repetidos por trabajador en ventana | No hay límite por kiosco/IP; sin pruebas de abuso automatizadas | P1 |
| Logs sin PIN | PIN no se registra; WhatsApp no guarda cuerpos de mensaje | — | — |
| Reset por canal autenticado | Solo admin autenticado o trabajador con PIN actual | — | — |
| Ocultar PIN y borrar estado | Teclado muestra «•»; reset automático tras acción e inactividad | — | — |
| Riesgo de suplantación (PIN ajeno) | No mitigado técnicamente más allá del PIN (sin biometría/geolocalización por decisión) | Documentar responsabilidad del cliente y aviso a plantilla | P1 |

## 4. Correcciones

| Requisito | Estado | Brecha | Prioridad |
|---|---|---|---|
| Nunca sobrescribir; autor, fecha, antes/después, motivo, historial | Cumplido (`corrections` append-only, `original_*`, `reason_code`, `corrected_by_admin_id`) | — | — |
| Turno manual marcado | `is_manual`, `manual_reason`, `created_by` | — | — |
| Aviso al trabajador de una corrección | El trabajador ve el registro corregido en su portal; no se le notifica activamente | Recomendable, no obligación universal (PENDIENTE DE VALIDACIÓN LEGAL) | P2 |
| Sin borrado destructivo | DELETE bloqueado en tablas de registros | — | — |

## 5. Acceso trabajador / ITSS / RLT

| Requisito | Estado | Brecha | Prioridad |
|---|---|---|---|
| Trabajador solo ve lo suyo | `worker_portal` filtra por token+PIN; archivado revoca | — | — |
| Panel remoto permanente para inspector | No existe; no probado obligatorio | Opción prudente: export inmediata o acceso temporal mínimo privilegio | P2 |
| PDF/CSV | Existen; PDF incluye correcciones/manuales | No se afirma «imposible de manipular». Falta export_id + hash/manifest previsto en Project Knowledge | P1 |

## 6. RGPD

| Requisito | Estado | Brecha | Prioridad |
|---|---|---|---|
| Rol empleador responsable / TurnoPIN encargado | Asumido en Project Knowledge | DPA art. 28 no redactado ni firmado | P0 |
| Base jurídica obligación legal, no consentimiento; deber de informar | Privacidad en borrador; WhatsApp descrito como voluntario | Texto de información a trabajadores no preparado | P0 |
| Minimización | DNI/NIE/NAF opcionales; sin biometría/geolocalización; teléfono WhatsApp opcional y hasheado en telemetría | — | — |
| Aislamiento tenant | RLS por `company_id`; linter sin hallazgos nuevos | — | — |
| Subencargados / transferencias | Hosting/backend, Stripe, Meta, email futuro | Lista y análisis de transferencias (Meta, Stripe: PENDIENTE DE VALIDACIÓN LEGAL) | P0 |
| Registro de actividades como encargado, EIPD/DPD condicional | No existe | Preparar RAT de encargado; valorar EIPD | P1 |
| Brechas: encargado avisa sin dilación; responsable valora 72 h | Sin procedimiento escrito | Redactar procedimiento | P0 |
| Cookies LSSI | No hay analítica/publicidad de terceros identificada; solo sesión técnica | Confirmar antes de añadir cualquier analítica | P2 |

## 7. Baja, impago y retención — RIESGO CRÍTICO

| Requisito | Estado verificado | Brecha | Prioridad |
|---|---|---|---|
| Fase 30 días solo lectura tras cancelación/impago | Implementada (`company_writable`, `read_only`); registros, informes y portal siguen accesibles | Se mantiene como decisión comercial vigente | — |
| Devolución/supresión documentada (RGPD 28.3.g; LOPDGDD 33) | **No existe** procedimiento ni código de borrado/anonimización | Redactar procedimiento; no prometer borrado automático | P0 |
| Exportación completa portable y verificable | Solo PDF/CSV mensual por trabajador/global | Falta export completo (fichajes, correcciones, incidencias, auditoría) con manifest/hash y prueba de entrega | P0 |
| Bloqueo justificado por obligación legal | No definido | PENDIENTE DE VALIDACIÓN LEGAL | P0 |
| Traza de eliminación y de copias de seguridad | No existe | Definir plazos y registro de supresión | P1 |
| No frustrar acceso legal por impago | Lectura/exportación no se bloquean en solo lectura | Definir qué pasa después de los 30 días | P0 |

No se ha ejecutado ningún borrado ni cambiado la política contractual.

## 8. Continuidad

| Requisito | Estado | Brecha | Prioridad |
|---|---|---|---|
| Backup cifrado | Gestionado por la plataforma de backend; no verificado desde el proyecto | Verificar plan y frecuencia | P1 |
| Restauración ensayada | No ensayada | Ensayo documentado | P1 |
| Plan ante caída | Kiosco y WhatsApp dependen de red; turno manual por admin con motivo existe | Procedimiento de contingencia en papel + carga posterior marcada manual. Nota: el registro manual guarda el instante real de captura y la hora declarada por separado; no se falsea timestamp | P1 |
| Modo offline | No existe; no es obligatorio | No introducir | — |

## 9. Documentación pendiente (ninguna aprobada)

Contrato SaaS B2B · DPA art. 28 · lista de subencargados y transferencias · política de privacidad, aviso legal/LSSI (titular y NIF pendientes) · cookies si procede · términos de prueba y baja · política de seguridad · RAT de encargado y guía para RAT del cliente · información a trabajadores y procedimiento laboral · procedimiento de correcciones · atención de derechos RGPD · gestión de brechas · retención/exportación/borrado · plan de continuidad · gestión de usuarios/PIN · guía ITSS/RLT/trabajadores · SLA · cierre definitivo de cuenta.

Las páginas `/privacidad`, `/aviso-legal`, `/terminos` siguen marcadas como **borrador** y no identifican responsable ni DPA firmado.

## 10. Escenarios de riesgo

| # | Escenario | Mitigación actual | Responsabilidad / pendiente |
|---|---|---|---|
| 1 | Admin reduce extras alterando registros | Original inmutable, corrección visible con autor/motivo en informes y portal del trabajador | Cliente responsable del uso; mejora: aviso al trabajador (P2) |
| 2 | Fichaje con PIN ajeno | PIN por trabajador, hash, rate limit, ocultación | Cliente informa y vigila; riesgo residual aceptado sin biometría |
| 3 | Borrado accidental | DELETE bloqueado; archivar en vez de borrar | — |
| 4 | ITSS pide registros de hace 3 años | Datos conservados; PDF/CSV por mes | Falta export multi-periodo en un paso (P1) |
| 5 | Impago | Solo lectura 30 días con lectura/export | Falta procedimiento posterior (P0) |
| 6 | Caída prolongada | Turno manual con motivo | Falta plan de contingencia escrito y ensayo de restauración (P1) |
| 7 | Trabajador pregunta quién corrigió | Portal/PDF muestran corrección y motivo | Confirmar que se muestra el autor al trabajador (PENDIENTE de decisión) |
| 8 | Inspector pide acceso remoto | Export inmediata por admin | Acceso temporal mínimo privilegio opcional (P2) |
| 9 | Alta sin información RGPD al trabajador | No hay plantilla de información | Plantilla para cliente (P0) |
| 10 | Empresa cierra y quiere borrar todo | No hay procedimiento | Procedimiento devolución/supresión + bloqueo legal (P0) |
