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
   *   expectedEndDate: string
   * }} data
   */
  const renderSchedule = (data) => {
    const { schedule, totalAmount, totalInterest, installmentAmount, expectedEndDate } = data;

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
          <span class="text-xs text-gray-400">(${schedule.length} cuotas)</span>
        </div>
        ${summaryHtml}
        ${tableHtml}
        <p class="mt-3 text-xs text-gray-400">
          ⚠️ Los días hábiles se calcularán en el servidor al crear el préstamo.
          Esta previsualización es orientativa.
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
   *   amortizationType: string,
   *   numberOfPayments: string,
   *   disbursementDate: string
   * }|null}
   */
  const collectFormData = () => {
    const get = (id) => (document.getElementById(id)?.value ?? '').trim();

    const payload = {
      principalAmount: get('principalAmount'),
      interestRate: get('interestRate'),
      paymentFrequency: get('paymentFrequency'),
      amortizationType: get('amortizationType'),
      numberOfPayments: get('numberOfPayments'),
      disbursementDate: get('disbursementDate'),
    };

    const missing = Object.entries(payload)
      .filter(([, v]) => v === '')
      .map(([k]) => k);

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
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        renderError(json.message ?? 'Error al calcular el cronograma.');
        return;
      }

      renderSchedule(json.data);
    } catch (err) {
      renderError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setLoadingState(false);
    }
  };

  /* ── Eventos ────────────────────────────────────────────────────── */

  btnPreview.addEventListener('click', requestPreview);
}());
