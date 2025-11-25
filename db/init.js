import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ruta a farmacia.db
const dbPath = path.join(__dirname, 'farmacia.db');
const db = new Database(dbPath);

// CREACIÓN DE TABLAS
db.exec(`
  CREATE TABLE IF NOT EXISTS USUARIOS (
    email TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS PRODUCTOS (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio INTEGER NOT NULL,
    stock INTEGER NOT NULL,
    img TEXT,
    descuento INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS DIRECCIONES (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_usuario TEXT NOT NULL,
    calle TEXT NOT NULL,
    comuna TEXT NOT NULL,
    ref TEXT,
    FOREIGN KEY (email_usuario) REFERENCES USUARIOS(email)
  );

  CREATE TABLE IF NOT EXISTS PEDIDOS (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_usuario TEXT NOT NULL,
    fecha TEXT NOT NULL,
    total INTEGER NOT NULL,
    tipo_entrega TEXT NOT NULL,
    metodo_pago TEXT NOT NULL,
    estado TEXT NOT NULL,
    puntos INTEGER NOT NULL,
    direccion_id INTEGER,
    FOREIGN KEY (email_usuario) REFERENCES USUARIOS(email),
    FOREIGN KEY (direccion_id) REFERENCES DIRECCIONES(id)
  );

  CREATE TABLE IF NOT EXISTS DETALLE_PEDIDO (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario INTEGER NOT NULL,
    descuento_aplicado INTEGER DEFAULT 0,
    FOREIGN KEY (pedido_id) REFERENCES PEDIDOS(id),
    FOREIGN KEY (producto_id) REFERENCES PRODUCTOS(id)
  );

  CREATE TABLE IF NOT EXISTS SUSCRIPCIONES (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    email TEXT NOT NULL,
    fecha TEXT NOT NULL
  );
`);

console.log('Tablas creadas correctamente en farmacia.db');
db.close();
