# Decisiones permanentes del proyecto

- Aplicación musical para Android, diseñada principalmente para pantallas táctiles en orientación horizontal.
- Usar Vite, React y TypeScript. Mantener componentes visuales separados del estado de aplicación.
- La interfaz contiene tres módulos coordinados: SYNTH, DRUM y BASS, con vistas de rack y ampliada.
- Conservar el lenguaje visual de hardware oscuro, laterales de madera y acentos celeste, naranja/rojo y amarillo/verde; los cuatro cabezales SYNTH tienen colores distintos.
- No incorporar nombres de producto ni marcas definitivas a la interfaz.
- No crear backend ni depender de APIs externas. Preparar la estructura para una futura PWA instalable y funcionamiento offline.
- El audio de DRUM se sintetiza con Web Audio API y usa un reloj compartido con lookahead; mantener abierta la posibilidad de samples en el futuro. SYNTH y BASS aún no producen audio.
- La generación DRUM usa estilos originales, una semilla reproducible y respeta el bloqueo de cada fila.
- Los estilos DRUM definen tanto el patrón generado como la síntesis; SWING, HUMAN y volumen actúan durante la reproducción.
- No bloquear el zoom de la página. Priorizar legibilidad y áreas táctiles cómodas en las vistas ampliadas.
