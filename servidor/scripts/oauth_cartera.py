"""Saca un token de acceso de Cartera para un MCP, recorriendo el mismo flujo OAuth que un cliente
(registro DCR, PKCE, página de entrada con el código y canje). Sin dependencias."""
import base64, hashlib, html, http.cookiejar, json, re, secrets, urllib.parse, urllib.request
from pathlib import Path

REDIRECCION = "http://localhost:53682/callback"
CODIGOS = Path(__file__).resolve().parent.parent / "codigos-alumnos.txt"


class _SinRedireccion(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def _abridor():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), _SinRedireccion)


def _pedir(abridor, url, datos=None, cabeceras=None, metodo=None):
    # La zona embed.build bloquea el agente «Python-urllib» (error 1010): mandamos uno propio.
    req = urllib.request.Request(url, data=datos, headers={"user-agent": "prueba-cartera/1.0", **(cabeceras or {})}, method=metodo)
    try:
        r = abridor.open(req, timeout=30)
        return r.status, dict(r.headers), r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()


def codigo_de(nombre):
    """El código de una fila de codigos-alumnos.txt, por ejemplo «Cuenta de prueba»."""
    for linea in CODIGOS.read_text().splitlines():
        if linea.startswith(nombre):
            return linea.split()[-1]
    raise SystemExit(f"No hay código para «{nombre}» en {CODIGOS}")


def token_para(url_mcp, codigo=None, campos=None):
    """Devuelve un token de acceso de Cartera válido para url_mcp (dura una hora).
    Sin campos, entra con un código de clase; con campos, envía esos datos del formulario
    (por ejemplo {"correo", "contrasena", "nombre", "decision": "crear"|"entrar"})."""
    a = _abridor()
    _, cab, _ = _pedir(a, url_mcp, json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).encode(),
                       {"content-type": "application/json", "accept": "application/json, text/event-stream"}, "POST")
    www = {k.lower(): v for k, v in cab.items()}["www-authenticate"]
    prm = json.loads(_pedir(a, re.search(r'resource_metadata="([^"]+)"', www).group(1))[2])
    emisor = prm["authorization_servers"][0]
    asm = json.loads(_pedir(a, emisor + "/.well-known/oauth-authorization-server")[2])
    cliente = json.loads(_pedir(a, asm["registration_endpoint"], json.dumps({
        "client_name": "Prueba por API", "redirect_uris": [REDIRECCION], "token_endpoint_auth_method": "none",
        "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"]}).encode(),
        {"content-type": "application/json"}, "POST")[2])

    verificador = secrets.token_urlsafe(48)
    reto = base64.urlsafe_b64encode(hashlib.sha256(verificador.encode()).digest()).rstrip(b"=").decode()
    params = {"response_type": "code", "client_id": cliente["client_id"], "redirect_uri": REDIRECCION,
              "scope": " ".join(prm["scopes_supported"]), "state": "s", "code_challenge": reto,
              "code_challenge_method": "S256", "resource": prm["resource"]}
    _, _, pagina = _pedir(a, asm["authorization_endpoint"] + "?" + urllib.parse.urlencode(params))
    campo = lambda n: html.unescape(re.search(rf'name="{n}" value="([^"]+)"', pagina).group(1))
    formulario = campos or {"correo": codigo, "contrasena": "", "decision": "entrar"}
    datos = urllib.parse.urlencode([("handle", campo("handle")), ("volver", campo("volver"))] + list(formulario.items())
                                   + [("scope", s) for s in prm["scopes_supported"]]).encode()
    _, cab, respuesta = _pedir(a, asm["authorization_endpoint"], datos,
                       {"content-type": "application/x-www-form-urlencoded", "origin": emisor}, "POST")
    destino = {k.lower(): v for k, v in cab.items()}.get("location", "")
    code = urllib.parse.parse_qs(urllib.parse.urlparse(destino).query).get("code", [None])[0]
    if not code:
        aviso = re.search(r'class="caja error"><p>(.*?)</p>', respuesta)
        raise ValueError(html.unescape(aviso.group(1)) if aviso else "La entrada en Cartera no ha dado código de autorización")
    tokens = json.loads(_pedir(a, asm["token_endpoint"], urllib.parse.urlencode({
        "grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECCION, "client_id": cliente["client_id"],
        "code_verifier": verificador, "resource": prm["resource"]}).encode(),
        {"content-type": "application/x-www-form-urlencoded"}, "POST")[2])
    return tokens["access_token"]
