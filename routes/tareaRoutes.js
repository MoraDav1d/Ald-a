const express = require('express');
const router = express.Router();
const tareaController = require('../controllers/tareaController');

router.post('/', tareaController.crearTarea);
router.get('/', tareaController.obtenerTareas);
router.put('/reordenar/bulk', tareaController.reordenarTareas);
router.put('/:id', tareaController.actualizarTarea);
router.delete('/:id', tareaController.eliminarTarea);

//Nuevas rutas (Subtareas / checklist / recordatorios)
router.get('/recordatorios', tareaController.obtenerRecordatorios);
router.post('/:tarea_id/subtareas', tareaController.crearSubtarea);
router.put('/subtareas/:id', tareaController.actualizarSubtarea);
router.delete('/subtareas/:id', tareaController.eliminarSubtarea);

module.exports = router;
