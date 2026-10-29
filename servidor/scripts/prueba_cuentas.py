"""Prueba la entrada con correo y contraseña contra Cartera desplegada: crear, volver a entrar, contraseña mala,
correo repetido y el código de clase como plan B. Uso: python3 -I scripts/prueba_cuentas.py [url_mcp]"""
import json, secrets, sys, urllib.request
sys.path.insert(0, __import__("os").path.dirname(__file__))
from oauth_cartera import codigo_de, token_para

URL = sys.argv[1] if len(sys.argv) > 1 else "https://cartera-mcp.embed.build/mcp"
correo = f"prueba+{secrets.token_hex(3)}@ejemplo.com"
clave = "huerto-" + secrets.token_hex(4)

def herramienta(token, nombre):
    cuerpo = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": nombre, "arguments": {}}}).encode()
    req = urllib.request.Request(URL, cuerpo, {"content-type": "application/json", "accept": "application/json, text/event-stream",
                                               "authorization": f"Bearer {token}", "user-agent": "prueba-cartera/1.0"}, method="POST")
    texto = urllib.request.urlopen(req, timeout=30).read().decode()
    datos = [l[5:] for l in texto.splitlines() if l.startswith("data:")]
    return json.loads(json.loads(datos[-1] if datos else texto)["result"]["content"][0]["text"])

def intento(titulo, **campos):
    try:
        token = token_para(URL, campos=campos)
        print(f"✔ {titulo}: entra")
        return token
    except ValueError as aviso:
        print(f"✖ {titulo}: {aviso}")

t = intento("crear cuenta", correo=correo, contrasena=clave, nombre="Ana de prueba", decision="crear")
if t:
    hoy = herramienta(t, "a_quien_llamo_hoy")
    print(f"   cartera sembrada: {hoy['total']} entradas en «a quién llamo hoy»")
intento("volver a entrar", correo=correo.upper(), contrasena=clave, decision="entrar")
intento("contraseña mala (debe fallar)", correo=correo, contrasena="otra-cosa-123", decision="entrar")
intento("correo repetido (debe fallar)", correo=correo, contrasena=clave, nombre="Otra", decision="crear")
intento("contraseña corta (debe fallar)", correo="x" + correo, contrasena="corta", nombre="Ana", decision="crear")
from oauth_cartera import CODIGOS
if CODIGOS.exists():  # el fichero de códigos solo existe en el ordenador del profesor
    intento("código de clase (plan B)", correo=codigo_de("Cuenta de prueba"), contrasena="", decision="entrar")
