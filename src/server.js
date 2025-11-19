import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import expressLayouts from 'express-ejs-layouts';
import session from 'express-session';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// EJS + layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Sesiones (memoria para login)
app.use(session({
  secret: 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Exponer user a las vistas
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Leer datos de formularios (POST)
app.use(express.urlencoded({ extended: true }));

// Archivos estáticos
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

// Usuarios de prueba (hardcode)
const USERS = [
  { email: 'admin@demo.cl', password: '123456', role: 'ADMIN' },
  { email: 'user@demo.cl',  password: '123456', role: 'USUARIO' }
];

// Datos de prueba (temporal)
const DEMO_PRODUCTS = [
  { id: 1, nombre: 'Paracetamol 500mg', precio: 1990, stock: 35 },
  { id: 2, nombre: 'Ibuprofeno 400mg',  precio: 2990, stock: 22 },
  { id: 3, nombre: 'Amoxicilina 500mg', precio: 4990, stock: 5  }
];

// Memoria de direcciones por usuario
const ADDRESS_BY_USER = {}; // { email: [ { id, calle, comuna, ref } ] }

// Memoria de carrito por usuario
const CART_BY_USER = {}; // { email: [ { id, nombre, precio, cantidad } ] }
// Memoria de reservas por usuario
const RESERVAS_BY_USER = {}; // { email: [ { id, fecha, items, total } ] }



// Middlewares de protección
function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'ADMIN') return next();
  return res.status(403).send('Acceso restringido: solo ADMIN');
}
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  return res.status(401).send('Debes iniciar sesión');
}

// Rutas
app.get('/', (req, res) => {
  res.render('home', { title: 'Inicio' });
});

app.get('/catalogo', (req, res) => {
  res.render('catalogo', { title: 'Catálogo', products: DEMO_PRODUCTS });
});

app.get('/login', (req, res) => {
  res.render('login', { title: 'Ingresar' });
});

// Procesar login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = USERS.find(u => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).render('login', { 
      title: 'Ingresar',
      error: 'Credenciales inválidas. Intente nuevamente.'
    });
  }

  req.session.user = { email: user.email, role: user.role };
  res.redirect('/');
});


// Cerrar sesión
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Diagnóstico
app.get('/whoami', (req, res) => {
  res.send(req.session.user ? `Dentro: ${req.session.user.email} (${req.session.user.role})` : 'No logueado');
});

// Admin
app.get('/admin', requireAdmin, (req, res) => {
  res.render('admin', { title: 'Admin', products: DEMO_PRODUCTS });
});

app.post('/admin/producto/nuevo', requireAdmin, (req, res) => {
  const { nombre, precio, stock } = req.body;
  const p = {
    id: DEMO_PRODUCTS.length ? Math.max(...DEMO_PRODUCTS.map(x => x.id)) + 1 : 1,
    nombre: String(nombre || '').trim(),
    precio: parseInt(precio, 10) || 0,
    stock: parseInt(stock, 10) || 0
  };
  DEMO_PRODUCTS.push(p);
  res.redirect('/catalogo');
});



// Direcciones
app.get('/direcciones/nueva', requireAuth, (req, res) => {
  res.render('direccion_nueva', { title: 'Nueva dirección' });
});

app.post('/direcciones/nueva', requireAuth, (req, res) => {
  const { calle, comuna, ref } = req.body;
  const email = req.session.user.email;
  if (!ADDRESS_BY_USER[email]) ADDRESS_BY_USER[email] = [];
  ADDRESS_BY_USER[email].push({
    id: Date.now(),
    calle: String(calle || '').trim(),
    comuna: String(comuna || '').trim(),
    ref: String(ref || '').trim()
  });
    res.redirect('/mis-direcciones');
});

app.get('/mis-direcciones', requireAuth, (req, res) => {
  const email = req.session.user.email;
  const direcciones = ADDRESS_BY_USER[email] || [];
  res.render('mis_direcciones', { title: 'Mis direcciones', direcciones });
});

// Carrito
app.post('/carrito/agregar', requireAuth, (req, res) => {
  const { id } = req.body;
  const email = req.session.user.email;
  const producto = DEMO_PRODUCTS.find(p => p.id === parseInt(id, 10));

  if (!producto) {
    return res.status(400).send('Producto no encontrado');
  }

  if (!CART_BY_USER[email]) CART_BY_USER[email] = [];

  const carrito = CART_BY_USER[email];
  const existente = carrito.find(item => item.id === producto.id);

  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.push({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad: 1
    });
  }

  res.redirect('/carrito');
});

app.get('/carrito', requireAuth, (req, res) => {
  const email = req.session.user.email;
  const carrito = CART_BY_USER[email] || [];
  res.render('carrito', { title: 'Mi carrito', carrito });
});

app.post('/carrito/confirmar', requireAuth, (req, res) => {
  const email = req.session.user.email;
  const carrito = CART_BY_USER[email] || [];

  if (!carrito.length) {
    return res.redirect('/carrito');
  }

  const total = carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);

  if (!RESERVAS_BY_USER[email]) RESERVAS_BY_USER[email] = [];

  RESERVAS_BY_USER[email].push({
    id: Date.now(),
    fecha: new Date(),
    items: carrito.map(item => ({
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio: item.precio
    })),
    total
  });

  // Vaciar carrito
  CART_BY_USER[email] = [];

  res.redirect('/mis-reservas');
});

app.get('/mis-reservas', requireAuth, (req, res) => {
  const email = req.session.user.email;
  const reservas = RESERVAS_BY_USER[email] || [];
  res.render('mis_reservas', { title: 'Mis reservas', reservas });
});



// Encender
app.listen(3000, () => {
  console.log('Servidor listo en http://localhost:3000');
});
