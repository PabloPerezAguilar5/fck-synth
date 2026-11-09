# Decisiones permanentes del proyecto

- Aplicación musical para Android, diseñada principalmente para pantallas táctiles en orientación horizontal.
- Usar Vite, React y TypeScript. Mantener componentes visuales separados del estado de aplicación.
- La interfaz contiene tres módulos coordinados: SYNTH, DRUM y BASS, con vistas de rack y ampliada.
- Conservar el lenguaje visual de hardware oscuro, laterales de madera y acentos celeste, naranja/rojo y amarillo/verde.
- No incorporar nombres de producto ni marcas definitivas a la interfaz.
- No crear backend ni depender de APIs externas. Preparar la estructura para una futura PWA instalable y funcionamiento offline.
- SYNTH, DRUM y BASS se sintetizan con Web Audio API. DRUM y BASS usan un reloj compartido con lookahead; SYNTH se toca en vivo independientemente del transporte. Mantener abierta la posibilidad de samples en el futuro.
- La generación DRUM usa estilos originales, una semilla reproducible y respeta el bloqueo de cada fila.
- Los estilos DRUM definen tanto el patrón generado como la síntesis; SWING, HUMAN y volumen actúan durante la reproducción.
- BASS es monofónico, genera líneas reproducibles con una semilla propia y admite duraciones para notas sostenidas. Su tónica y escala determinan las cinco notas editables y sus modos definen el patrón y el timbre.
- Cada módulo tiene MUTE independiente; el transporte controla DRUM y BASS sin detener el pad SYNTH.
- SYNTH es un pad X/Y de interpretación en vivo con estática visual silenciosa, modos TOUCH y HOLD, y STOP/CLEAR propio. Cada gesto crea una capa con su propio preset; HOLD conserva las capas entre vistas. El límite visible incluye las colas RELEASE y rechaza nuevas capas sin reemplazar las existentes. Comparte tónica y escala con BASS.
- Los controles OSC, FILTER, ENV, MOD y FX son globales: los cambios en vivo afectan las capas existentes; ataque y decay se fijan al crear cada nota y release al liberarla. Cada capa conserva el carácter de su preset; elegir otro carga sus valores globales. Delay y reverb comparten un bus de efectos de SYNTH, independiente de DRUM y BASS.
- No bloquear el zoom de la página. Priorizar legibilidad y áreas táctiles cómodas en las vistas ampliadas.
