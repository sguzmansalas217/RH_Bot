# Despliegue en DigitalOcean (Droplet propio)

Guía para correr el sistema en un servidor **independiente** (tu cuenta personal de
DigitalOcean). El código queda 100% separado de cualquier infraestructura de terceros.

> En el Droplet **no hay proxy corporativo**, por eso Baileys (WhatsApp) sí conecta.

---

## 1. Crear el Droplet

1. Entra a https://cloud.digitalocean.com con tu cuenta personal.
2. **Create → Droplets**.
3. Región: la más cercana (ej. NYC / SFO).
4. Imagen: **Ubuntu 22.04 LTS**.
5. Plan: **Basic → Regular → 2 vCPU / 4 GB** (~$24/mes; puedes empezar con 1vCPU/2GB).
6. Autenticación: **SSH Key** (recomendado) o password.
7. Crea y **anota la IP** (ej. `164.92.x.x`).

## 2. Conectarte por SSH

Desde tu PowerShell:
```powershell
ssh root@LA_IP_DEL_DROPLET
```

## 3. Instalar Docker (en el Droplet)

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

## 4. Firewall (solo SSH y web)

```bash
ufw allow OpenSSH
ufw allow 80
ufw --force enable
```

## 5. Subir tu código

**Opción A — GitHub privado (recomendado).** En tu PC, dentro de `D:\projectos_ATOM\rh\RH`:
```powershell
git init
git add .
git commit -m "Sistema RH WhatsApp"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/rh-sistema.git   # crea el repo PRIVADO antes
git push -u origin main
```
Y en el Droplet:
```bash
apt install -y git
git clone https://github.com/TU_USUARIO/rh-sistema.git
cd rh-sistema
```

**Opción B — copiar directo (sin GitHub).** En tu PC (borra node_modules para no subir cientos de MB):
```powershell
Remove-Item -Recurse -Force .\backend\node_modules,.\frontend\node_modules -ErrorAction SilentlyContinue
scp -r D:\projectos_ATOM\rh\RH root@LA_IP:/root/rh-sistema
```
Y en el Droplet: `cd /root/rh-sistema`

## 6. Configurar el .env

```bash
cp .env.production.example .env
nano .env
```
Cambia: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_WHATSAPP` (tu número), y `ANTHROPIC_API_KEY`
si quieres IA real. Guarda con `Ctrl+O`, `Enter`, `Ctrl+X`.

## 7. Compilar el panel (sin instalar Node en el server)

```bash
docker run --rm -v "$PWD/frontend":/app -w /app node:22-slim sh -c "npm install && npm run build"
```

## 8. Levantar todo

```bash
docker compose -f docker-compose.deploy.yml up -d --build
```

## 9. Crear tablas y datos demo

```bash
docker compose -f docker-compose.deploy.yml exec app npm run migrate
docker compose -f docker-compose.deploy.yml exec app npm run seed
```

## 10. Conectar WhatsApp (escanear QR)

```bash
docker compose -f docker-compose.deploy.yml logs -f app
```
Espera a que aparezca el **QR** → escanéalo con el teléfono del bot
(WhatsApp → Dispositivos vinculados). Verás `✅ WhatsApp conectado (Baileys)`.
Sal del log con `Ctrl+C` (el contenedor sigue corriendo).

## 11. Usar el sistema

- **Panel:** `http://LA_IP_DEL_DROPLET/` → login `admin@demo.com` / `admin123`
  (cámbialo enseguida).
- Registra tu número de prueba en **Empleados** y ajusta la geocerca en **Obras**.
- Escribe al bot desde tu teléfono: *"Llegué"* + compartir ubicación.

---

## Comandos útiles

```bash
docker compose -f docker-compose.deploy.yml ps          # estado
docker compose -f docker-compose.deploy.yml logs -f app # logs en vivo
docker compose -f docker-compose.deploy.yml restart app # reiniciar app
docker compose -f docker-compose.deploy.yml down        # detener todo
git pull && docker compose -f docker-compose.deploy.yml up -d --build   # actualizar
```

## Respaldo de la base de datos

```bash
docker compose -f docker-compose.deploy.yml exec db \
  pg_dump -U rh_admin rh_sistema > backup_$(date +%F).sql
```

## (Opcional) Dominio + HTTPS
Cuando tengas un dominio, apúntalo (registro A) a la IP y usa `docker-compose.yml`
(con nginx + certbot) en vez del `.deploy`. Instrucciones en `README.md`.
