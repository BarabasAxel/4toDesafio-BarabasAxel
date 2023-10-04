const express = require('express');
const exphbs = require('express-handlebars');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 8080;

// Configuración de Handlebars
app.engine('handlebars', exphbs.engine({
  layoutsDir: 'views/',
  defaultLayout: null,
  extname: 'handlebars',
}));

app.set('view engine', 'handlebars');
app.set('views', 'views');

// Middleware para parsear JSON en las solicitudes
app.use(express.json());

// Ruta raíz para productos
const productsRouter = express.Router();
app.use('/api/products', productsRouter);

// Ruta raíz para carritos
const cartsRouter = express.Router();
app.use('/api/carts', cartsRouter);

// Función para cargar datos desde un archivo JSON
function loadJSONFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Función para guardar datos en un archivo JSON
function saveJSONFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Configuración de Socket.io
io.on('connection', (socket) => {
  console.log('Cliente conectado');

  // Manejar el evento para agregar un producto
  socket.on('addProduct', (newProduct) => {
    io.emit('newProduct', newProduct);
  });

  // Otras rutas relacionadas con Socket.io y lógica deben ir aquí dentro de io.on
  // app.get('/', (req, res) => { ... });
  // app.get('/realtimeproducts', (req, res) => { ... });
});

// Ruta para la vista de inicio
app.get('/', (req, res) => {
  const products = obtenerProductos();
  res.render('home', { products });
});

// Ruta para la vista en tiempo real
app.get('/realtimeproducts', (req, res) => {
  const products = obtenerProductos();
  res.render('realTimeProducts', { products });
});

// Otras rutas y lógica que no están relacionadas con Socket.io deben ir fuera de io.on

// Ruta raíz GET para obtener todos los productos
productsRouter.get('/', (req, res) => {
  const { limit } = req.query;
  const products = loadJSONFile('products.json');
  if (limit) {
    res.json({ products: products.slice(0, parseInt(limit)) });
  } else {
    res.json({ products });
  }
});

// Ruta GET para obtener un producto por ID
productsRouter.get('/:pid', (req, res) => {
  const { pid } = req.params;
  const products = loadJSONFile('products.json');
  const product = products.find((p) => p.id === pid);
  if (product) {
    res.json({ product });
  } else {
    res.status(404).json({ error: 'Producto no encontrado' });
  }
});

// Ruta raíz POST para agregar un nuevo producto
productsRouter.post('/', (req, res) => {
  const newProduct = req.body;
  const products = loadJSONFile('products.json');

  // Validar que todos los campos obligatorios estén presentes
  if (
    !newProduct.title ||
    !newProduct.description ||
    !newProduct.code ||
    !newProduct.price ||
    !newProduct.stock ||
    !newProduct.category ||
    !newProduct.thumbnails
  ) {
    res.status(400).json({ error: 'Todos los campos son obligatorios excepto thumbnails' });
    return;
  }

  // Generar un nuevo ID y agregar el producto
  const newId = Date.now().toString();
  const productToAdd = {
    id: newId,
    ...newProduct,
    status: true,
  };
  products.push(productToAdd);
  saveJSONFile('products.json', products);

  res.status(201).json({ message: 'Producto agregado', product: productToAdd });
});

// Ruta PUT para actualizar un producto por ID
productsRouter.put('/:pid', (req, res) => {
  const { pid } = req.params;
  const updatedProduct = req.body;
  const products = loadJSONFile('products.json');
  const productIndex = products.findIndex((p) => p.id === pid);

  if (productIndex !== -1) {
    // Mantener el ID original
    updatedProduct.id = pid;

    // Actualizar el producto
    products[productIndex] = updatedProduct;
    saveJSONFile('products.json', products);

    res.json({ message: 'Producto actualizado', product: updatedProduct });
  } else {
    res.status(404).json({ error: 'Producto no encontrado' });
  }
});

// Ruta DELETE para eliminar un producto por ID
productsRouter.delete('/:pid', (req, res) => {
  const { pid } = req.params;
  const products = loadJSONFile('products.json');
  const updatedProducts = products.filter((p) => p.id !== pid);

  if (updatedProducts.length < products.length) {
    saveJSONFile('products.json', updatedProducts);
    res.json({ message: 'Producto eliminado' });
  } else {
    res.status(404).json({ error: 'Producto no encontrado' });
  }
});

// Ruta POST para crear un nuevo carrito
cartsRouter.post('/', (req, res) => {
  const newCart = req.body;
  const carts = loadJSONFile('carts.json');

  // Generar un nuevo ID para el carrito
  const newId = Date.now().toString();
  const cartToAdd = {
    id: newId,
    products: [],
    ...newCart,
  };
  carts.push(cartToAdd);
  saveJSONFile('carts.json', carts);

  res.status(201).json({ message: 'Carrito creado', cart: cartToAdd });
});

// Ruta GET para obtener los productos de un carrito por su ID
cartsRouter.get('/:cid', (req, res) => {
  const { cid } = req.params;
  const carts = loadJSONFile('carts.json');
  const cart = carts.find((c) => c.id === cid);

  if (cart) {
    res.json({ products: cart.products });
  } else {
    res.status(404).json({ error: 'Carrito no encontrado' });
  }
});

// Ruta POST para agregar un producto a un carrito
cartsRouter.post('/:cid/product/:pid', (req, res) => {
  const { cid, pid } = req.params;
  const { quantity } = req.body;
  const carts = loadJSONFile('carts.json');
  const cartIndex = carts.findIndex((c) => c.id === cid);

  if (cartIndex !== -1) {
    const cart = carts[cartIndex];
    const productIndex = cart.products.findIndex((p) => p.id === pid);

    if (productIndex !== -1) {
      // El producto ya existe en el carrito, incrementar la cantidad
      cart.products[productIndex].quantity += quantity;
    } else {
      // El producto no existe en el carrito, agregarlo
      cart.products.push({ id: pid, quantity });
    }

    saveJSONFile('carts.json', carts);
    res.json({ message: 'Producto agregado al carrito', cart: cart.products });
  } else {
    res.status(404).json({ error: 'Carrito no encontrado' });
  }
});

// Iniciar el servidor
server.listen(port, () => {
  console.log(`Servidor en funcionamiento en el puerto ${port}`);
});
