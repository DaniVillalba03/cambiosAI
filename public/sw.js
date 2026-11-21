// Service worker mínimo de MiCambio: permite instalar la app en el celular.
// No guarda nada en caché a propósito: los saldos siempre deben venir frescos del servidor.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Sin intercepción: todo va directo a la red.
});
