const express = require('express');
const router = express.Router();
const notaController = require('../controllers/notaController');

router.post('/', notaController.crearNota);
router.get('/', notaController.obtenerNotas);
router.put('/:id', notaController.actualizarNota);
router.delete('/:id', notaController.eliminarNota);

module.exports = router;
