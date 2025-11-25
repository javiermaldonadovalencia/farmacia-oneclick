import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import expressLayouts from 'express-ejs-layouts';
import session from 'express-session';
import Database from 'better-sqlite3';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const db = new Database(path.join(__dirname, '..', 'db', 'farmacia.db'));


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
  { id: 1, nombre: 'Paracetamol 500mg', precio: 1990, stock: 35, img: '/static/images/para500.webp', descuento: 10 },
  { id: 2, nombre: 'Ibuprofeno 400mg',  precio: 2990, stock: 22, img: '/static/images/ibu400.webp', descuento: 20 },
  { id: 3, nombre: 'Amoxicilina 500mg', precio: 4990, stock: 5,  img: '/static/images/amox500.jpg' },
  { id: 4, nombre: 'Melena de León 90 Cápsulas', precio: 12990, stock: 12,  img: '/static/images/melena.jpg' },
  { id: 5, nombre: 'Ginkgo Biloba 120 mg', precio: 8990, stock: 20,  img: '/static/images/ginkgo.jpg' },
  { id: 6, nombre: 'Omega-3 Natural 100 Cápsulas', precio: 10990, stock: 18,  img: '/static/images/omega.jpg', descuento: 15 }
];

// 🚀 Copiar productos demo a la BD si la tabla está vacía
function seedProductosDemo() {
  try {
    const row = db.prepare('SELECT COUNT(*) AS total FROM PRODUCTOS').get();
    if (row.total === 0) {
      const insert = db.prepare(`
        INSERT INTO PRODUCTOS (nombre, precio, stock, img, descuento)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((prods) => {
        prods.forEach((p) => {
          insert.run(
            p.nombre,
            p.precio,
            p.stock,
            p.img || null,
            p.descuento || 0
          );
        });
      });

      insertMany(DEMO_PRODUCTS);
      console.log('DEMO_PRODUCTS copiados a la base de datos.');
    }
  } catch (err) {
    console.error('Error al sembrar productos demo:', err);
  }
}

seedProductosDemo();




// Memoria de direcciones por usuario
const ADDRESS_BY_USER = {}; // { email: [ { id, calle, comuna, ref } ] }

// Memoria de carrito por usuario
const CART_BY_USER = {}; // { email: [ { id, nombre, precio, cantidad } ] }

// Memoria de reservas por usuario
const RESERVAS_BY_USER = {}; // { email: [ { id, fecha, items, total, tipoEntrega, direccion } ] }

const SUBSCRIPTIONS = []; // { nombre, email, fecha }

// Middlewares de protección
function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'ADMIN') return next();
  return res.status(403).send('Acceso restringido: solo ADMIN');
}

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  return res.status(401).send('Debes iniciar sesión');
}

function getProductosDB() {
  try {
    const rows = db.prepare(`SELECT * FROM PRODUCTOS`).all();
    return rows.length ? rows : null;   // si está vacía, devolvemos null
  } catch (err) {
    console.error("Error leyendo productos desde DB:", err);
    return null;
  }
}



// Rutas básicas
app.get('/', (req, res) => {
  res.render('home', {
    title: 'Inicio',
    subOk: req.query.sub === '1'
  });
});


app.get('/catalogo', (req, res) => {
  const added = req.query.added === '1';

  res.render('catalogo', {
    title: 'Catálogo',
    products: DEMO_PRODUCTS,   // memoria
    user: req.session.user,
    added
  });
});

// Vista login (GET)
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

app.post('/suscribirme', (req, res) => {
  const { nombre, email } = req.body;

  if (nombre && email) {
    SUBSCRIPTIONS.push({
      nombre: String(nombre).trim(),
      email: String(email).trim(),
      fecha: new Date()
    });
  }

  res.redirect('/?sub=1');
});


// Cerrar sesión
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Diagnóstico
app.get('/whoami', (req, res) => {
  res.send(
    req.session.user
      ? `Dentro: ${req.session.user.email} (${req.session.user.role})`
      : 'No logueado'
  );
});

// Admin
app.get('/admin', requireAdmin, (req, res) => {
  // juntar todos los pedidos de todos los usuarios
  const pedidos = [];

  for (const email in RESERVAS_BY_USER) {
    const lista = RESERVAS_BY_USER[email];
    lista.forEach((r) => {
      pedidos.push({
        email, // quién hizo el pedido
        ...r,  // id, fecha, items, total, tipoEntrega, direccion, estado, metodoPago, puntos
      });
    });
  }

  const created = req.query.created === '1'; //  viene de /admin?created=1

  res.render('admin', {
  title: 'Admin',
  products: DEMO_PRODUCTS,     // 👈 aquí también memoria
  subscriptions: SUBSCRIPTIONS,
  pedidos,
  created
});

});


// Crear producto (va a la BD)
app.post('/admin/producto/nuevo', requireAdmin, (req, res) => {
  const { nombre, precio, stock } = req.body;

  const p = {
    id: DEMO_PRODUCTS.length ? Math.max(...DEMO_PRODUCTS.map(x => x.id)) + 1 : 1,
    nombre: String(nombre || '').trim(),
    precio: parseInt(precio, 10) || 0,
    stock: parseInt(stock, 10) || 0,
    descuento: 0
  };

  DEMO_PRODUCTS.push(p);

  res.redirect('/admin?created=1#sec-crear');
});








app.post('/admin/producto/actualizar-stock', requireAdmin, (req, res) => {
  const { id, stock } = req.body;
  const numId = parseInt(id, 10);

  const prod = DEMO_PRODUCTS.find(p => p.id === numId);
  if (prod) {
    prod.stock = parseInt(stock, 10) || 0;
  }

  res.redirect('/admin#sec-productos');
});



app.post('/admin/producto/actualizar-descuento', requireAdmin, (req, res) => {
  const { id, descuento } = req.body;
  const numId = parseInt(id, 10);

  const prod = DEMO_PRODUCTS.find(p => p.id === numId);
  if (prod) {
    prod.descuento = parseInt(descuento, 10) || 0;
  }

  res.redirect('/admin#sec-productos');
});



app.post('/admin/producto/eliminar', requireAdmin, (req, res) => {
  const { id } = req.body;
  const numId = parseInt(id, 10);

  const index = DEMO_PRODUCTS.findIndex(p => p.id === numId);

  if (index !== -1) {
    DEMO_PRODUCTS.splice(index, 1);
  }

  res.redirect('/admin#sec-productos');
});




app.post('/admin/pedido/actualizar-estado', requireAdmin, (req, res) => {
  const { id, email, estado } = req.body;

  const lista = RESERVAS_BY_USER[email];
  if (lista) {
    const pedido = lista.find(r => r.id === Number(id));
    if (pedido) {
      pedido.estado = estado || 'Pendiente';
    }
  }


  res.redirect('/admin#sec-pedidos');
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

app.post('/direcciones/eliminar', requireAuth, (req, res) => {
  const email = req.session.user.email;
  const index = parseInt(req.body.index, 10);

  if (
    !Number.isNaN(index) &&
    ADDRESS_BY_USER[email] &&
    ADDRESS_BY_USER[email][index]
  ) {
    ADDRESS_BY_USER[email].splice(index, 1);
  }

  res.redirect('/mis-direcciones');
});


// Carrito
app.post('/carrito/agregar', requireAuth, (req, res) => {
  const { id, cantidad } = req.body;
  const qty = parseInt(cantidad, 10) || 1;
  const email = req.session.user.email;
  const producto = DEMO_PRODUCTS.find(p => p.id === parseInt(id, 10));

  if (!producto) {
    return res.status(400).send('Producto no encontrado');
  }

  if (!CART_BY_USER[email]) CART_BY_USER[email] = [];

  const carrito = CART_BY_USER[email];
  const existente = carrito.find(item => item.id === producto.id);

  if (existente) {
    existente.cantidad += qty;
  } else {
    carrito.push({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad: qty,
      descuento: producto.descuento || 0
    });
  }

  res.redirect('/catalogo?added=1');
});

app.get('/carrito', requireAuth, (req, res) => {
  const email = req.session.user.email;
  const carrito = CART_BY_USER[email] || [];
  const direcciones = ADDRESS_BY_USER[email] || [];

  res.render('carrito', {
    title: 'Mi carrito',
    carrito,
    direcciones
  });
});

app.post('/carrito/eliminar', requireAuth, (req, res) => {
  const email = req.session.user.email;
  const index = parseInt(req.body.index, 10);
  const carrito = CART_BY_USER[email] || [];

  if (!Number.isNaN(index) && carrito[index]) {
    carrito.splice(index, 1);
  }

  res.redirect('/carrito');
});

app.post('/carrito/confirmar', requireAuth, (req, res) => {
  const email = req.session.user.email;
  const carrito = CART_BY_USER[email] || [];

  if (!carrito.length) {
    return res.redirect('/carrito');
  }

  const { tipoEntrega, direccionIndex, metodoPago } = req.body;
  const direcciones = ADDRESS_BY_USER[email] || [];
  let direccionSeleccionada = null;

  if (tipoEntrega === 'delivery' && !Number.isNaN(parseInt(direccionIndex, 10))) {
    const idx = parseInt(direccionIndex, 10);
    if (direcciones[idx]) {
      direccionSeleccionada = direcciones[idx];
    }
  }

  const total = carrito.reduce(
    (acc, item) => {
      const tasaDesc = (item.descuento || 0) / 100;
      const precioConDesc = Math.round(item.precio * (1 - tasaDesc));
      return acc + precioConDesc * item.cantidad;
    },
    0
  );

  if (!RESERVAS_BY_USER[email]) RESERVAS_BY_USER[email] = [];

  const items = carrito.map(item => ({
    nombre: item.nombre,
    cantidad: item.cantidad,
    precio: item.precio,
    descuento: item.descuento || 0
  }));

  RESERVAS_BY_USER[email].push({
    id: Date.now(),
    fecha: new Date(),
    items,
    total,
    tipoEntrega,
    direccion: direccionSeleccionada,
    estado: 'Pendiente',
    metodoPago: metodoPago || 'Efectivo',
    puntos: Math.round(total / 1000)
  });

CART_BY_USER[email] = [];
res.redirect('/mis-reservas?ok=1');  //  señal de orden procesada


});

app.get('/mis-reservas', requireAuth, (req, res) => {
  const email = req.session.user.email;
  const reservas = RESERVAS_BY_USER[email] || [];
  const success = req.query.ok === '1';   

  res.render('mis_reservas', {
    title: 'Mis pedidos',
    reservas,
    success
  });
});



// Newsletter (suscripción desde home)
app.post('/newsletter/suscribir', (req, res) => {
  const { nombre, email } = req.body;
  const cleanNombre = String(nombre || '').trim();
  const cleanEmail = String(email || '').trim();

  if (!cleanEmail) {
    return res.status(400).json({ ok: false, message: 'Email requerido' });
  }

  SUBSCRIPTIONS.push({
    nombre: cleanNombre || 'Sin nombre',
    email: cleanEmail,
    fecha: new Date()
  });

  res.json({ ok: true });
});


// Encender
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
