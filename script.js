const API_BASE_URL = 'https://api.jikan.moe/v4';

let todosLosMangas = [];
let mangasBiblioteca = JSON.parse(localStorage.getItem('mangaVerseLibrary')) || {};

let seccionActual = 'top';
let estadoFiltroBiblioteca = 'todos';
let textoBusqueda = '';
let modalMangaId = null;
let debounceTimer = null;

function normalizarManga(item) {
    if (!item) return null;

    const id = item.mal_id || item.id;

    let img = 'https://via.placeholder.com/225x320?text=Sin+Imagen';
    if (item.images && item.images.jpg) {
        img = item.images.jpg.large_image_url || item.images.jpg.image_url || img;
    } else if (item.image_url) {
        img = item.image_url;
    }

    let genres = [];
    if (Array.isArray(item.genres)) {
        genres = item.genres.map(g => (typeof g === 'string' ? g : g.name));
    }

    let authors = [];
    if (Array.isArray(item.authors)) {
        authors = item.authors.map(a => (typeof a === 'string' ? a : a.name));
    }

    return {
        id: id,
        mal_id: id,
        title: item.title || 'Sin título',
        title_english: item.title_english || item.title || '',
        image_url: img,
        score: item.score || 0,
        genres: genres,
        synopsis: item.synopsis || 'Sin descripción disponible.',
        synopsis_es: item.synopsis_es || '',
        chapters: item.chapters || 'En publicación',
        volumes: item.volumes || 'En publicación',
        status_api: item.status || item.status_api || 'Desconocido',
        authors: authors
    };
}

async function traducirAlEspanol(texto) {
    if (!texto || texto.includes('Sin descripción')) {
        return texto;
    }

    try {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=' + encodeURIComponent(texto);
        const respuesta = await fetch(url);
        const datos = await respuesta.json();

        if (datos && datos[0]) {
            return datos[0].map(parte => parte[0]).join('');
        }
        return texto;
    } catch (error) {
        return texto;
    }
}

async function buscarEnAniList(query) {
    const gqlQuery = `
        query ($s: String) {
            Page(perPage: 24) {
                media(search: $s, type: MANGA) {
                    id
                    title { romaji english native }
                    coverImage { large extraLarge }
                    averageScore
                    genres
                    description
                    chapters
                    volumes
                    status
                    staff { nodes { name { full } } }
                }
            }
        }
    `;

    const respuesta = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: gqlQuery,
            variables: { s: query }
        })
    });

    if (!respuesta.ok) {
        throw new Error('Error al conectar con AniList');
    }

    const datos = await respuesta.json();
    const listaMedia = datos.data?.Page?.media || [];

    return listaMedia.map(item => {
        const sinopsisLimpia = (item.description || 'Sin descripción').replace(/<[^>]*>?/gm, '');

        let estadoTraducido = item.status || 'Desconocido';
        if (item.status === 'FINISHED') estadoTraducido = 'Finalizado';
        if (item.status === 'RELEASING') estadoTraducido = 'En publicación';

        const listaAutores = (item.staff?.nodes || [])
            .map(nodo => nodo.name?.full)
            .filter(Boolean);

        return {
            id: item.id,
            mal_id: item.id,
            title: item.title?.romaji || item.title?.english || item.title?.native || 'Sin título',
            title_english: item.title?.english || item.title?.romaji || '',
            image_url: item.coverImage?.extraLarge || item.coverImage?.large || '',
            score: item.averageScore ? item.averageScore / 10 : 0,
            genres: item.genres || [],
            synopsis: sinopsisLimpia,
            chapters: item.chapters || 'En publicación',
            volumes: item.volumes || 'En publicación',
            status_api: estadoTraducido,
            authors: listaAutores
        };
    });
}

async function obtenerTopMangas() {
    const titleEl = document.getElementById('section-title');
    if (titleEl && seccionActual === 'top' && !textoBusqueda.trim()) {
        titleEl.textContent = 'Mangas del Momento';
    }

    mostrarCargando(true);

    try {
        const respuesta = await fetch(`${API_BASE_URL}/top/manga`);
        if (!respuesta.ok) throw new Error('Error API Jikan');

        const datos = await respuesta.json();
        todosLosMangas = (datos.data || []).map(normalizarManga);

        mostrarCargando(false);
        renderizarGrid(todosLosMangas);
    } catch (error) {
        mostrarError('Error al cargar mangas populares. Inténtalo de nuevo.');
    }
}

async function ejecutarBusqueda() {
    if (seccionActual === 'library') {
        renderizarBiblioteca();
        return;
    }

    const query = textoBusqueda.trim();
    const titleEl = document.getElementById('section-title');

    if (!query) {
        if (titleEl) titleEl.textContent = 'Mangas del Momento';
        obtenerTopMangas();
        return;
    }

    if (titleEl) {
        titleEl.textContent = `Resultados de búsqueda: "${query}"`;
    }

    mostrarCargando(true);

    try {
        const resultadosAniList = await buscarEnAniList(query);
        if (resultadosAniList.length > 0) {
            todosLosMangas = resultadosAniList;
            mostrarCargando(false);
            renderizarGrid(todosLosMangas);
            return;
        }
    } catch (errorAniList) {
        console.warn('AniList falló, intentando con Jikan:', errorAniList);
    }

    try {
        const respuesta = await fetch(`${API_BASE_URL}/manga?q=${encodeURIComponent(query)}&limit=24&sfw=true`);
        if (!respuesta.ok) throw new Error('Error API Jikan');

        const datos = await respuesta.json();
        todosLosMangas = (datos.data || []).map(normalizarManga);

        mostrarCargando(false);

        if (todosLosMangas.length > 0) {
            renderizarGrid(todosLosMangas);
            return;
        }
    } catch (errorJikan) {
        console.warn('Jikan falló:', errorJikan);
    }

    mostrarCargando(false);
    mostrarError('No se encontraron resultados para tu búsqueda.');
}

function manejarBusqueda(val) {
    textoBusqueda = val;
    const btnLimpiar = document.getElementById('clear-search');
    if (btnLimpiar) {
        btnLimpiar.style.display = val ? 'flex' : 'none';
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        ejecutarBusqueda();
    }, 300);
}

function manejarTeclaBusqueda(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(debounceTimer);
        ejecutarBusqueda();
    }
}

function limpiarBusqueda() {
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    manejarBusqueda('');
}

function irAlInicio() {
    filtrarSeccion('top', document.getElementById('btn-filter-top'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filtrarSeccion(seccion, elemento) {
    seccionActual = seccion;

    document.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
    if (elemento) elemento.classList.add('active');

    const subfilters = document.getElementById('library-subfilters');
    const title = document.getElementById('section-title');

    if (seccion === 'library') {
        if (subfilters) subfilters.style.display = 'flex';
        if (title) title.textContent = 'Mi Biblioteca Personal';
        renderizarBiblioteca();
    } else {
        if (subfilters) subfilters.style.display = 'none';
        if (title) title.textContent = 'Mangas del Momento';
        limpiarBusqueda();
        obtenerTopMangas();
    }
}

function filtrarEstadoBiblioteca(estado, elemento) {
    estadoFiltroBiblioteca = estado;

    document.querySelectorAll('.btn-subfilter').forEach(btn => btn.classList.remove('active'));
    if (elemento) elemento.classList.add('active');

    renderizarBiblioteca();
}

function actualizarMangaBiblioteca(manga, estado) {
    const id = manga.id;

    if (estado === 'sin_estado') {
        if (mangasBiblioteca[id]) {
            delete mangasBiblioteca[id];
            showToast(`Eliminado "${manga.title}" de tu biblioteca`, 'warning');
        }
    } else {
        const esNuevo = !mangasBiblioteca[id];
        const estadoAnterior = esNuevo ? '' : mangasBiblioteca[id].status;

        mangasBiblioteca[id] = {
            ...normalizarManga(manga),
            status: estado
        };

        if (esNuevo) {
            showToast(`Añadido "${manga.title}" a tu biblioteca`, 'success');
        } else if (estadoAnterior !== estado) {
            showToast(`Actualizado "${manga.title}" a: ${estado.toUpperCase()}`, 'info');
        }
    }

    localStorage.setItem('mangaVerseLibrary', JSON.stringify(mangasBiblioteca));

    actualizarDashboard();
    if (seccionActual === 'library') {
        renderizarBiblioteca();
    }
}

function cambiarEstadoDesdeCard(id, nuevoEstado) {
    const manga = todosLosMangas.find(m => m.id === id) || mangasBiblioteca[id];
    if (manga) {
        actualizarMangaBiblioteca(manga, nuevoEstado);
    }
}

function cambiarEstadoDesdeModal(nuevoEstado) {
    if (modalMangaId === null) return;

    cambiarEstadoDesdeCard(modalMangaId, nuevoEstado);

    const card = document.getElementById(`card-${modalMangaId}`);
    if (card) {
        card.className = `card ${nuevoEstado !== 'sin_estado' ? 'estado-' + nuevoEstado : ''}`;
        const select = card.querySelector('.status-select');
        if (select) select.value = nuevoEstado;
    }
}

function actualizarDashboard() {
    const lista = Object.values(mangasBiblioteca);

    const total = lista.length;
    const leyendo = lista.filter(item => item.status === 'leyendo').length;
    const pendientes = lista.filter(item => item.status === 'pendiente').length;
    const completados = lista.filter(item => item.status === 'completado').length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-reading').textContent = leyendo;
    document.getElementById('stat-pending').textContent = pendientes;
    document.getElementById('stat-completed').textContent = completados;
}

function renderizarBiblioteca() {
    mostrarCargando(false);
    let lista = Object.values(mangasBiblioteca);

    if (estadoFiltroBiblioteca !== 'todos') {
        lista = lista.filter(item => item.status === estadoFiltroBiblioteca);
    }

    if (textoBusqueda.trim()) {
        const query = textoBusqueda.toLowerCase();
        lista = lista.filter(item => {
            const tituloEs = (item.title || '').toLowerCase();
            const tituloEn = (item.title_english || '').toLowerCase();
            return tituloEs.includes(query) || tituloEn.includes(query);
        });
    }

    renderizarGrid(lista);
}

function renderizarGrid(lista) {
    const contenedor = document.getElementById('contenedor-mangas');

    if (!lista || lista.length === 0) {
        contenedor.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:60px 20px; color:var(--text-secondary);">
                <p style="font-size:1.1rem; font-weight:500;">No se encontraron mangas</p>
            </div>`;
        return;
    }

    contenedor.innerHTML = lista.map(manga => {
        const id = manga.id;
        const estadoEnBiblioteca = mangasBiblioteca[id]?.status || 'sin_estado';

        let claseEstado = '';
        if (estadoEnBiblioteca !== 'sin_estado') {
            claseEstado = `estado-${estadoEnBiblioteca}`;
        }

        const scoreFormateado = manga.score ? Number(manga.score).toFixed(1) : '0.0';
        const generosCorta = (manga.genres || []).slice(0, 2);

        let htmlBadges = '<span class="badge">Manga</span>';
        if (generosCorta.length > 0) {
            htmlBadges = generosCorta.map(g => `<span class="badge">${g}</span>`).join(' ');
        }

        return `
            <div class="card ${claseEstado}" id="card-${id}">
                <div class="card-img-wrapper" onclick="abrirModal(${id})">
                    <img src="${manga.image_url}" alt="${manga.title}" loading="lazy">
                    <div class="card-rating-badge">★ ${scoreFormateado}</div>
                </div>
                <div class="card-body">
                    <div class="card-header-info">
                        <h3 class="card-title" onclick="abrirModal(${id})">${manga.title}</h3>
                    </div>
                    <div class="card-genres">${htmlBadges}</div>
                    <select class="status-select" onchange="cambiarEstadoDesdeCard(${id}, this.value)">
                        <option value="sin_estado" ${estadoEnBiblioteca === 'sin_estado' ? 'selected' : ''}>No registrado</option>
                        <option value="pendiente" ${estadoEnBiblioteca === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="leyendo" ${estadoEnBiblioteca === 'leyendo' ? 'selected' : ''}>Leyendo</option>
                        <option value="completado" ${estadoEnBiblioteca === 'completado' ? 'selected' : ''}>Completado</option>
                    </select>
                </div>
            </div>`;
    }).join('');
}

function abrirModal(id) {
    modalMangaId = id;
    const manga = todosLosMangas.find(m => m.id === id) || mangasBiblioteca[id];
    if (!manga) return;

    const norm = normalizarManga(manga);
    const modal = document.getElementById('manga-modal');

    document.getElementById('modal-title').textContent = norm.title;
    document.getElementById('modal-title-english').textContent = norm.title_english;
    document.getElementById('modal-poster').src = norm.image_url;
    document.getElementById('modal-banner').style.backgroundImage = `url('${norm.image_url}')`;
    document.getElementById('modal-genre').textContent = norm.genres[0] || 'Manga';
    document.getElementById('modal-rating-value').textContent = norm.score ? Number(norm.score).toFixed(1) : '0.0';
    document.getElementById('modal-chapters').textContent = norm.chapters;
    document.getElementById('modal-volumes').textContent = norm.volumes;
    document.getElementById('modal-status-api').textContent = norm.status_api;
    document.getElementById('modal-authors').textContent = norm.authors.join(', ') || 'No especificados';

    const synEl = document.getElementById('modal-synopsis');

    if (manga.synopsis_es) {
        synEl.textContent = manga.synopsis_es;
    } else if (norm.synopsis && !norm.synopsis.includes('Sin descripción')) {
        synEl.textContent = 'Traduciendo sinopsis al español...';
        traducirAlEspanol(norm.synopsis).then(traduccion => {
            if (modalMangaId === id) {
                synEl.textContent = traduccion;
            }
            manga.synopsis_es = traduccion;
            if (mangasBiblioteca[id]) {
                mangasBiblioteca[id].synopsis_es = traduccion;
                localStorage.setItem('mangaVerseLibrary', JSON.stringify(mangasBiblioteca));
            }
        });
    } else {
        synEl.textContent = norm.synopsis;
    }

    const select = document.getElementById('modal-status-select');
    if (select) {
        select.value = mangasBiblioteca[id]?.status || 'sin_estado';
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function cerrarModal() {
    const modal = document.getElementById('manga-modal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    modalMangaId = null;
}

window.onclick = function (event) {
    const modal = document.getElementById('manga-modal');
    if (event.target === modal) {
        cerrarModal();
    }
};

function mostrarCargando(estado) {
    const loader = document.getElementById('loading');
    const grid = document.getElementById('contenedor-mangas');
    if (loader) loader.style.display = estado ? 'flex' : 'none';
    if (grid) grid.style.display = estado ? 'none' : 'grid';
}

function mostrarError(mensaje) {
    mostrarCargando(false);
    const grid = document.getElementById('contenedor-mangas');
    if (!grid) return;

    grid.style.display = 'block';

    let funcionReintentar = 'obtenerTopMangas()';
    if (seccionActual === 'library') {
        funcionReintentar = 'renderizarBiblioteca()';
    } else if (textoBusqueda.trim()) {
        funcionReintentar = 'ejecutarBusqueda()';
    }

    grid.innerHTML = `
        <div style="text-align:center; padding:50px 20px; color:#ef4444; font-weight:600;">
            <p>Error: ${mensaje}</p>
            <button onclick="${funcionReintentar}" style="margin-top:15px; padding:8px 16px; background-color:var(--accent-primary); border:none; border-radius:var(--radius-sm); color:white; cursor:pointer; font-weight:700;">
                Reintentar
            </button>
        </div>`;
}

function showToast(mensaje, tipo) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;

    const iconosSVG = {
        success: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color:var(--color-completed);"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        warning: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color:var(--color-pending);"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
        info: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color:var(--color-reading);"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };

    const iconoHtml = iconosSVG[tipo] || iconosSVG.info;
    toast.innerHTML = `<span class="toast-icon-wrapper">${iconoHtml}</span> <span>${mensaje}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards';
        setTimeout(() => toast.remove(), 350);
    }, 2800);
}

document.addEventListener("DOMContentLoaded", () => {
    actualizarDashboard();
    obtenerTopMangas();
});
