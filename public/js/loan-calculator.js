/* eslint-env browser */
/**
 * loan-calculator.js
 *
 * Script del cliente para la vista /admin/loans/new.
 * Captura los datos del formulario, solicita la previsualización del
 * cronograma al endpoint POST /admin/loans/preview y renderiza la
 * tabla de amortización en el contenedor #schedule-preview.
 *
 * No depende de ningún framework. Vanilla JS (ES2022).
 */

(function loanCalculator() {
  /* ── Referencias al DOM ─────────────────────────────────────────── */
  const form = document.getElementById('loan-form');
  const btnPreview = document.getElementById('btn-preview');
  const previewContainer = document.getElementById('schedule-preview');

  if (!form || !btnPreview || !previewContainer) return;

  /* ── Helpers de formato ─────────────────────────────────────────── */

  /**
   * Formatea un string numérico como moneda COP.
   * @param {string|number} value
   * @returns {string}
   */
  const formatCOP = (value) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 2,
    }).format(Number(value));

  /**
   * Formatea una fecha ISO YYYY-MM-DD al formato local es-CO.
   * @param {string} isoDate
   * @returns {string}
   */
  const formatDate = (isoDate) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  /**
   * Traduce el valor del enum PaymentFrequency a un label legible en español.
   * @param {string} frequency
   * @returns {string}
   */
  const frequencyLabel = (frequency) => {
    const labels = {
      DAILY: 'Diario',
      WEEKLY: 'Semanal',
      BIWEEKLY: 'Quincenal',
      MONTHLY: 'Mensual',
    };
    return labels[frequency] ?? frequency;
  };

  /* ── Auto-relleno de plazo y hint dinámico ──────────────────────── */

  /**
   * Cuenta días hábiles (lun-sáb) en un rango [startExclusive, endInclusive].
   * Aproximación sin festivos — el engine del servidor aplica los festivos reales.
   *
   * @param {Date} from - Fecha de inicio (no incluida)
   * @param {Date} to   - Fecha de fin (incluida)
   * @returns {number}
   */
  const countBusinessDaysApprox = (from, to) => {
    let count = 0;
    const cursor = new Date(from);
    cursor.setDate(cursor.getDate() + 1); // día siguiente al desembolso
    while (cursor <= to) {
      const dow = cursor.getDay();
      // Solo el domingo (0) es excluido en el modelo de microcrédito colombiano
      if (dow !== 0) count += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  };

  /**
   * Calcula el número estimado de cuotas dado una frecuencia y un plazo en meses.
   * Usa la fecha de desembolso actual del formulario para DAILY.
   *
   * @param {string} frequency - DAILY | WEEKLY | BIWEEKLY | MONTHLY
   * @param {number} months    - Plazo en meses
   * @returns {number}
   */
  const estimatePaymentCount = (frequency, months) => {
    if (frequency === 'MONTHLY') return months;
    if (frequency === 'BIWEEKLY') return months * 2;
    if (frequency === 'WEEKLY') return months * 4;
    // DAILY: conteo real sin festivos desde la fecha de desembolso actual
    const dateStr = document.getElementById('disbursementDate')?.value;
    const start = dateStr ? new Date(dateStr) : new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    return countBusinessDaysApprox(start, end);
  };

  /**
   * Actualiza el párrafo de ayuda (#termMonths-hint) con el conteo estimado
   * de cuotas según la frecuencia y el plazo seleccionados.
   */
  const updateTermHint = () => {
    const hint = document.getElementById('termMonths-hint');
    if (!hint) return;

    const frequency = document.getElementById('paymentFrequency')?.value;
    const months = Number.parseInt(document.getElementById('termMonths')?.value, 10);

    if (!frequency || Number.isNaN(months) || months <= 0) {
      hint.textContent = 'Selecciona la frecuencia para ver las cuotas estimadas.';
      hint.className = 'mt-1 text-xs text-gray-400';
      return;
    }

    const count = estimatePaymentCount(frequency, months);
    const freqLabel = frequencyLabel(frequency).toLowerCase();

    hint.textContent = `≈ ${count} cuota${count !== 1 ? 's' : ''} ${freqLabel}${frequency === 'DAILY' ? 's (días hábiles aprox.)' : 'es'}`;
    hint.className = 'mt-1 text-xs text-brand-green font-medium';
  };

  /**
   * Al cambiar la frecuencia, auto-rellena termMonths con 1 (si está vacío)
   * y actualiza el hint.
   */
  const onFrequencyChange = () => {
    const termInput = document.getElementById('termMonths');
    if (termInput && termInput.value === '') {
      termInput.value = '1';
    }
    updateTermHint();
  };

  // Conectar los listeners de auto-relleno una vez que el DOM está listo
  document.getElementById('paymentFrequency')?.addEventListener('change', onFrequencyChange);
  document.getElementById('termMonths')?.addEventListener('input', updateTermHint);
  document.getElementById('disbursementDate')?.addEventListener('change', updateTermHint);

  // Si la página carga con valores ya definidos (ej. formData tras error), mostrar hint de inmediato
  updateTermHint();

  /* ── Mostrar / ocultar estado de carga ──────────────────────────── */

  const setLoadingState = (loading) => {
    btnPreview.disabled = loading;
    btnPreview.textContent = loading ? '⏳ Calculando…' : '🔢 Calcular previsualización';
  };

  /* ── Renderizar tabla de amortización ───────────────────────────── */

  /**
   * Construye y muestra la tabla con el cronograma de cuotas.
   *
   * @param {{
   *   schedule: Array<{
   *     installmentNumber: number,
   *     dueDate: string,
   *     amountDue: string,
   *     principalDue: string,
   *     interestDue: string
   *   }>,
   *   totalAmount: string,
   *   totalInterest: string,
   *   installmentAmount: string,
   *   expectedEndDate: string,
   *   numberOfPayments: number
   * }} data
   * @param {string} frequency - Valor del enum PaymentFrequency seleccionado
   */
  const renderSchedule = (data, frequency) => {
    const { schedule, totalAmount, totalInterest, installmentAmount, expectedEndDate, numberOfPayments } = data;

    /* --- Resumen superior --- */
    const summaryHtml = `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Cuota fija</p>
          <p class="text-lg font-bold text-brand-navy">${formatCOP(installmentAmount)}</p>
        </div>
        <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Total a pagar</p>
          <p class="text-lg font-bold text-brand-navy">${formatCOP(totalAmount)}</p>
        </div>
        <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Total intereses</p>
          <p class="text-lg font-bold text-red-600">${formatCOP(totalInterest)}</p>
        </div>
        <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Fecha última cuota</p>
          <p class="text-lg font-bold text-brand-navy">${formatDate(expectedEndDate)}</p>
        </div>
      </div>`;

    /* --- Filas de la tabla --- */
    const rowsHtml = schedule.map((row) => `
      <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <td class="px-4 py-2.5 text-center text-sm text-gray-600">${row.installmentNumber}</td>
        <td class="px-4 py-2.5 text-center text-sm text-gray-600">${formatDate(row.dueDate)}</td>
        <td class="px-4 py-2.5 text-right text-sm font-medium text-brand-navy">${formatCOP(row.amountDue)}</td>
        <td class="px-4 py-2.5 text-right text-sm text-gray-600">${formatCOP(row.principalDue)}</td>
        <td class="px-4 py-2.5 text-right text-sm text-red-500">${formatCOP(row.interestDue)}</td>
      </tr>`).join('');

    const tableHtml = `
      <div class="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table class="w-full text-sm bg-white">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">#</th>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Cuota total</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Capital</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Interés</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;

    previewContainer.innerHTML = `
      <div>
        <div class="flex items-center gap-3 mb-4">
          <h3 class="text-base font-semibold text-brand-navy">
            📋 Previsualización del cronograma
          </h3>
          <span class="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5 font-medium">
            ${frequencyLabel(frequency)}
          </span>
          <span class="text-xs text-gray-400">(${numberOfPayments} cuotas calculadas automáticamente)</span>
        </div>
        ${summaryHtml}
        ${tableHtml}
        <p class="mt-3 text-xs text-gray-400">
          ⚠️ Esta previsualización es orientativa. Los festivos definitivos se confirman al crear el préstamo.
        </p>
      </div>`;

    previewContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── Renderizar error en el contenedor ──────────────────────────── */

  /**
   * @param {string} message
   */
  const renderError = (message) => {
    previewContainer.innerHTML = `
      <div class="rounded-lg bg-red-50 border border-red-200 p-4">
        <div class="flex items-start gap-2">
          <span class="text-red-500 text-lg leading-none">❌</span>
          <p class="text-sm font-medium text-red-800">${message}</p>
        </div>
      </div>`;
  };

  /* ── Recopilar y validar los datos del formulario ───────────────── */

  /**
   * Lee los valores del formulario y retorna el payload para el endpoint.
   * Retorna null si hay campos requeridos vacíos.
   *
   * @returns {{
   *   principalAmount: string,
   *   interestRate: string,
   *   paymentFrequency: string,
   *   termMonths: string,
   *   disbursementDate: string
   * }|null}
   */
  const collectFormData = () => {
    const get = (id) => (document.getElementById(id)?.value ?? '').trim();

    // Etiquetas legibles para mostrar en mensajes de error al usuario
    const fieldLabels = {
      principalAmount: 'Capital prestado',
      interestRate: 'Tasa de interés',
      paymentFrequency: 'Frecuencia de pago',
      termMonths: 'Plazo (meses)',
      disbursementDate: 'Fecha de desembolso',
    };

    const payload = {
      principalAmount: get('principalAmount'),
      interestRate: get('interestRate'),
      paymentFrequency: get('paymentFrequency'),
      termMonths: get('termMonths'),
      disbursementDate: get('disbursementDate'),
    };

    const missing = Object.entries(payload)
      .filter(([, v]) => v === '')
      .map(([k]) => fieldLabels[k] ?? k);

    if (missing.length > 0) {
      renderError(
        `Completa los siguientes campos antes de previsualizar: ${missing.join(', ')}.`,
      );
      return null;
    }

    return payload;
  };

  /* ── Llamada AJAX al endpoint de previsualización ───────────────── */

  const requestPreview = async () => {
    const payload = collectFormData();
    if (!payload) return;

    setLoadingState(true);
    previewContainer.innerHTML = '';

    try {
      const response = await fetch('/admin/loans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      // apiResponse devuelve { data, meta, error } — no tiene campo "success"
      // El request fue exitoso si HTTP 2xx y el campo error es null
      if (!response.ok || json.error !== null) {
        renderError(json.error?.message ?? 'Error al calcular el cronograma.');
        return;
      }

      renderSchedule(json.data, payload.paymentFrequency);
    } catch (err) {
      renderError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setLoadingState(false);
    }
  };

  /* ── Eventos ────────────────────────────────────────────────────── */

  btnPreview.addEventListener('click', requestPreview);

    /* ── Typeahead / Autocomplete para Cliente, Cobrador y Ruta ─────── */

    const debounce = (fn, wait = 300) => {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    };

    const fetchSuggestions = async (url) => {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
        const json = await res.json();
        // Depuración: mostrar status y payload para ayudar a diagnosticar por qué no hay resultados
        console.debug('[typeahead] GET', url, 'status=', res.status, json);
        if (!res.ok) return [];

        // Soportar dos formatos de respuesta que aparecen en el códigobase:
        // - { success: true, data: [...] }
        // - { data: [...], meta: ..., error: ... }
        if (json && Object.prototype.hasOwnProperty.call(json, 'success')) {
          return json.success ? json.data ?? [] : [];
        }

        // Fallback: devolver json.data si existe
        return json.data ?? [];
      } catch (e) {
        console.error('[typeahead] error fetching', url, e);
        return [];
      }
    };

    const createTypeahead = ({ inputId, hiddenId, suggestionsId, apiPath, renderLabel }) => {
      const input = document.getElementById(inputId);
      const hidden = document.getElementById(hiddenId);
      const box = document.getElementById(suggestionsId);
      if (!input || !box || !hidden) return;

      let items = [];
      let selectedIndex = -1;

      const showBox = () => box.classList.remove('hidden');
      const hideBox = () => {
        box.classList.add('hidden');
        selectedIndex = -1;
      };

      const renderItems = (list) => {
        items = list;
        if (!items || items.length === 0) {
          box.innerHTML = '<div class="p-2 text-xs text-gray-500">No se encontraron resultados</div>';
          showBox();
          return;
        }

        box.innerHTML = items
          .map((it, idx) => `
            <div data-idx="${idx}" data-id="${it.id}" class="px-3 py-2 cursor-pointer hover:bg-gray-50">
              ${renderLabel(it)}
            </div>
          `)
          .join('');
        showBox();
      };

      const doSearch = async (q) => {
        if (!q || q.trim() === '') {
          renderItems([]);
          hidden.value = '';
          return;
        }
        const url = `${apiPath}?q=${encodeURIComponent(q)}&limit=15`;
        const res = await fetchSuggestions(url);
        renderItems(res);
      };

      const debouncedSearch = debounce((e) => doSearch(e.target.value), 250);

      input.addEventListener('input', (e) => {
        // cualquier cambio en el texto invalida la selección previa
        hidden.value = '';
        debouncedSearch(e);
      });

      input.addEventListener('keydown', (e) => {
        const nodes = box.querySelectorAll('[data-idx]');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (nodes.length === 0) return;
          selectedIndex = Math.min(selectedIndex + 1, nodes.length - 1);
          nodes.forEach((n) => n.classList.remove('bg-gray-100'));
          nodes[selectedIndex].classList.add('bg-gray-100');
          nodes[selectedIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (nodes.length === 0) return;
          selectedIndex = Math.max(selectedIndex - 1, 0);
          nodes.forEach((n) => n.classList.remove('bg-gray-100'));
          nodes[selectedIndex].classList.add('bg-gray-100');
          nodes[selectedIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          if (selectedIndex >= 0 && items[selectedIndex]) {
            e.preventDefault();
            const it = items[selectedIndex];
            hidden.value = it.id;
            input.value = renderLabel(it).replace(/<[^>]+>/g, '');
            hideBox();
          }
        } else if (e.key === 'Escape') {
          hideBox();
        }
      });

      // click en sugerencia
      box.addEventListener('mousedown', (ev) => {
        const el = ev.target.closest('[data-idx]');
        if (!el) return;
        const idx = Number(el.getAttribute('data-idx'));
        const it = items[idx];
        if (!it) return;
        hidden.value = it.id;
        input.value = renderLabel(it).replace(/<[^>]+>/g, '');
        // evitar que el blur o submit interrumpa
        ev.preventDefault();
        hideBox();
      });

      // ocultar al perder foco (con pequeño delay para permitir click)
      input.addEventListener('blur', () => setTimeout(hideBox, 150));
    };

    // Crear typeaheads
    createTypeahead({
      inputId: 'clientSearch',
      hiddenId: 'clientId',
      suggestionsId: 'clientSuggestions',
      apiPath: '/admin/api/customers/search',
      renderLabel: (it) => `${it.lastName}, ${it.firstName} <span class="text-xs text-gray-500">(${it.documentNumber || ''})</span>`,
    });

    createTypeahead({
      inputId: 'collectorSearch',
      hiddenId: 'collectorId',
      suggestionsId: 'collectorSuggestions',
      apiPath: '/admin/api/collectors/search',
      renderLabel: (it) => `${it.firstName} ${it.lastName} <span class="text-xs text-gray-500">${it.phone ? `(${it.phone})` : ''}</span>`,
    });

    createTypeahead({
      inputId: 'routeSearch',
      hiddenId: 'routeId',
      suggestionsId: 'routeSuggestions',
      apiPath: '/admin/api/collection_routes/search',
      renderLabel: (it) => `${it.name} <span class="text-xs text-gray-500">${it.description ? `- ${it.description}` : ''}</span>`,
    });

  }());
