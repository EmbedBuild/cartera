"""Recorre el flujo OAuth de un cliente MCP contra Cartera (DCR + PKCE + código) y llama a una herramienta.
Uso: python3 prueba_oauth.py <url_mcp> <codigo> [herramienta] [argumentos_json]"""
import base64, hashlib, html, http.cookiejar, json, re, secrets, sys, urllib.parse, urllib.request

MCP = sys.argv[1]
CODIGO = sys.argv[2]
HERRAMIENTA = sys.argv[3] if len(sys.argv) > 3 else None
ARGUMENTOS = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}
REDIRECCION = "http://localhost:53682/callback"

tarro = http.cookiejar.CookieJar()

class SinRedireccion(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None

abridor = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(tarro), SinRedireccion)

def pedir(url, datos=None, cabeceras=None, metodo=None):
    req = urllib.request.Request(url, data=datos, headers={"user-agent": "prueba-cartera/1.0", **(cabeceras or {})}, method=metodo)
    try:
        r = abridor.open(req, timeout=20)
        return r.status, dict(r.headers), r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()

def paso(titulo, valor):
    print(f"\n== {titulo}\n{valor}")

# 1. Sin token: 401 con la pista de los metadatos del recurso.
cuerpo = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}).encode()
cab_mcp = {"content-type": "application/json", "accept": "application/json, text/event-stream"}
estado, cab, texto = pedir(MCP, cuerpo, cab_mcp, "POST")
www = {k.lower(): v for k, v in cab.items()}.get("www-authenticate")
paso("1. MCP sin token", f"{estado} · WWW-Authenticate: {www}")
url_prm = re.search(r'resource_metadata="([^"]+)"', www).group(1)

# 2. Metadatos del recurso → servidor de autorización.
estado, _, texto = pedir(url_prm)
prm = json.loads(texto)
paso("2. Protected Resource Metadata", json.dumps(prm, ensure_ascii=False, indent=1))
emisor = prm["authorization_servers"][0]

# 3. Metadatos del servidor de autorización.
estado, _, texto = pedir(emisor + "/.well-known/oauth-authorization-server")
asm = json.loads(texto)
claves = ["issuer", "authorization_endpoint", "token_endpoint", "registration_endpoint", "code_challenge_methods_supported",
          "token_endpoint_auth_methods_supported", "client_id_metadata_document_supported",
          "authorization_response_iss_parameter_supported", "scopes_supported"]
paso("3. AS metadata", json.dumps({k: asm.get(k) for k in claves}, ensure_ascii=False, indent=1))

# 4. Registro dinámico (lo que hacen el Inspector o VS Code).
estado, _, texto = pedir(asm["registration_endpoint"], json.dumps({
    "client_name": "Prueba de Cartera", "redirect_uris": [REDIRECCION],
    "token_endpoint_auth_method": "none", "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
}).encode(), {"content-type": "application/json"}, "POST")
cliente = json.loads(texto)
paso("4. DCR", f"{estado} · client_id={cliente.get('client_id')}")

# 5. Autorización con PKCE: la página de entrada.
verificador = secrets.token_urlsafe(48)
reto = base64.urlsafe_b64encode(hashlib.sha256(verificador.encode()).digest()).rstrip(b"=").decode()
estado_oauth = secrets.token_urlsafe(12)
alcances = " ".join(prm.get("scopes_supported", []))
params = {"response_type": "code", "client_id": cliente["client_id"], "redirect_uri": REDIRECCION, "scope": alcances,
          "state": estado_oauth, "code_challenge": reto, "code_challenge_method": "S256", "resource": prm["resource"]}
estado, cab, pagina = pedir(asm["authorization_endpoint"] + "?" + urllib.parse.urlencode(params))
handle = html.unescape(re.search(r'name="handle" value="([^"]+)"', pagina).group(1))
volver = html.unescape(re.search(r'name="volver" value="([^"]+)"', pagina).group(1))
titulo = re.search(r"<h1>(.*?)</h1>", pagina).group(1)
paso("5. Página de entrada", f"{estado} · {re.sub('<[^>]+>', '', titulo)} · alcances: {re.findall(r'name=.scope. value=.([^\"&]+)', pagina)}")

def enviar(codigo):
    datos = urllib.parse.urlencode([("handle", handle), ("volver", volver), ("correo", codigo), ("contrasena", ""), ("nombre", ""), ("decision", "entrar"),
                                    ("scope", "cartera:leer"), ("scope", "cartera:escribir")]).encode()
    return pedir(asm["authorization_endpoint"], datos, {"content-type": "application/x-www-form-urlencoded",
                                                        "origin": emisor}, "POST")

# 5b. Código equivocado: se vuelve a pintar la página con el aviso.
estado, _, pagina_mal = enviar("NADA-0000")
aviso = re.search(r'class="caja error"><p>(.*?)</p>', pagina_mal)
paso("5b. Código incorrecto", f"{estado} · {aviso.group(1) if aviso else 'sin aviso'}")
handle = html.unescape(re.search(r'name="handle" value="([^"]+)"', pagina_mal).group(1))

# 6. Código bueno → redirección con el código de autorización e iss.
estado, cab, _ = enviar(CODIGO)
destino = {k.lower(): v for k, v in cab.items()}.get("location", "")
q = urllib.parse.parse_qs(urllib.parse.urlparse(destino).query)
paso("6. Permitir", f"{estado} · state ok: {q.get('state', [''])[0] == estado_oauth} · iss: {q.get('iss')} · code: {'sí' if 'code' in q else q}")

# 7. Canje del código por tokens.
estado, _, texto = pedir(asm["token_endpoint"], urllib.parse.urlencode({
    "grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": REDIRECCION, "client_id": cliente["client_id"],
    "code_verifier": verificador, "resource": prm["resource"]}).encode(), {"content-type": "application/x-www-form-urlencoded"}, "POST")
tokens = json.loads(texto)
paso("7. Token", f"{estado} · {tokens.get('token_type')} · expira en {tokens.get('expires_in')} s · scope: {tokens.get('scope')} · refresh: {'sí' if tokens.get('refresh_token') else 'no'}")

# 8. Renovación (rotación del refresh token).
estado, _, texto = pedir(asm["token_endpoint"], urllib.parse.urlencode({
    "grant_type": "refresh_token", "refresh_token": tokens["refresh_token"], "client_id": cliente["client_id"],
    "resource": prm["resource"]}).encode(), {"content-type": "application/x-www-form-urlencoded"}, "POST")
renovado = json.loads(texto)
paso("8. Renovación", f"{estado} · refresh nuevo distinto: {renovado.get('refresh_token') != tokens['refresh_token']}")
acceso = renovado.get("access_token", tokens["access_token"])

# 9. MCP con token.
cab_mcp["authorization"] = f"Bearer {acceso}"
def mcp(metodo, params, id_):
    estado, cab, texto = pedir(MCP, json.dumps({"jsonrpc": "2.0", "id": id_, "method": metodo, "params": params}).encode(), cab_mcp, "POST")
    datos = [l[5:].strip() for l in texto.splitlines() if l.startswith("data:")]
    return estado, json.loads(datos[-1]) if datos else (json.loads(texto) if texto.strip() else None)

estado, r = mcp("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "prueba", "version": "1"}}, 1)
paso("9. initialize", f"{estado} · {json.dumps(r, ensure_ascii=False)[:300]}")
estado, r = mcp("tools/list", {}, 2)
paso("10. tools/list", f"{estado} · {[t['name'] for t in (r or {}).get('result', {}).get('tools', [])]}")
LLAMADAS = json.loads(HERRAMIENTA) if HERRAMIENTA and HERRAMIENTA.startswith("[") else ([[HERRAMIENTA, ARGUMENTOS]] if HERRAMIENTA else [])
for n, (nombre, args) in enumerate(LLAMADAS):
    estado, r = mcp("tools/call", {"name": nombre, "arguments": args}, 10 + n)
    paso(f"11.{n} tools/call {nombre}", f"{estado} · {(r or {}).get('result', {}).get('content', [{}])[0].get('text', json.dumps(r, ensure_ascii=False))[:1800]}")

# 12. Un token de otro recurso no vale (audiencia).
estado, cab, _ = pedir(MCP, json.dumps({"jsonrpc": "2.0", "id": 9, "method": "tools/list"}).encode(),
                       {**cab_mcp, "authorization": "Bearer inventado.123"}, "POST")
paso("12. Token inventado", estado)
