// Páginas HTML del Worker: portada, entrada con código y permiso, y errores. Sin JavaScript en el navegador.

const escapar = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const NOMBRE_ALCANCE = {
  'cartera:leer': 'Ver tus clientes, presupuestos, seguimientos e importes',
  'cartera:escribir': 'Crear y cambiar presupuestos, registrar seguimientos y enviar propuestas por correo',
  offline_access: 'Seguir conectado sin pedirte el código cada hora',
};

const ESTILOS = `
:root{--papel:#faf7f2;--tinta:#1f2a33;--suave:#5b6670;--oro:#b8892b;--linea:#e4ddd1;--error:#a23b2a}
*{box-sizing:border-box}
body{margin:0;background:var(--papel);color:var(--tinta);font:17px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
main{max-width:34rem;margin:0 auto;padding:2.5rem 1rem 3rem}
.marca{font-family:Georgia,serif;font-size:1.05rem;letter-spacing:.08em;text-transform:uppercase;color:var(--oro);margin:0 0 1.5rem}
h1{font-family:Georgia,serif;font-weight:normal;font-size:1.9rem;line-height:1.2;margin:0 0 1rem}
p{margin:0 0 1rem}
.caja{background:#fff;border:1px solid var(--linea);border-radius:10px;padding:1.1rem 1.2rem;margin:0 0 1.2rem}
.aviso{border-left:4px solid var(--oro)}
.error{border-left:4px solid var(--error)}
label{display:block;font-weight:600;margin:0 0 .4rem}
.campo{margin:0 0 1rem}
.campo input{width:100%;font:inherit;font-size:1.1rem;padding:.6rem .7rem;border:1px solid #b9b0a2;border-radius:8px;background:#fff}
.ayuda{color:var(--suave);font-size:.92rem;margin:.3rem 0 0}
.alcance{display:flex;gap:.6rem;align-items:flex-start;font-weight:normal;margin:.5rem 0}
.alcance input{margin-top:.35rem}
.botones{display:flex;gap:.8rem;flex-wrap:wrap;margin-top:1.4rem}
button,.boton{font:inherit;font-weight:600;padding:.7rem 1.3rem;border-radius:8px;border:1px solid var(--tinta);cursor:pointer;text-decoration:none;display:inline-block}
.si{background:var(--tinta);color:#fff}
.no{background:transparent;color:var(--tinta)}
.pie{color:var(--suave);font-size:.9rem;margin-top:2rem}
code{background:#efe9df;padding:.1rem .35rem;border-radius:4px}
`;

// Un doble clic en «Permitir» enviaba el formulario dos veces: este guion solo deja pasar el primer envío.
// Es el único JavaScript de las páginas y la CSP lo admite por su hash, no en general.
const CANDADO = 'let enviado=false;document.querySelector("form").addEventListener("submit",(e)=>{if(enviado){e.preventDefault();return;}enviado=true;});';
const HASH_CANDADO = "'sha256-JL1MmAMuaFT/QXWRdT3E+V3XqzIT6S1zW+OzrGs9A0I='";

// form-action vale también para la redirección que sigue al formulario: hacia los clientes web (https) y hacia
// los de escritorio, como Claude Code, que esperan en http://localhost o http://127.0.0.1 con cualquier puerto.
const CSP = `default-src 'none'; style-src 'unsafe-inline'; script-src ${HASH_CANDADO}; form-action 'self' https: http://localhost:* http://127.0.0.1:*; base-uri 'none'; frame-ancestors 'none'`;

function documento(titulo, cuerpo) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
<style>${ESTILOS}</style>
</head>
<body><main><p class="marca">Cartera</p>${cuerpo}</main></body>
</html>`;
}

export function respuestaHtml(html, { estado = 200, cabeceras } = {}) {
  const headers = new Headers(cabeceras);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('content-security-policy', CSP);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  return new Response(html, { status: estado, headers });
}

export function paginaPortada() {
  return documento(
    'Cartera · el embudo de tus propuestas',
    `<h1>El embudo de tus propuestas, en una conversación</h1>
<p>Cartera guarda tus clientes, tus presupuestos por casos de uso y tus seguimientos. Se usa desde Claude, a través de su MCP.</p>
<div class="caja">
<p><strong>Para conectarla</strong>, añade en Claude un conector personalizado con esta dirección:</p>
<p><code>https://cartera-mcp.embed.build/mcp</code></p>
<p>Claude te traerá aquí para que entres con tu correo y tu contraseña (o crees tu cuenta) y le des permiso.</p>
</div>
<p class="pie">Aplicación ficticia para la clase 6 de PotenzIA. Los clientes y los importes son inventados.</p>`,
  );
}

// La pantalla de entrada y permiso: el correo y la contraseña identifican a la persona (o crean su cuenta)
// y el permiso dice qué podrá hacer la app. Si algo falla, vuelve con el correo y el nombre ya escritos.
export function paginaEntrada(detalles, handle, volver, { error, valores = {} } = {}) {
  const nombre = escapar(detalles.clientName);
  const origen = detalles.clientDomain
    ? `La publica <strong>${escapar(detalles.clientDomain)}</strong>.`
    : 'Esta aplicación se ha registrado sola: su nombre no está verificado.';
  const local = detalles.redirectIsLoopback
    ? `<div class="caja aviso"><p><strong>El permiso irá a una aplicación de tu ordenador.</strong> Sigue solo si acabas de conectarla tú desde ella (por ejemplo, Claude Code).</p></div>`
    : '';
  const alcances = detalles.scope
    .map(
      (a) => `<label class="alcance"><input type="checkbox" name="scope" value="${escapar(a)}" checked><span>${escapar(NOMBRE_ALCANCE[a] ?? a)}</span></label>`,
    )
    .join('');
  const aviso = error ? `<div class="caja error"><p>${escapar(error)}</p></div>` : '';
  return documento(
    `Conectar ${detalles.clientName} con tu Cartera`,
    `<h1>¿Conectar <strong>${nombre}</strong> con tu Cartera?</h1>
${aviso}
<p>${origen} El permiso se enviará a <strong>${escapar(detalles.redirectHost)}</strong>.</p>
${local}
<form method="post" action="/authorize">
<input type="hidden" name="handle" value="${escapar(handle)}">
<input type="hidden" name="volver" value="${escapar(volver)}">
<div class="caja">
<div class="campo">
<label for="correo">Tu correo</label>
<input type="text" id="correo" name="correo" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="120" value="${escapar(valores.correo)}">
</div>
<div class="campo">
<label for="contrasena">Tu contraseña</label>
<input type="password" id="contrasena" name="contrasena" autocomplete="current-password" maxlength="200">
</div>
<div class="campo">
<label for="nombre">Tu nombre <span class="ayuda">(solo la primera vez, para crear la cuenta)</span></label>
<input type="text" id="nombre" name="nombre" autocomplete="name" maxlength="60" value="${escapar(valores.nombre)}">
</div>
<p class="ayuda">¿Primera vez? Escribe correo, una contraseña de al menos 8 caracteres y tu nombre, y pulsa «Crear cuenta y entrar». Tu cartera empieza con seis clientes de ejemplo.</p>
</div>
<div class="caja">
<p><strong>${nombre} podrá:</strong></p>
${alcances}
</div>
<div class="botones">
<button class="si" name="decision" value="entrar">Entrar</button>
<button class="si" name="decision" value="crear">Crear cuenta y entrar</button>
<button class="no" name="decision" value="denegar">No permitir</button>
</div>
</form>
<script>${CANDADO}</script>
<p class="pie">Puedes retirar el permiso cuando quieras quitando el conector en Claude.</p>`,
  );
}

export function paginaError(titulo, mensaje, { enlace } = {}) {
  const volver = enlace ? `<div class="botones"><a class="boton si" href="${escapar(enlace)}">Volver a intentarlo</a></div>` : '';
  return documento(titulo, `<h1>${escapar(titulo)}</h1><div class="caja error"><p>${escapar(mensaje)}</p></div>${volver}`);
}
