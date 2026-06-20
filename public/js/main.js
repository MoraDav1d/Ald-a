document.addEventListener('DOMContentLoaded', () => {
    console.log('¡Frontend de AlDía conectado perfectamente, pana!');
    
    // Elementos del DOM
    const form = document.getElementById('proyecto-form');
    const inputId = document.getElementById('proyecto-id');
    const inputNombre = document.getElementById('nombre');
    const inputDescripcion = document.getElementById('descripcion');
    const formTitle = document.getElementById('form-title');
    const btnSubmit = document.getElementById('btn-submit');
    const btnCancelar = document.getElementById('btn-cancelar');
    const container = document.getElementById('proyectos-container');

    // URL base de la API para proyectos
    const API_URL = '/api/proyectos';

    // ==========================================
    // 1. READ: Obtener y listar los proyectos
    // ==========================================
    async function obtenerProyectos() {
        try {
            const respuesta = await fetch(API_URL);
            const proyectos = await respuesta.json();
            
            if (proyectos.length === 0) {
                container.innerHTML = `<p class="loading">No hay proyectos registrados todavía. ¡Empieza creando uno!</p>`;
                return;
            }

            container.innerHTML = ''; // Limpiar el contenedor de carga
            
            proyectos.forEach(proyecto => {
                const card = document.createElement('div');
                card.className = 'proyecto-card';
                card.innerHTML = `
                    <h3>${proyecto.nombre}</h3>
                    <p>${proyecto.descripcion || 'Sin descripción.'}</p>
                    <small style="display:block; margin-bottom: 15px; color:#64748b;">📅 Iniciado: ${proyecto.fecha_inicio}</small>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn-editar" style="background-color: #eab308;" data-id="${proyecto.id}" data-nombre="${proyecto.nombre}" data-descripcion="${proyecto.descripcion}">Editar</button>
                        <button class="btn-eliminar" style="background-color: #ef4444;" data-id="${proyecto.id}">Eliminar</button>
                    </div>
                `;
                container.appendChild(card);
            });

            // Asignar eventos a los botones recién creados
            mapearBotones();

        } catch (error) {
            console.error('Error al traer los proyectos:', error);
            container.innerHTML = `<p class="loading" style="color: red;">Error al conectar con el servidor.</p>`;
        }
    }

    // ==========================================
    // 2. CREATE / UPDATE: Manejar el Formulario
    // ==========================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = inputId.value;
        const datos = {
            nombre: inputNombre.value,
            descripcion: inputDescripcion.value
        };

        try {
            let respuesta;
            
            if (id) {
                // Si hay un ID guardado en el input oculto, estamos EDITANDO (PUT)
                respuesta = await fetch(`${API_URL}/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });
            } else {
                // Si no hay ID, estamos CREANDO un nuevo registro (POST)
                respuesta = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });
            }

            if (respuesta.ok) {
                form.reset();
                restablecerFormulario();
                obtenerProyectos(); // Recargar la lista de tarjetas
            } else {
                const errData = await respuesta.json();
                alert(`Error: ${errData.error}`);
            }

        } catch (error) {
            console.error('Error al procesar el formulario:', error);
            alert('Hubo un problema con el servidor al procesar la solicitud.');
        }
    });

    // ==========================================
    // 3. Mapeo de botones de Editar y Eliminar
    // ==========================================
    function mapearBotones() {
        // Botones de Eliminar
        document.querySelectorAll('.btn-eliminar').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm('¿Estás seguro de eliminar este proyecto? Se borrarán todas sus tareas asociadas.')) {
                    try {
                        const respuesta = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
                        if (respuesta.ok) {
                            obtenerProyectos(); // Recargar tarjetas
                        }
                    } catch (error) {
                        console.error('Error al eliminar:', error);
                    }
                }
            });
        });

        // Botones de Editar (Cargar datos en el formulario)
        document.querySelectorAll('.btn-editar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const nombre = e.target.getAttribute('data-nombre');
                const descripcion = e.target.getAttribute('data-descripcion');

                // Rellenar el formulario con los datos de la tarjeta
                inputId.value = id;
                inputNombre.value = nombre;
                inputDescripcion.value = descripcion === 'null' ? '' : descripcion;

                // Modificar la interfaz para reflejar estado de edición
                formTitle.textContent = 'Modificar Proyecto';
                btnSubmit.textContent = 'Actualizar Proyecto';
                btnCancelar.classList.remove('hidden');
            });
        });
    }

    // Cancelar edición voluntariamente
    btnCancelar.addEventListener('click', () => {
        form.reset();
        restablecerFormulario();
    });

    function restablecerFormulario() {
        inputId.value = '';
        formTitle.textContent = 'Crear Nuevo Proyecto';
        btnSubmit.textContent = 'Guardar Proyecto';
        btnCancelar.className = 'hidden';
    }

    // Inicializar la carga de datos al abrir la página
    obtenerProyectos();
});