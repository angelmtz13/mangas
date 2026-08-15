const API_URL = 'https://api.jikan.moe/v4';

let listaMangas = [];
let biblioteca = JSON.parse(localStorage.getItem('mangaVerseLibrary')) || {};
let seccionActual = 'top';
let filtroEstado = 'todos';
let busquedaActual = '';
let mangaSeleccionadoId = null;
let timerBusqueda = null;

function extraerDatos(item) {
    if (!item) return null;

    let id = item.mal_id || item.id;
    let imagen = item.images?.jpg?.large_image_url || item.image_url || 'https://via.placeholder.com/225x320?text=Sin+Imagen';

    let generos = [];
    if (Array.isArray(item.genres)) {
        generos = item.genres.map(g => typeof g === 'string' ? g : g.name);
    }

    let autores = [];
    if (Array.isArray(item.authors)) {
        autores = item.authors.map(a => typeof a === 'string' ? a : a.name);
    }

    return {
        id: id,
        title: item.title || 'Sin título',
        title_english: item.title_english || item.title || '',
        image_url: imagen,
        score: item.score || 0,
        genres: generos,
        synopsis: item.synopsis || 'Sin descripción disponible.',
        chapters: item.chapters || 'En publicación',
        volumes: item.volumes || 'En publicación',
        status_api: item.status || 'Desconocido',
        authors: autores
    };
}

function extraerDatosKitsu(item) {
    if (!item) return null;
    let attr = item.attributes || {};
    let poster = attr.posterImage?.medium || attr.posterImage?.large || attr.posterImage?.original || 'https://via.placeholder.com/225x320?text=Sin+Imagen';
    let score = attr.averageRating ? (parseFloat(attr.averageRating) / 10).toFixed(1) : 0;

    return {
        id: `kitsu-${item.id}`,
        title: attr.canonicalTitle || attr.titles?.en || 'Sin título',
        title_english: attr.titles?.en || attr.canonicalTitle || '',
        image_url: poster,
        score: parseFloat(score),
        genres: ['Manga'],
        synopsis: attr.synopsis || attr.description || 'Sin descripción disponible.',
        chapters: attr.chapterCount || 'En publicación',
        volumes: attr.volumeCount || 'En publicación',
        status_api: attr.status || 'Desconocido',
        authors: []
    };
}

async function cargarTopMangas() {
    mostrarCargando(true);
    let tituloSeccion = document.getElementById('section-title');
    if (tituloSeccion) tituloSeccion.textContent = 'Mangas del Momento';

    try {
        let respuesta = await fetch(`${API_URL}/top/manga`);
        let datos = await respuesta.json();
        listaMangas = (datos.data || []).map(extraerDatos);
        mostrarCargando(false);
        renderizarGrid(listaMangas);
    } catch (error) {
        mostrarError('No se pudieron cargar los mangas populares.');
    }
}

async function buscarMangas() {
    if (seccionActual === 'library') {
        renderizarBiblioteca();
        return;
    }

    let texto = busquedaActual.trim();
    let tituloSeccion = document.getElementById('section-title');

    if (!texto) {
        cargarTopMangas();
        return;
    }

    if (tituloSeccion) {
        tituloSeccion.textContent = `Resultados de búsqueda: "${texto}"`;
    }

    mostrarCargando(true);

    try {
        let respuesta = await fetch(`${API_URL}/manga?q=${encodeURIComponent(texto)}&limit=24`);
        if (!respuesta.ok) throw new Error('Error Jikan API');
        let datos = await respuesta.json();

        if (datos.data && Array.isArray(datos.data) && datos.data.length > 0) {
            listaMangas = datos.data.map(extraerDatos);
            mostrarCargando(false);
            renderizarGrid(listaMangas);
            return;
        }
        throw new Error('Sin resultados Jikan');
    } catch (e) {
        try {
            let resKitsu = await fetch(`https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(texto)}&page[limit]=24`);
            if (resKitsu.ok) {
                let datosKitsu = await resKitsu.json();
                if (datosKitsu.data && datosKitsu.data.length > 0) {
                    listaMangas = datosKitsu.data.map(extraerDatosKitsu);
                    mostrarCargando(false);
                    renderizarGrid(listaMangas);
                    return;
                }
            }
        } catch (errKitsu) {}

        mostrarCargando(false);
        let filtradosLocal = listaMangas.filter(m => 
            (m.title || '').toLowerCase().includes(texto.toLowerCase()) || 
            (m.title_english || '').toLowerCase().includes(texto.toLowerCase())
        );

        if (filtradosLocal.length > 0) {
            renderizarGrid(filtradosLocal);
        } else {
            mostrarError('No se encontraron resultados para tu búsqueda.');
        }
    }
}

function manejarBusqueda(valor) {
    busquedaActual = valor;
    let btnLimpiar = document.getElementById('clear-search');
    if (btnLimpiar) {
        btnLimpiar.style.display = valor ? 'flex' : 'none';
    }

    clearTimeout(timerBusqueda);
    timerBusqueda = setTimeout(() => {
        buscarMangas();
    }, 400);
}

function manejarTeclaBusqueda(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(timerBusqueda);
        buscarMangas();
    }
}

function limpiarBusqueda() {
    let input = document.getElementById('search-input');
    if (input) input.value = '';
    busquedaActual = '';
    let btnLimpiar = document.getElementById('clear-search');
    if (btnLimpiar) btnLimpiar.style.display = 'none';
    clearTimeout(timerBusqueda);
    buscarMangas();
}

function irAlInicio() {
    filtrarSeccion('top', document.getElementById('btn-filter-top'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filtrarSeccion(seccion, elemento) {
    seccionActual = seccion;

    let botones = document.querySelectorAll('.btn-filter');
    botones.forEach(btn => btn.classList.remove('active'));
    if (elemento) elemento.classList.add('active');

    let subfiltros = document.getElementById('library-subfilters');
    let titulo = document.getElementById('section-title');

    if (seccion === 'library') {
        if (subfiltros) subfiltros.style.display = 'flex';
        if (titulo) titulo.textContent = 'Mi Biblioteca Personal';
        renderizarBiblioteca();
    } else {
        if (subfiltros) subfiltros.style.display = 'none';
        limpiarBusqueda();
    }
}

function filtrarEstadoBiblioteca(estado, elemento) {
    filtroEstado = estado;

    let botones = document.querySelectorAll('.btn-subfilter');
    botones.forEach(btn => btn.classList.remove('active'));
    if (elemento) elemento.classList.add('active');

    renderizarBiblioteca();
}

function guardarEnLocalStorage() {
    localStorage.setItem('mangaVerseLibrary', JSON.stringify(biblioteca));
}

function actualizarEstadoManga(manga, nuevoEstado) {
    let id = manga.id;

    if (nuevoEstado === 'sin_estado') {
        if (biblioteca[id]) {
            delete biblioteca[id];
            mostrarToast(`Eliminado "${manga.title}" de tu biblioteca`, 'warning');
        }
    } else {
        let existe = biblioteca[id];
        biblioteca[id] = {
            ...extraerDatos(manga),
            status: nuevoEstado
        };

        if (!existe) {
            mostrarToast(`Añadido "${manga.title}" a tu biblioteca`, 'success');
        } else {
            mostrarToast(`Actualizado "${manga.title}"`, 'info');
        }
    }

    guardarEnLocalStorage();
    actualizarEstadisticas();

    if (seccionActual === 'library') {
        renderizarBiblioteca();
    }
}

function cambiarEstadoTarjeta(id, estado) {
    let manga = listaMangas.find(m => m.id === id) || biblioteca[id];
    if (manga) {
        actualizarEstadoManga(manga, estado);
    }
}

function cambiarEstadoModal(estado) {
    if (!mangaSeleccionadoId) return;

    cambiarEstadoTarjeta(mangaSeleccionadoId, estado);

    let tarjeta = document.getElementById(`card-${mangaSeleccionadoId}`);
    if (tarjeta) {
        tarjeta.className = `card ${estado !== 'sin_estado' ? 'estado-' + estado : ''}`;
        let select = tarjeta.querySelector('.status-select');
        if (select) select.value = estado;
    }
}

function actualizarEstadisticas() {
    let items = Object.values(biblioteca);

    let total = items.length;
    let leyendo = items.filter(m => m.status === 'leyendo').length;
    let pendientes = items.filter(m => m.status === 'pendiente').length;
    let completados = items.filter(m => m.status === 'completado').length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-reading').textContent = leyendo;
    document.getElementById('stat-pending').textContent = pendientes;
    document.getElementById('stat-completed').textContent = completados;
}

function renderizarBiblioteca() {
    mostrarCargando(false);
    let items = Object.values(biblioteca);

    if (filtroEstado !== 'todos') {
        items = items.filter(m => m.status === filtroEstado);
    }

    if (busquedaActual.trim()) {
        let query = busquedaActual.toLowerCase();
        items = items.filter(m => {
            let titulo = (m.title || '').toLowerCase();
            let tituloEn = (m.title_english || '').toLowerCase();
            return titulo.includes(query) || tituloEn.includes(query);
        });
    }

    renderizarGrid(items);
}

function renderizarGrid(lista) {
    let contenedor = document.getElementById('contenedor-mangas');

    if (!lista || lista.length === 0) {
        contenedor.innerHTML = `
            <div class="empty-message">
                <p>No se encontraron mangas</p>
            </div>`;
        return;
    }

    contenedor.innerHTML = lista.map(manga => {
        let id = manga.id;
        let estado = biblioteca[id]?.status || 'sin_estado';
        let claseEstado = estado !== 'sin_estado' ? `estado-${estado}` : '';
        let score = manga.score ? Number(manga.score).toFixed(1) : '0.0';
        let generos = (manga.genres || []).slice(0, 2);

        let badges = generos.length > 0 
            ? generos.map(g => `<span class="badge">${g}</span>`).join(' ') 
            : '<span class="badge">Manga</span>';

        return `
            <div class="card ${claseEstado}" id="card-${id}">
                <div class="card-img-wrapper" onclick="abrirModal(${id})">
                    <img src="${manga.image_url}" alt="${manga.title}">
                    <div class="card-rating-badge">★ ${score}</div>
                </div>
                <div class="card-body">
                    <div class="card-header-info">
                        <h3 class="card-title" onclick="abrirModal(${id})">${manga.title}</h3>
                    </div>
                    <div class="card-genres">${badges}</div>
                    <select class="status-select" onchange="cambiarEstadoTarjeta(${id}, this.value)">
                        <option value="sin_estado" ${estado === 'sin_estado' ? 'selected' : ''}>No registrado</option>
                        <option value="pendiente" ${estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="leyendo" ${estado === 'leyendo' ? 'selected' : ''}>Leyendo</option>
                        <option value="completado" ${estado === 'completado' ? 'selected' : ''}>Completado</option>
                    </select>
                </div>
            </div>`;
    }).join('');
}

function abrirModal(id) {
    mangaSeleccionadoId = id;
    let manga = listaMangas.find(m => m.id === id) || biblioteca[id];
    if (!manga) return;

    let modal = document.getElementById('manga-modal');

    document.getElementById('modal-title').textContent = manga.title;
    document.getElementById('modal-title-english').textContent = manga.title_english || '';
    document.getElementById('modal-poster').src = manga.image_url;
    document.getElementById('modal-banner').style.backgroundImage = `url('${manga.image_url}')`;
    document.getElementById('modal-genre').textContent = manga.genres[0] || 'Manga';
    document.getElementById('modal-rating-value').textContent = manga.score ? Number(manga.score).toFixed(1) : '0.0';
    document.getElementById('modal-chapters').textContent = manga.chapters;
    document.getElementById('modal-volumes').textContent = manga.volumes;
    document.getElementById('modal-status-api').textContent = manga.status_api;
    document.getElementById('modal-authors').textContent = manga.authors.join(', ') || 'No especificados';
    document.getElementById('modal-synopsis').textContent = manga.synopsis;

    let select = document.getElementById('modal-status-select');
    if (select) {
        select.value = biblioteca[id]?.status || 'sin_estado';
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function cerrarModal() {
    let modal = document.getElementById('manga-modal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    mangaSeleccionadoId = null;
}

window.onclick = function (event) {
    let modal = document.getElementById('manga-modal');
    if (event.target === modal) {
        cerrarModal();
    }
};

function mostrarCargando(estado) {
    let loader = document.getElementById('loading');
    let grid = document.getElementById('contenedor-mangas');
    if (loader) loader.style.display = estado ? 'flex' : 'none';
    if (grid) grid.style.display = estado ? 'none' : 'grid';
}

function mostrarError(mensaje) {
    mostrarCargando(false);
    let grid = document.getElementById('contenedor-mangas');
    if (!grid) return;

    grid.style.display = 'block';
    grid.innerHTML = `
        <div class="error-container">
            <p>Error: ${mensaje}</p>
            <button onclick="cargarTopMangas()" class="btn-retry">Reintentar</button>
        </div>`;
}

function mostrarToast(mensaje, tipo) {
    let container = document.getElementById('toast-container');
    if (!container) return;

    let toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensaje;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2500);
}

document.addEventListener("DOMContentLoaded", () => {
    actualizarEstadisticas();
    cargarTopMangas();
});
