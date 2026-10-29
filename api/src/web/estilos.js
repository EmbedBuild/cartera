// Hoja de estilos de la página pública, como texto: en Workers no hay sistema de ficheros.
export const ESTILOS = `:root { --tinta: #1f2a2e; --suave: #5b6b70; --linea: #d9e0e2; --papel: #fbfaf7; --acento: #1d6f5f; --aviso: #8a5a00; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--papel); color: var(--tinta); font: 18px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 1.7rem; line-height: 1.2; margin: 0.2rem 0 0.4rem; }
h2 { font-size: 1.25rem; margin: 2rem 0 0.6rem; }
h3 { font-size: 1.05rem; margin: 0 0 0.2rem; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.8rem; color: var(--acento); margin: 0; }
.de, .validez, .nota, .cifras { color: var(--suave); margin: 0.2rem 0; }
.nota { font-size: 0.92rem; }
.resumen { font-size: 1.05rem; }
.caso { border: 1px solid var(--linea); border-radius: 10px; padding: 14px 16px; margin: 12px 0; background: #fff; }
.codigo { display: inline-block; font-size: 0.8rem; font-weight: 700; color: #fff; background: var(--acento); border-radius: 6px; padding: 1px 7px; margin-right: 6px; vertical-align: 2px; }
.criterios { margin: 0.5rem 0 0; padding-left: 1.1rem; }
.criterios li { margin: 0.35rem 0; }
.importes { width: 100%; border-collapse: collapse; background: #fff; }
.importes th, .importes td { padding: 8px 10px; border-bottom: 1px solid var(--linea); text-align: left; font-weight: 400; }
.importes td { text-align: right; white-space: nowrap; }
.importes .total th, .importes .total td { font-weight: 700; }
.estado, .aviso { border-radius: 10px; padding: 12px 14px; background: #eef5f3; border: 1px solid #cfe3de; }
.estado-rechazado, .estado-caducado, .estado-sustituido { background: #fbf3e6; border-color: #ecd9b5; color: var(--aviso); }
.decidir { margin-top: 2rem; border-top: 2px solid var(--linea); padding-top: 0.5rem; }
form { margin: 1rem 0; }
label { display: block; margin-bottom: 0.4rem; }
textarea { width: 100%; font: inherit; padding: 8px; border: 1px solid var(--linea); border-radius: 8px; }
button { font: inherit; font-weight: 600; border: 0; border-radius: 10px; padding: 14px 20px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
.aceptar { background: var(--acento); color: #fff; }
.rechazar { background: #e9ecec; color: var(--tinta); }
a { color: var(--acento); }
`;
