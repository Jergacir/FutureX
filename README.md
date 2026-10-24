# FutureX - asistente financiero

## Iniciar localmente

1. Instala Node.js 20 o posterior.
2. En la carpeta del proyecto ejecuta `npm install`.
3. Copia `.env.example` a `.env`.
4. En `.env`, configura `JWT_SECRET` con una cadena aleatoria larga. Puedes generarla con:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

5. Añade tu `GEMINI_API_KEY` si quieres habilitar la extracción con Gemini. La clave permanece en el backend, no en el navegador.
6. Ejecuta `npm run dev` y abre `http://localhost:3000`.
7. Crea una cuenta desde la pantalla de inicio de sesión. Las transacciones nuevas quedan asociadas a esa cuenta.

## Almacenamiento sin base de datos

Las cuentas y transacciones se guardan en archivos JSON dentro de `data/`. Las contraseñas se almacenan como hashes bcrypt. El servidor identifica al usuario desde una cookie de sesión firmada y filtra los reportes y el historial usando esa identidad; no acepta un `userId` enviado por el navegador.

Este modo sirve para un prototipo local o una demostración con una sola instancia del servidor. No es almacenamiento fiable para producción multiusuario:

- algunos hostings borran el disco local al redeplegar o reiniciar;
- varias instancias no comparten los archivos y podrían sobrescribir cambios;
- JSON no proporciona copias de seguridad, transacciones ni control de concurrencia robusto.

Si lo publicas para una demo, usa un host con disco persistente, una sola instancia y configura `JWT_SECRET` como secreto del host. No subas `.env` ni los archivos de `data/` a GitHub. Para datos reales o un servicio financiero, migra a una base de datos gestionada y añade copias de seguridad, recuperación de cuentas, HTTPS y revisión de seguridad.

Las transacciones antiguas sin `userId` se mantienen en el archivo, pero no se muestran a ninguna cuenta por seguridad. No se asignan automáticamente para evitar revelar datos de un usuario a otro.
