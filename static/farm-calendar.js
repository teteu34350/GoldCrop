(() => {
  'use strict';

  const endpoint = '/api/calendar/events/';
  const categories = [
    ['APLICACAO', 'Aplicação'], ['PLANTIO', 'Plantio'], ['COLHEITA', 'Colheita'],
    ['ADUBACAO', 'Adubação'], ['IRRIGACAO', 'Irrigação'], ['PULVERIZACAO', 'Pulverização'],
    ['MANEJO', 'Manejo'], ['INSPECAO', 'Inspeção'], ['MANUTENCAO', 'Manutenção'],
    ['COMPRA', 'Compra'], ['VENDA', 'Venda'], ['REUNIAO', 'Reunião'],
    ['VISITA_TECNICA', 'Visita técnica'], ['TAREFA', 'Tarefa'], ['OUTRO', 'Outro'],
  ];
  const statuses = [
    ['PLANEJADA', 'Planejada'], ['EM_ANDAMENTO', 'Em andamento'],
    ['CONCLUIDA', 'Concluída'], ['CANCELADA', 'Cancelada'],
  ];
  const priorities = [['BAIXA', 'Baixa'], ['MEDIA', 'Média'], ['ALTA', 'Alta']];
  const dayNames = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  const shortDayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const state = {
    date: localDate(new Date()),
    view: 'month',
    events: [],
    plots: [],
    products: [],
    applications: [],
    permissions: { plan: false, manage: false },
    selected: null,
    loading: false,
    loaded: false,
  };
  const currentUserId = (() => {
    try {
      return Number(JSON.parse(document.getElementById('auth-user-data')?.textContent || '{}').id);
    } catch (error) {
      console.error('Não foi possível identificar o usuário autenticado no calendário.', error);
      return 0;
    }
  })();

  function byId(id) { return document.getElementById(id); }
  function localDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function dateObject(value) { return new Date(`${value}T12:00:00`); }
  function shiftDate(value, amount) {
    const date = dateObject(value);
    date.setDate(date.getDate() + amount);
    return localDate(date);
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }
  function csrfToken() { return document.querySelector('meta[name="csrf-token"]')?.content || ''; }
  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken(),
        ...(options.headers || {}),
      },
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) {
      throw new Error(result.message || `Não foi possível concluir a operação (${response.status}).`);
    }
    return result;
  }
  function visibleRange() {
    const date = dateObject(state.date);
    if (state.view === 'month') {
      const first = new Date(date.getFullYear(), date.getMonth(), 1);
      const mondayOffset = (first.getDay() + 6) % 7;
      const start = new Date(first);
      start.setDate(first.getDate() - mondayOffset);
      return { start: localDate(start), end: shiftDate(localDate(start), 41) };
    }
    if (state.view === 'week') {
      const mondayOffset = (date.getDay() + 6) % 7;
      const start = new Date(date);
      start.setDate(date.getDate() - mondayOffset);
      return { start: localDate(start), end: shiftDate(localDate(start), 6) };
    }
    return { start: state.date, end: shiftDate(state.date, state.view === 'agenda' ? 13 : 0) };
  }
  function showError(message) {
    const element = byId('farmCalendarError');
    if (!element) return;
    element.textContent = message;
    element.hidden = false;
  }
  function clearError() {
    const element = byId('farmCalendarError');
    if (element) {
      element.textContent = '';
      element.hidden = true;
    }
  }
  function setSelectOptions(id, options, placeholder) {
    const select = byId(id);
    if (!select) return;
    const current = select.value;
    select.innerHTML = `${placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : ''}${options.map(option =>
      `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
    ).join('')}`;
    if (options.some(option => String(option.value) === current)) select.value = current;
  }
  function updateFarmOptions(data) {
    state.plots = data.plots || [];
    state.products = data.products || [];
    state.applications = data.applications || [];
    state.permissions = data.permissions || { plan: false, manage: false };
    setSelectOptions('farmCalendarPlotFilter', state.plots.map(plot => ({ value: plot.id, label: plot.name })), 'Todos os talhões');
    setSelectOptions('farmEventPlot', state.plots.map(plot => ({ value: plot.id, label: plot.name })), 'Sem talhão');
    setSelectOptions('farmEventProduct', state.products.map(product => ({ value: product.id, label: `${product.name} (${product.unit})` })), 'Nenhum produto vinculado');
    setSelectOptions('farmEventApplication', state.applications.map(application => ({ value: application.id, label: application.label })), 'Nenhuma aplicação vinculada');
    setSelectOptions('farmEventCategory', categories.map(([value, label]) => ({ value, label })));
    setSelectOptions('farmEventStatus', statuses.map(([value, label]) => ({ value, label })));
    setSelectOptions('farmEventPriority', priorities.map(([value, label]) => ({ value, label })));
    byId('farmCalendarAdd').hidden = !state.permissions.plan;
  }
  async function loadEvents() {
    const loading = byId('farmCalendarLoading');
    state.loading = true;
    loading.hidden = false;
    clearError();
    try {
      const range = visibleRange();
      const query = new URLSearchParams(range);
      const data = await request(`${endpoint}?${query.toString()}`);
      state.events = data.events || [];
      state.loaded = true;
      updateFarmOptions(data);
      updateRangeLabel();
      renderCalendarView();
      renderDetail();
      openPendingRecommendationActivity();
    } catch (error) {
      console.error('Falha ao carregar eventos do calendário da fazenda:', error);
      showError(error.message || 'Não foi possível carregar os eventos.');
    } finally {
      state.loading = false;
      loading.hidden = true;
    }
  }
  function filteredEvents(date) {
    const category = byId('farmCalendarFilter').value;
    const plotId = byId('farmCalendarPlotFilter').value;
    return state.events.filter(event => {
      if (date && event.date !== date) return false;
      if (plotId && String(event.plot_id || '') !== plotId) return false;
      if (category === 'MINE' && Number(event.creator_id) !== currentUserId) return false;
      if (category === 'OTHER' && ['APLICACAO', 'PLANTIO', 'COLHEITA', 'MANEJO', 'MANUTENCAO', 'INSPECAO'].includes(event.category)) return false;
      if (category !== 'ALL' && category !== 'MINE' && category !== 'OTHER' && event.category !== category) return false;
      return true;
    }).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '') || a.title.localeCompare(b.title));
  }
  function timeLabel(event) { return event.all_day ? 'Dia inteiro' : event.start_time || '—'; }
  function defaultEndTime(startTime) {
    if (!startTime) return '08:00';
    const hour = Number(startTime.slice(0, 2));
    return hour === 23 ? '23:59' : `${String(hour + 1).padStart(2, '0')}:00`;
  }
  function eventMarkup(event, compact = false) {
    const stateClass = event.status === 'CONCLUIDA' ? 'is-done' : event.status === 'CANCELADA' ? 'is-cancelled' : '';
    return `<button type="button" class="farm-calendar-event ${stateClass}" data-event-id="${Number(event.id)}" data-category="${escapeHtml(event.category)}" data-origin="${escapeHtml(event.origin)}" aria-label="${escapeHtml(`${timeLabel(event)} ${event.title}${event.plot_name ? `, ${event.plot_name}` : ''}`)}">
      <span class="farm-calendar-event-time">${escapeHtml(timeLabel(event))}</span>
      <span class="farm-calendar-event-title">${event.priority === 'ALTA' ? '<b class="farm-calendar-priority" aria-label="Prioridade alta">!</b>' : ''}${escapeHtml(event.title)}</span>
      ${!compact && event.plot_name ? `<span class="farm-calendar-event-plot">${escapeHtml(event.plot_name)}</span>` : ''}
    </button>`;
  }
  function updateRangeLabel() {
    const date = dateObject(state.date);
    let label;
    if (state.view === 'month') {
      label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
      label = label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
    } else if (state.view === 'week') {
      const range = visibleRange();
      const start = dateObject(range.start);
      const end = dateObject(range.end);
      label = `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    } else if (state.view === 'agenda') {
      const end = dateObject(shiftDate(state.date, 13));
      label = `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    } else {
      label = date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      label = label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
    }
    byId('farmCalendarRange').textContent = label;
  }
  function renderCalendarView() {
    const elements = {
      month: byId('farmCalendarMonth'),
      week: byId('farmCalendarWeekScroll'),
      day: byId('farmCalendarDay'),
      agenda: byId('farmCalendarAgenda'),
    };
    Object.entries(elements).forEach(([view, element]) => { element.hidden = view !== state.view; });
    document.querySelectorAll('[data-calendar-view]').forEach(button => {
      const active = button.dataset.calendarView === state.view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    updateRangeLabel();
    if (state.view === 'month') renderMonth();
    if (state.view === 'week') renderWeek();
    if (state.view === 'day') renderDay();
    if (state.view === 'agenda') renderAgenda();
  }
  function renderMonth() {
    const grid = byId('farmCalendarMonth');
    const current = dateObject(state.date);
    const first = new Date(current.getFullYear(), current.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const today = localDate(new Date());
    const parts = shortDayNames.map(name => `<div class="farm-calendar-weekday">${name}</div>`);
    for (let index = 0; index < 42; index++) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = localDate(date);
      const dayEvents = filteredEvents(key);
      const outside = date.getMonth() !== current.getMonth();
      const shown = dayEvents.slice(0, 3).map(event => eventMarkup(event, true)).join('');
      const remainder = dayEvents.length - 3;
      parts.push(`<div class="farm-calendar-cell ${outside ? 'outside-month' : ''} ${key === today ? 'is-today' : ''}" data-add-date="${key}">
        <span class="farm-calendar-day-number">${date.getDate()}</span>
        <div class="farm-calendar-cell-events">${shown}${remainder > 0 ? `<span class="farm-calendar-event-count desktop-count">+${remainder} mais</span>` : ''}${dayEvents.length > 1 ? `<span class="farm-calendar-event-count mobile-count">+${dayEvents.length - 1}</span>` : ''}</div>
      </div>`);
    }
    grid.innerHTML = parts.join('');
  }
  function renderWeek() {
    const grid = byId('farmCalendarWeek');
    const start = dateObject(visibleRange().start);
    const today = localDate(new Date());
    const headings = ['<div></div>'];
    const dates = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(start);
      date.setDate(start.getDate() + day);
      const key = localDate(date);
      dates.push(key);
      headings.push(`<div class="week-day-head ${key === today ? 'is-today' : ''}">${shortDayNames[day]}<br>${date.getDate()}</div>`);
    }
    let rows = `<div class="farm-calendar-week-head">${headings.join('')}</div>`;
    rows += `<div class="farm-calendar-week-row farm-calendar-week-all-day"><div class="farm-calendar-week-hour">Dia todo</div>${dates.map(key => {
      const items = filteredEvents(key).filter(event => event.all_day);
      return `<div class="farm-calendar-week-slot" data-add-date="${key}" role="button" tabindex="0" aria-label="Adicionar atividade para o dia inteiro">${items.map(event => eventMarkup(event)).join('')}</div>`;
    }).join('')}</div>`;
    for (let hour = 0; hour <= 23; hour++) {
      rows += `<div class="farm-calendar-week-row"><div class="farm-calendar-week-hour">${String(hour).padStart(2, '0')}:00</div>`;
      dates.forEach(key => {
        const items = filteredEvents(key).filter(event => !event.all_day && Number(event.start_time.slice(0, 2)) === hour);
        rows += `<div class="farm-calendar-week-slot" data-add-date="${key}" data-add-time="${String(hour).padStart(2, '0')}:00" role="button" tabindex="0" aria-label="Adicionar atividade ${key} às ${String(hour).padStart(2, '0')}:00">${items.map(event => eventMarkup(event)).join('')}</div>`;
      });
      rows += '</div>';
    }
    grid.innerHTML = rows;
  }
  function renderDay() {
    const container = byId('farmCalendarDay');
    const date = dateObject(state.date);
    const items = filteredEvents(state.date);
    let html = `<header class="farm-calendar-day-heading"><strong>${escapeHtml(date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}</strong><button type="button" class="btn-ghost-sm" data-add-date="${state.date}">＋ Atividade</button></header>`;
    if (items.some(event => event.all_day)) {
      html += `<div class="farm-calendar-day-row"><div class="farm-calendar-day-hour">Dia todo</div><div class="farm-calendar-day-slot">${items.filter(event => event.all_day).map(event => eventMarkup(event)).join('')}</div></div>`;
    }
    for (let hour = 0; hour <= 23; hour++) {
      const scheduled = items.filter(event => !event.all_day && Number(event.start_time.slice(0, 2)) === hour);
      html += `<div class="farm-calendar-day-row"><div class="farm-calendar-day-hour">${String(hour).padStart(2, '0')}:00</div><div class="farm-calendar-day-slot" data-add-date="${state.date}" data-add-time="${String(hour).padStart(2, '0')}:00" role="button" tabindex="0" aria-label="Adicionar atividade às ${String(hour).padStart(2, '0')}:00">${scheduled.map(event => eventMarkup(event)).join('')}</div></div>`;
    }
    if (!items.length) html += '<p class="farm-calendar-empty">Nenhuma atividade neste dia. Selecione um horário para adicionar.</p>';
    container.innerHTML = html;
  }
  function renderAgenda() {
    const container = byId('farmCalendarAgenda');
    const pieces = [];
    for (let offset = 0; offset < 14; offset++) {
      const key = shiftDate(state.date, offset);
      const items = filteredEvents(key);
      const date = dateObject(key);
      pieces.push(`<section class="farm-agenda-day"><strong class="farm-agenda-date">${escapeHtml(date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</strong>
        <div class="farm-agenda-events">${items.length ? items.map(event => eventMarkup(event)).join('') : '<span class="farm-agenda-empty">Nenhuma atividade</span>'}</div></section>`);
    }
    container.innerHTML = pieces.join('');
  }
  function renderDetail() {
    const panel = byId('farmCalendarDetail');
    const event = state.selected && state.events.find(item => item.id === state.selected);
    if (!event) {
      panel.hidden = true;
      panel.innerHTML = '';
      state.selected = null;
      return;
    }
    panel.hidden = false;
    const dateLabel = dateObject(event.date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeLabelText = event.all_day ? 'Dia inteiro' : `${event.start_time}–${event.end_time}`;
    const info = [
      ['Categoria', event.category_label],
      ['Talhão', event.plot_name || 'Não vinculado'],
      ['Responsável', event.responsible || 'Não definido'],
      ['Status', event.status_label],
      ['Prioridade', event.priority_label],
      ['Origem', event.origin_label],
      ['Produto / insumo', event.product_name ? `${event.product_name}${event.product_quantity ? ` · ${event.product_quantity} ${event.product_unit}` : ''}` : 'Não vinculado'],
      ['Aplicação', event.application_label || 'Não vinculada'],
      ['Criado por', event.created_by || 'Usuário da fazenda'],
    ].map(([label, value]) => `<div class="farm-calendar-detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
    const recommendation = event.origin === 'RECOMENDACAO'
      ? `<div class="farm-event-origin">Esta atividade foi adicionada a partir de uma recomendação. A recomendação não gera obrigação; o planejamento foi confirmado por um usuário.</div>` : '';
    panel.innerHTML = `<header class="farm-calendar-detail-head"><div><span class="calendar-eyebrow">${escapeHtml(event.origin_label)}</span><h2>${escapeHtml(event.title)}</h2><div class="farm-calendar-detail-meta">${escapeHtml(dateLabel)} · ${escapeHtml(timeLabelText)}</div></div><button type="button" class="modal-close" data-close-detail aria-label="Fechar detalhes">×</button></header>
      <p>${escapeHtml(event.description || 'Sem descrição.')}</p>${recommendation}
      <div class="farm-calendar-detail-grid">${info}</div>
      ${event.notes ? `<p><strong>Observações:</strong> ${escapeHtml(event.notes)}</p>` : ''}
      ${event.plot_url ? `<p><a class="btn-ghost-sm" href="${escapeHtml(event.plot_url)}">Abrir ${escapeHtml(event.plot_name)} em Talhões</a></p>` : ''}
      <div class="farm-calendar-actions">
        ${state.permissions.plan ? '<button type="button" class="btn-ghost" data-edit-event>Editar</button>' : ''}
        ${state.permissions.plan && event.status !== 'CONCLUIDA' && event.status !== 'CANCELADA' ? '<button type="button" class="btn-primary" data-complete-event>Concluir</button>' : ''}
        ${state.permissions.manage ? '<button type="button" class="btn-ghost-sm" data-delete-event>Excluir</button>' : ''}
        ${event.origin === 'RECOMENDACAO' ? '<button type="button" class="btn-ghost" data-view-recommendation>Ver recomendação</button>' : ''}
      </div>`;
  }
  function openEventForm(date = state.date, time = '', event = null, recommendation = null) {
    if (!state.permissions.plan) return showError('Seu perfil não pode criar ou editar atividades nesta fazenda.');
    const form = byId('farmEventForm');
    form.reset();
    byId('farmEventFormError').hidden = true;
    byId('farmEventModalTitle').textContent = event ? 'Editar atividade' : 'Adicionar atividade';
    byId('farmEventTitle').value = event?.title || recommendation?.title || '';
    byId('farmEventDescription').value = event?.description || recommendation?.description || '';
    byId('farmEventDate').value = recommendation?.date || event?.date || date;
    byId('farmEventStart').value = recommendation?.start_time || event?.start_time || time || '07:00';
    byId('farmEventEnd').value = recommendation?.end_time || event?.end_time || defaultEndTime(time);
    byId('farmEventAllDay').checked = Boolean(event?.all_day);
    document.querySelectorAll('.farm-event-time').forEach(field => {
      field.hidden = Boolean(event?.all_day);
    });
    byId('farmEventCategory').value = recommendation ? 'APLICACAO' : event?.category || 'TAREFA';
    byId('farmEventPlot').value = recommendation?.plot_id || event?.plot_id || '';
    byId('farmEventResponsible').value = event?.responsible || '';
    byId('farmEventPriority').value = event?.priority || 'MEDIA';
    byId('farmEventStatus').value = event?.status || 'PLANEJADA';
    byId('farmEventProduct').value = event?.product_id || '';
    byId('farmEventQuantity').value = event?.product_quantity || '';
    byId('farmEventUnit').value = event?.product_unit || '';
    byId('farmEventApplication').value = event?.application_id || '';
    byId('farmEventNotes').value = event?.notes || recommendation?.notes || '';
    byId('farmEventRecommendation').value = recommendation?.recommendation_id || event?.recommendation_id || '';
    byId('farmEventOrigin').hidden = !recommendation && event?.origin !== 'RECOMENDACAO';
    form.dataset.eventId = event?.id || '';
    form.dataset.fromRecommendation = String(Boolean(recommendation) || event?.origin === 'RECOMENDACAO');
    byId('farmEventModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    byId('farmEventTitle').focus();
  }
  function closeEventForm() {
    byId('farmEventModal').style.display = 'none';
    document.body.style.overflow = '';
  }
  function collectFormData() {
    return {
      title: byId('farmEventTitle').value.trim(),
      description: byId('farmEventDescription').value.trim(),
      date: byId('farmEventDate').value,
      start_time: byId('farmEventStart').value,
      end_time: byId('farmEventEnd').value,
      all_day: byId('farmEventAllDay').checked,
      category: byId('farmEventCategory').value,
      plot_id: byId('farmEventPlot').value || null,
      responsible: byId('farmEventResponsible').value.trim(),
      priority: byId('farmEventPriority').value,
      status: byId('farmEventStatus').value,
      product_id: byId('farmEventProduct').value || null,
      product_quantity: byId('farmEventQuantity').value || null,
      product_unit: byId('farmEventUnit').value.trim(),
      application_id: byId('farmEventApplication').value || null,
      notes: byId('farmEventNotes').value.trim(),
      recommendation_id: byId('farmEventRecommendation').value || null,
      from_recommendation: byId('farmEventForm').dataset.fromRecommendation === 'true',
    };
  }
  async function saveEvent(event) {
    event.preventDefault();
    const form = byId('farmEventForm');
    const button = byId('farmEventSave');
    const payload = collectFormData();
    const id = form.dataset.eventId;
    button.disabled = true;
    byId('farmEventFormError').hidden = true;
    try {
      await request(id ? `${endpoint}${id}/` : endpoint, {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      state.date = payload.date;
      closeEventForm();
      state.selected = null;
      await loadEvents();
      showToast(id ? 'Atividade atualizada.' : 'Atividade adicionada ao calendário.', 'success');
    } catch (error) {
      console.error('Falha ao salvar atividade no calendário:', error);
      const field = byId('farmEventFormError');
      field.textContent = error.message || 'Não foi possível salvar a atividade.';
      field.hidden = false;
    } finally {
      button.disabled = false;
    }
  }
  async function setStatus(status) {
    if (!state.selected) return;
    try {
      await request(`${endpoint}${state.selected}/`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadEvents();
      showToast('Status da atividade atualizado.', 'success');
    } catch (error) {
      console.error('Falha ao atualizar status do evento:', error);
      showError(error.message || 'Não foi possível atualizar o status.');
    }
  }
  async function deleteEvent() {
    if (!state.selected || !window.confirm('Excluir esta atividade do calendário?')) return;
    try {
      await request(`${endpoint}${state.selected}/`, { method: 'DELETE' });
      state.selected = null;
      await loadEvents();
      showToast('Atividade excluída.', 'success');
    } catch (error) {
      console.error('Falha ao excluir evento do calendário:', error);
      showError(error.message || 'Não foi possível excluir a atividade.');
    }
  }
  function shiftPeriod(amount) {
    const date = dateObject(state.date);
    if (state.view === 'month') date.setMonth(date.getMonth() + amount);
    else if (state.view === 'week') date.setDate(date.getDate() + amount * 7);
    else date.setDate(date.getDate() + amount * (state.view === 'agenda' ? 14 : 1));
    state.date = localDate(date);
    state.selected = null;
    loadEvents();
  }
  function changeView(view) {
    state.view = view;
    state.selected = null;
    loadEvents();
  }
  function openPendingRecommendationActivity() {
    const query = new URLSearchParams(window.location.search);
    if (query.get('atividade') !== 'janela-de-ouro') return;
    const raw = sessionStorage.getItem('goldcrop.pendingCalendarActivity');
    if (!raw) {
      showError('Não foi possível recuperar os dados da recomendação. Abra novamente a Janela de Ouro e tente outra vez.');
      return;
    }
    let recommendation;
    try {
      recommendation = JSON.parse(raw);
    } catch (error) {
      console.error('Os dados temporários da recomendação estão inválidos.', error);
      sessionStorage.removeItem('goldcrop.pendingCalendarActivity');
      showError('Os dados da recomendação estão inválidos. Abra novamente a Janela de Ouro.');
      return;
    }
    if (!recommendation?.date || !recommendation?.plot_id) {
      sessionStorage.removeItem('goldcrop.pendingCalendarActivity');
      showError('A recomendação não contém uma data ou talhão válidos.');
      return;
    }
    sessionStorage.removeItem('goldcrop.pendingCalendarActivity');
    window.history.replaceState({}, '', window.location.pathname);
    state.date = recommendation.date;
    renderCalendarView();
    openEventForm(recommendation.date, recommendation.start_time || '', null, {
      ...recommendation,
      from_recommendation: true,
    });
  }
  function bind() {
    byId('farmCalendarAdd').addEventListener('click', () => openEventForm());
    byId('farmCalendarPrev').addEventListener('click', () => shiftPeriod(-1));
    byId('farmCalendarNext').addEventListener('click', () => shiftPeriod(1));
    byId('farmCalendarToday').addEventListener('click', () => {
      state.date = localDate(new Date());
      state.selected = null;
      loadEvents();
    });
    document.querySelectorAll('[data-calendar-view]').forEach(button => button.addEventListener('click', () => changeView(button.dataset.calendarView)));
    byId('farmCalendarFilter').addEventListener('change', renderCalendarView);
    byId('farmCalendarPlotFilter').addEventListener('change', renderCalendarView);
    byId('farmEventForm').addEventListener('submit', saveEvent);
    byId('farmEventClose').addEventListener('click', closeEventForm);
    byId('farmEventCancel').addEventListener('click', closeEventForm);
    byId('farmEventModal').addEventListener('click', event => {
      if (event.target === event.currentTarget) closeEventForm();
    });
    byId('farmEventAllDay').addEventListener('change', event => {
      document.querySelectorAll('.farm-event-time').forEach(field => {
        field.hidden = event.target.checked;
      });
    });
    byId('farmEventProduct').addEventListener('change', event => {
      const product = state.products.find(item => String(item.id) === event.target.value);
      if (product && !byId('farmEventUnit').value) byId('farmEventUnit').value = product.unit;
    });
    byId('farmEventApplication').addEventListener('change', event => {
      const application = state.applications.find(item => String(item.id) === event.target.value);
      if (!application) return;
      if (!byId('farmEventTitle').value) byId('farmEventTitle').value = `Aplicação: ${application.product}`;
      byId('farmEventDate').value = application.date;
      if (application.plot_id) byId('farmEventPlot').value = String(application.plot_id);
      byId('farmEventCategory').value = 'APLICACAO';
    });
    document.addEventListener('click', event => {
      const eventButton = event.target.closest('[data-event-id]');
      if (eventButton) {
        event.stopPropagation();
        state.selected = Number(eventButton.dataset.eventId);
        renderDetail();
        byId('farmCalendarDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      const addButton = event.target.closest('[data-add-date]');
      if (addButton) {
        if (event.target.closest('[data-event-id]')) return;
        openEventForm(addButton.dataset.addDate, addButton.dataset.addTime || '');
        return;
      }
      if (event.target.closest('[data-close-detail]')) {
        state.selected = null;
        renderDetail();
      } else if (event.target.closest('[data-edit-event]')) {
        const item = state.events.find(candidate => candidate.id === state.selected);
        if (item) openEventForm(item.date, '', item);
      } else if (event.target.closest('[data-complete-event]')) {
        setStatus('CONCLUIDA');
      } else if (event.target.closest('[data-delete-event]')) {
        deleteEvent();
      } else if (event.target.closest('[data-view-recommendation]')) {
        const item = state.events.find(candidate => candidate.id === state.selected);
        if (!item) return;
        const query = new URLSearchParams({
          date: item.recommendation_date || item.date,
          talhao_id: item.recommendation_plot_id || item.plot_id || '',
        });
        window.location.href = `/janela-de-ouro/?${query.toString()}`;
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && byId('farmEventModal').style.display === 'flex') closeEventForm();
      if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('[data-add-date]') && !event.target.closest('[data-event-id]')) {
        event.preventDefault();
        const slot = event.target.closest('[data-add-date]');
        openEventForm(slot.dataset.addDate, slot.dataset.addTime || '');
      }
    });
  }
  function init() {
    if (!byId('farmCalendarMonth')) return;
    bind();
    const pending = sessionStorage.getItem('goldcrop.pendingCalendarActivity');
    if (new URLSearchParams(window.location.search).get('atividade') === 'janela-de-ouro' && pending) {
      try {
        const recommendation = JSON.parse(pending);
        if (recommendation.date) state.date = recommendation.date;
      } catch (error) {
        console.error('Não foi possível ler a recomendação pendente para o calendário.', error);
      }
    }
    loadEvents();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
