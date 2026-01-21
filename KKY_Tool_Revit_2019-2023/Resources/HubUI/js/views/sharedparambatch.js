import { clear, div, toast, showExcelSavedDialog, chooseExcelMode } from '../core/dom.js';
import { ProgressDialog } from '../core/progress.js';
import { post, onHost } from '../core/bridge.js';
import { createRvtTable, renderRvtRows, getRvtName } from './rvtTable.js';

const DEFAULT_SUMMARY = { okCount: 0, failCount: 0, skipCount: 0 };

export function renderSharedParamBatch(root) {
  const target = root || document.getElementById('view-root') || document.getElementById('app');
  clear(target);
  const top = document.querySelector('#topbar-root .topbar') || document.querySelector('.topbar');
  if (top) top.classList.add('hub-topbar');

  const state = {
    spFilePath: '',
    groups: [],
    defsByGroup: {},
    categoryTree: [],
    paramGroups: [],
    selectedGroup: '',
    selectedParams: [],
    defSelection: new Set(),
    defSearch: '',
    rvtList: [],
    rvtChecked: new Set(),
    options: {
      closeAllWorksetsOnOpen: true,
      syncComment: ''
    },
    summary: { ...DEFAULT_SUMMARY },
    logs: [],
    logTextPath: '',
    running: false,
    lastProgressPct: 0
  };

  const page = div('feature-shell sharedparambatch-page');
  const header = div('feature-header');
  const heading = div('feature-heading');
  heading.innerHTML = `
    <span class="feature-kicker">Project Parameter</span>
    <h2 class="feature-title">Project Parameter 추가 (Project/Shared)</h2>
    <p class="feature-sub">Project/Shared 파라미터를 여러 RVT에 일괄 추가/바인딩합니다.</p>`;

  const actionRow = div('feature-actions');
  const btnRun = cardBtn('실행', onRun);
  const btnExport = cardBtn('엑셀 내보내기', onExport, 'btn--secondary');
  btnExport.disabled = true;
  actionRow.append(btnRun, btnExport);

  header.append(heading, actionRow);
  page.append(header);

  const layout = div('sharedparambatch-layout');
  page.append(layout);

  const warningSection = div('section sharedparambatch-section spb-warning');
  const warningText = document.createElement('div');
  warningText.textContent = 'Shared Parameters TXT가 Revit에 설정되어 있지 않습니다. Manage > Shared Parameters에서 등록 후 새로고침하세요.';
  const warningActions = div('section-actions');
  warningActions.append(cardBtn('새로고침', () => post('sharedparambatch:init', {}), 'btn--secondary'));
  warningSection.append(warningText, warningActions);
  warningSection.style.display = 'none';

  const selectSection = div('section sharedparambatch-section');
  selectSection.append(sectionHeader('Shared Parameter 선택', []));

  const groupSelect = document.createElement('select');
  groupSelect.className = 'sharedparambatch-select spb-groupSelect';
  groupSelect.addEventListener('change', () => {
    state.selectedGroup = groupSelect.value;
    renderDefinitionList();
  });

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'sharedparambatch-input spb-search';
  searchInput.placeholder = '파라미터 검색…';
  searchInput.addEventListener('input', () => {
    state.defSearch = (searchInput.value || '').trim();
    renderDefinitionList();
  });

  const defHeader = div('spb-defHeader');
  defHeader.append(labelSpan('Group'), groupSelect, searchInput);

  const addBtn = cardBtn('선택 추가', onAddSelectedDefs);
  defHeader.append(addBtn);

  const defList = document.createElement('select');
  defList.className = 'sharedparambatch-def-list spb-defList';
  defList.multiple = true;
  defList.addEventListener('change', () => {
    const next = new Set();
    Array.from(defList.selectedOptions || []).forEach((opt) => {
      const guid = opt.dataset.guid;
      if (guid) next.add(guid);
    });
    state.defSelection = next;
  });

  const defBox = div('sharedparambatch-card');
  defBox.append(defHeader, defList);

  const selectGrid = div('sharedparambatch-select-grid');
  selectGrid.append(defBox);
  selectSection.append(selectGrid);

  const selectedSection = div('section sharedparambatch-section');
  selectedSection.append(sectionHeader('Selected Parameters', []));
  const paramTable = document.createElement('table');
  paramTable.className = 'sharedparambatch-table';
  paramTable.innerHTML = '<thead><tr><th>Name</th><th>GUID</th><th>Binding</th><th>Group</th><th>Categories</th><th>Action</th></tr></thead><tbody></tbody>';
  const paramBody = paramTable.querySelector('tbody');
  const paramWrap = div('spb-tableWrap');
  paramWrap.append(paramTable);
  selectedSection.append(paramWrap);

  const rvtSection = div('section sharedparambatch-section');
  const rvtHeader = sectionHeader('RVT 파일', [
    cardBtn('추가', () => post('sharedparambatch:browse-rvts', {})),
    cardBtn('선택 삭제', removeSelectedRvts, 'btn--secondary'),
    cardBtn('전체 삭제', clearRvts, 'btn--secondary')
  ]);
  rvtSection.append(rvtHeader);
  const { table: rvtTable, tbody: rvtBody, master: rvtMaster } = createRvtTable();
  const rvtListWrap = div('spb-rvtList');
  rvtListWrap.append(rvtTable);
  rvtSection.append(rvtListWrap);

  const optionsSection = div('section sharedparambatch-section');
  optionsSection.append(sectionHeader('Options', []));
  const optionsGrid = div('sharedparambatch-options');
  const closeWrap = div('sharedparambatch-option');
  const closeChk = document.createElement('input');
  closeChk.type = 'checkbox';
  closeChk.checked = true;
  closeChk.id = 'spb-close-worksets';
  closeChk.addEventListener('change', () => { state.options.closeAllWorksetsOnOpen = !!closeChk.checked; });
  const closeLbl = document.createElement('label');
  closeLbl.setAttribute('for', 'spb-close-worksets');
  closeLbl.textContent = 'Workshared: Open CloseAllWorksets';
  closeWrap.append(closeChk, closeLbl);

  const syncWrap = div('sharedparambatch-option');
  const syncInput = document.createElement('input');
  syncInput.type = 'text';
  syncInput.className = 'sharedparambatch-input';
  syncInput.placeholder = 'Sync Comment';
  syncInput.addEventListener('input', () => { state.options.syncComment = syncInput.value || ''; });
  syncWrap.append(labelSpan('Sync Comment'), syncInput);

  optionsGrid.append(closeWrap, syncWrap);
  optionsSection.append(optionsGrid);

  const resultSection = div('section sharedparambatch-section');
  const resultHeader = sectionHeader('결과', []);
  resultSection.append(resultHeader);
  const summaryRow = div('sharedparambatch-summary');
  const badgeOk = summaryBadge('OK', '0');
  const badgeFail = summaryBadge('FAIL', '0');
  const badgeSkip = summaryBadge('SKIP', '0');
  summaryRow.append(badgeOk.wrap, badgeFail.wrap, badgeSkip.wrap);

  const logPathRow = div('sharedparambatch-logpath');
  const logPathText = document.createElement('span');
  logPathText.textContent = '로그 파일: -';
  const logOpenBtn = cardBtn('폴더 열기', () => {
    if (!state.logTextPath) { toast('로그 파일이 없습니다.', 'err'); return; }
    post('sharedparambatch:open-folder', { path: state.logTextPath });
  }, 'btn--secondary');
  logOpenBtn.disabled = true;
  logPathRow.append(logPathText, logOpenBtn);

  const logTable = document.createElement('table');
  logTable.className = 'sharedparambatch-table';
  logTable.innerHTML = '<thead><tr><th>Level</th><th>RVT</th><th>Message</th></tr></thead><tbody></tbody>';
  const logBody = logTable.querySelector('tbody');

  resultSection.append(summaryRow, logPathRow, logTable);

  const topGrid = div('spb-topGrid');
  topGrid.append(selectSection, rvtSection);
  layout.append(warningSection, topGrid, selectedSection, optionsSection, resultSection);
  page.append(layout);
  page.append(buildSettingsModal());

  target.append(page);

  onHost('sharedparambatch:init', handleInit);
  onHost('sharedparambatch:rvts-picked', handleRvtsPicked);
  onHost('sharedparambatch:progress', handleProgress);
  onHost('sharedparambatch:done', handleDone);
  onHost('sharedparambatch:exported', handleExported);
  onHost('revit:error', ({ message }) => { finishRunning(false); toast(message || 'Revit 오류가 발생했습니다.', 'err', 3200); });
  onHost('host:error', ({ message }) => { finishRunning(false); toast(message || '호스트 오류가 발생했습니다.', 'err', 3200); });

  post('sharedparambatch:init', {});
  renderRvtList();

  function handleInit(payload) {
    if (!payload || !payload.ok) {
      warningSection.style.display = 'flex';
      toast(payload?.message || '초기화 실패', 'err');
      return;
    }
    warningSection.style.display = 'none';
    state.spFilePath = payload.spFilePath || '';
    state.groups = Array.isArray(payload.groups) ? payload.groups : [];
    state.defsByGroup = payload.defsByGroup || {};
    state.categoryTree = Array.isArray(payload.categoryTree) ? payload.categoryTree : [];
    state.paramGroups = Array.isArray(payload.paramGroups) ? payload.paramGroups : [];
    renderGroupOptions();
    renderDefinitionList();
    renderSelectedParams();
  }

  function renderGroupOptions() {
    groupSelect.innerHTML = '';
    if (!state.groups.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '그룹 없음';
      groupSelect.append(opt);
      state.selectedGroup = '';
      return;
    }
    state.groups.forEach((g, idx) => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      groupSelect.append(opt);
      if (idx === 0) state.selectedGroup = g;
    });
    groupSelect.value = state.selectedGroup;
  }

  function renderDefinitionList() {
    defList.innerHTML = '';
    const defs = state.defsByGroup[state.selectedGroup] || [];
    const search = (state.defSearch || '').toLowerCase();
    const filtered = search
      ? defs.filter(d => (d.name || '').toLowerCase().includes(search))
      : defs;
    if (!filtered.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '정의 없음';
      defList.append(opt);
      return;
    }
    filtered.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.guid;
      opt.textContent = `${d.name} (${d.paramTypeLabel || ''})`;
      opt.dataset.name = d.name;
      opt.dataset.group = state.selectedGroup;
      opt.dataset.guid = d.guid;
      opt.dataset.paramTypeLabel = d.paramTypeLabel || '';
      opt.dataset.desc = d.desc || '';
      if (state.defSelection.has(d.guid)) opt.selected = true;
      defList.append(opt);
    });
  }

  function onAddSelectedDefs() {
    if (!defList.options.length) return;
    const selected = Array.from(defList.selectedOptions || []);
    if (!selected.length) { toast('추가할 파라미터를 선택하세요.', 'err'); return; }

    const nextSelection = new Set(state.defSelection);
    selected.forEach((opt) => {
      const guid = opt.dataset.guid;
      if (!guid || state.selectedParams.some(p => p.guid === guid)) return;
      nextSelection.add(guid);
      state.selectedParams.push({
        groupName: opt.dataset.group || state.selectedGroup,
        name: opt.dataset.name || opt.textContent,
        guid,
        paramTypeLabel: opt.dataset.paramTypeLabel || '',
        desc: opt.dataset.desc || '',
        settings: {
          isInstanceBinding: true,
          paramGroup: state.paramGroups[0]?.id || 'PG_DATA',
          allowVaryBetweenGroups: false,
          categories: []
        }
      });
    });
    state.defSelection = nextSelection;
    renderSelectedParams();
  }

  function renderSelectedParams() {
    paramBody.innerHTML = '';
    if (!state.selectedParams.length) {
      const tr = document.createElement('tr');
      tr.className = 'empty-row';
      const td = document.createElement('td');
      td.className = 'empty-cell';
      td.colSpan = 6;
      td.textContent = '선택된 파라미터가 없습니다.';
      tr.append(td);
      paramBody.append(tr);
      return;
    }

    state.selectedParams.forEach((p, idx) => {
      const tr = document.createElement('tr');
      tr.append(tdText(p.name));
      tr.append(tdText(p.guid));
      tr.append(tdText(p.settings.isInstanceBinding ? 'Instance' : 'Type'));
      tr.append(tdText(formatParamGroup(p.settings.paramGroup)));
      tr.append(tdText(String(p.settings.categories.length)));

      const actionTd = document.createElement('td');
      const btnSetting = actionBtn('설정', () => openSettingsModal(idx));
      const btnRemove = actionBtn('삭제', () => {
        state.selectedParams.splice(idx, 1);
        renderSelectedParams();
      }, 'btn--ghost');
      actionTd.append(btnSetting, btnRemove);
      tr.append(actionTd);
      paramBody.append(tr);
    });
  }

  function renderRvtList() {
    const allChecked = state.rvtList.length > 0 && state.rvtList.every(f => state.rvtChecked.has(f));
    rvtMaster.checked = allChecked;
    rvtMaster.disabled = state.rvtList.length === 0;
    rvtMaster.onchange = () => {
      if (rvtMaster.checked) state.rvtChecked = new Set(state.rvtList);
      else state.rvtChecked.clear();
      renderRvtList();
      updateButtons();
    };
    const rows = state.rvtList.map((p, idx) => ({
      checked: state.rvtChecked.has(p),
      index: idx + 1,
      name: getRvtName(p),
      path: p,
      title: p,
      onToggle: (checked) => {
        if (checked) state.rvtChecked.add(p);
        else state.rvtChecked.delete(p);
        updateButtons();
      }
    }));
    renderRvtRows(rvtBody, rows);
    updateButtons();
  }

  function handleRvtsPicked(payload) {
    if (!payload || !payload.ok) {
      if (payload?.message) toast(payload.message, 'err');
      return;
    }
    const paths = Array.isArray(payload.rvtPaths) ? payload.rvtPaths : [];
    let changed = false;
    paths.forEach((p) => {
      if (!state.rvtList.includes(p)) {
        state.rvtList.push(p);
        state.rvtChecked.add(p);
        changed = true;
      }
    });
    if (changed) renderRvtList();
  }

  function removeSelectedRvts() {
    if (!state.rvtChecked.size) { toast('삭제할 RVT를 선택하세요.', 'err'); return; }
    state.rvtList = state.rvtList.filter(p => !state.rvtChecked.has(p));
    state.rvtChecked.clear();
    renderRvtList();
  }

  function clearRvts() {
    state.rvtList = [];
    state.rvtChecked.clear();
    renderRvtList();
  }

  function onRun() {
    if (state.running) return;
    if (!state.selectedParams.length) { toast('파라미터를 선택하세요.', 'err'); return; }
    if (!state.rvtList.length) { toast('RVT 파일을 추가하세요.', 'err'); return; }
    const missingCats = state.selectedParams.filter(p => !p.settings.categories.length);
    if (missingCats.length) {
      toast('카테고리를 지정하지 않은 파라미터가 있습니다.', 'err');
      return;
    }

    const payload = {
      spFilePath: state.spFilePath,
      rvtPaths: state.rvtList,
      parameters: state.selectedParams.map(p => ({
        groupName: p.groupName,
        paramName: p.name,
        guid: p.guid,
        paramTypeLabel: p.paramTypeLabel,
        description: p.desc,
        settings: {
          isInstanceBinding: p.settings.isInstanceBinding,
          paramGroup: p.settings.paramGroup,
          allowVaryBetweenGroups: p.settings.allowVaryBetweenGroups,
          categories: p.settings.categories
        }
      })),
      closeAllWorksetsOnOpen: state.options.closeAllWorksetsOnOpen,
      syncComment: state.options.syncComment
    };

    state.running = true;
    updateButtons();
    ProgressDialog.show('Project Parameter 추가', '작업 준비 중...');
    ProgressDialog.update(0, '작업 준비 중...', '');
    post('sharedparambatch:run', payload);
  }

  function handleProgress(payload) {
    if (!payload) return;
    const total = Number(payload.total || payload.Total || 0);
    const step = Number(payload.step || payload.Step || 0);
    const text = payload.text || payload.message || '';
    const percentFromStep = total > 0 ? (step / total) * 100 : 0;
    const percentFromPhase = Number(payload.phaseProgress) * 100;
    const percentRaw = Number.isFinite(payload.percent) ? Number(payload.percent) : (Number.isFinite(percentFromPhase) && percentFromPhase > 0 ? percentFromPhase : percentFromStep);
    const pct = Math.max(0, Math.min(100, percentRaw || 0));
    state.lastProgressPct = pct;
    ProgressDialog.show('Project Parameter 추가', text || '진행 중');
    ProgressDialog.update(pct, text || '진행 중', total ? `${step} / ${total}` : '');
    if (pct >= 100) ProgressDialog.hide();
  }

  function handleDone(payload) {
    finishRunning(true);
    if (!payload || !payload.ok) {
      toast(payload?.message || '실행 실패', 'err');
      return;
    }
    state.summary = payload.summary || { ...DEFAULT_SUMMARY };
    state.logs = Array.isArray(payload.logs) ? payload.logs : [];
    state.logTextPath = payload.logTextPath || '';
    renderSummary();
    renderLogs();
    if (state.logs.length) toast('완료되었습니다.', 'ok');
  }

  function finishRunning(resetProgress) {
    state.running = false;
    updateButtons();
    if (resetProgress) {
      state.lastProgressPct = 0;
      ProgressDialog.hide();
    }
  }

  function onExport() {
    if (!state.logs.length) { toast('내보낼 로그가 없습니다.', 'err'); return; }
    chooseExcelMode((mode) => post('sharedparambatch:export-excel', { excelMode: mode || 'fast' }));
  }

  function handleExported(payload) {
    if (!payload || !payload.ok) {
      toast(payload?.message || '엑셀 내보내기 실패', 'err');
      return;
    }
    const path = payload.filePath || payload.path;
    showExcelSavedDialog('엑셀로 내보냈습니다.', path, (p) => post('excel:open', { path: p }));
  }

  function renderSummary() {
    badgeOk.value.textContent = String(state.summary.okCount ?? 0);
    badgeFail.value.textContent = String(state.summary.failCount ?? 0);
    badgeSkip.value.textContent = String(state.summary.skipCount ?? 0);
    logPathText.textContent = state.logTextPath ? `로그 파일: ${state.logTextPath}` : '로그 파일: -';
    logOpenBtn.disabled = !state.logTextPath;
    btnExport.disabled = !state.logs.length;
  }

  function renderLogs() {
    logBody.innerHTML = '';
    if (!state.logs.length) {
      const tr = document.createElement('tr');
      tr.className = 'empty-row';
      const td = document.createElement('td');
      td.className = 'empty-cell';
      td.colSpan = 3;
      td.textContent = '로그가 없습니다.';
      tr.append(td);
      logBody.append(tr);
      return;
    }
    state.logs.forEach((log) => {
      const tr = document.createElement('tr');
      tr.append(tdText(log.level || ''));
      tr.append(tdText(log.file || ''));
      tr.append(tdText(log.msg || ''));
      logBody.append(tr);
    });
  }

  function updateButtons() {
    const disabled = state.running;
    btnRun.disabled = disabled;
    addBtn.disabled = disabled;
  }

  function formatParamGroup(value) {
    const match = state.paramGroups.find(g => g.id === value || g.Id === value);
    if (match) return match.label || match.Label || value || '';
    return value || '';
  }

  function buildSettingsModal() {
    const overlay = div('sharedparambatch-modal-overlay');
    const modal = div('sharedparambatch-modal');
    const header = div('sharedparambatch-modal__header');
    const title = div('sharedparambatch-modal__title');
    const closeBtn = actionBtn('닫기', closeSettingsModal, 'btn--ghost');
    header.append(title, closeBtn);

    const body = div('sharedparambatch-modal__body');
    const footer = div('sharedparambatch-modal__footer');
    const saveBtn = cardBtn('저장', saveSettings);
    footer.append(saveBtn);

    modal.append(header, body, footer);
    overlay.append(modal);

    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) closeSettingsModal(); });

    buildSettingsModal.overlay = overlay;
    buildSettingsModal.title = title;
    buildSettingsModal.body = body;
    buildSettingsModal.saveBtn = saveBtn;
    buildSettingsModal.currentIndex = -1;

    return overlay;
  }

  function openSettingsModal(index) {
    const modal = buildSettingsModal;
    if (!modal.body || !state.selectedParams[index]) return;

    const param = state.selectedParams[index];
    modal.currentIndex = index;
    modal.title.textContent = `${param.name} 설정`;
    modal.body.innerHTML = '';

    const bindingRow = div('sharedparambatch-modal-row');
    bindingRow.append(subTitle('Binding'));
    const bindingOpts = div('sharedparambatch-binding');
    const instRadio = radio('spb-binding', 'Instance', param.settings.isInstanceBinding, (checked) => {
      if (checked) param.settings.isInstanceBinding = true;
      toggleVary();
    });
    const typeRadio = radio('spb-binding', 'Type', !param.settings.isInstanceBinding, (checked) => {
      if (checked) param.settings.isInstanceBinding = false;
      toggleVary();
    });
    bindingOpts.append(instRadio.wrap, typeRadio.wrap);
    bindingRow.append(bindingOpts);

    const groupRow = div('sharedparambatch-modal-row');
    groupRow.append(subTitle('Parameter Group'));
    const groupSelectEl = document.createElement('select');
    groupSelectEl.className = 'sharedparambatch-select';
    state.paramGroups.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g.id || g.Id;
      opt.textContent = g.label || g.Label || opt.value;
      groupSelectEl.append(opt);
    });
    groupSelectEl.value = param.settings.paramGroup;
    groupSelectEl.addEventListener('change', () => { param.settings.paramGroup = groupSelectEl.value; });
    groupRow.append(groupSelectEl);

    const varyRow = div('sharedparambatch-modal-row');
    const varyWrap = div('sharedparambatch-option');
    const varyChk = document.createElement('input');
    varyChk.type = 'checkbox';
    varyChk.checked = !!param.settings.allowVaryBetweenGroups;
    varyChk.id = 'spb-vary';
    varyChk.addEventListener('change', () => { param.settings.allowVaryBetweenGroups = !!varyChk.checked; });
    const varyLbl = document.createElement('label');
    varyLbl.setAttribute('for', 'spb-vary');
    varyLbl.textContent = 'Vary between groups';
    varyWrap.append(varyChk, varyLbl);
    varyRow.append(varyWrap);

    const categoryRow = div('sharedparambatch-modal-row');
    categoryRow.append(subTitle('Categories'));
    const categoryActions = div('sharedparambatch-category-actions');
    const btnAll = cardBtn('전체 선택', () => selectAllCategories(param), 'btn--secondary');
    const btnClear = cardBtn('전체 해제', () => clearAllCategories(param), 'btn--secondary');
    categoryActions.append(btnAll, btnClear);
    categoryRow.append(categoryActions);

    const treeWrap = div('sharedparambatch-category-tree');
    renderCategoryTree(treeWrap, param);
    categoryRow.append(treeWrap);

    modal.body.append(bindingRow, groupRow, varyRow, categoryRow);
    toggleVary();

    if (modal.overlay) modal.overlay.classList.add('is-open');

    function toggleVary() {
      varyChk.disabled = !param.settings.isInstanceBinding;
      if (!param.settings.isInstanceBinding) {
        param.settings.allowVaryBetweenGroups = false;
        varyChk.checked = false;
      }
    }
  }

  function closeSettingsModal() {
    const modal = buildSettingsModal;
    if (modal.overlay) modal.overlay.classList.remove('is-open');
    modal.currentIndex = -1;
  }

  function saveSettings() {
    closeSettingsModal();
    renderSelectedParams();
  }

  function renderCategoryTree(container, param) {
    container.innerHTML = '';
    if (!state.categoryTree.length) {
      container.textContent = '카테고리 정보가 없습니다.';
      return;
    }
    const selected = new Set(param.settings.categories.map(c => c.path || c.name));
    const list = document.createElement('ul');
    list.className = 'sharedparambatch-tree';
    state.categoryTree.forEach((node) => list.append(buildCategoryNode(node)));
    container.append(list);

    function buildCategoryNode(node) {
      const li = document.createElement('li');
      const row = div('sharedparambatch-tree-row');
      if (node.isBindable) {
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = selected.has(node.path || node.name);
        chk.addEventListener('change', () => {
          if (chk.checked) {
            addCategory(param, node);
          } else {
            removeCategory(param, node);
          }
        });
        row.append(chk);
      }
      const label = document.createElement('span');
      label.textContent = node.name || '';
      row.append(label);
      li.append(row);

      if (node.children && node.children.length) {
        const childList = document.createElement('ul');
        childList.className = 'sharedparambatch-tree';
        node.children.forEach((child) => childList.append(buildCategoryNode(child)));
        li.append(childList);
      }
      return li;
    }
  }

  function addCategory(param, node) {
    if (!param.settings.categories.find(c => c.path === node.path)) {
      param.settings.categories.push({
        idInt: node.idInt,
        name: node.name,
        path: node.path
      });
    }
  }

  function removeCategory(param, node) {
    param.settings.categories = param.settings.categories.filter(c => c.path !== node.path);
  }

  function selectAllCategories(param) {
    const all = [];
    collectBindable(state.categoryTree, all);
    param.settings.categories = all.map((n) => ({ idInt: n.idInt, name: n.name, path: n.path }));
    const modal = buildSettingsModal;
    if (modal.body) renderCategoryTree(modal.body.querySelector('.sharedparambatch-category-tree'), param);
  }

  function clearAllCategories(param) {
    param.settings.categories = [];
    const modal = buildSettingsModal;
    if (modal.body) renderCategoryTree(modal.body.querySelector('.sharedparambatch-category-tree'), param);
  }

  function collectBindable(nodes, out) {
    nodes.forEach((n) => {
      if (n.isBindable) out.push(n);
      if (n.children && n.children.length) collectBindable(n.children, out);
    });
  }

  function sectionHeader(title, buttons) {
    const wrap = div('section-header');
    const h = document.createElement('h3');
    h.textContent = title;
    wrap.append(h);
    if (Array.isArray(buttons) && buttons.length) {
      const actions = div('section-actions');
      buttons.forEach(btn => actions.append(btn));
      wrap.append(actions);
    }
    return wrap;
  }

  function subTitle(text) {
    const el = document.createElement('div');
    el.className = 'sharedparambatch-subtitle';
    el.textContent = text;
    return el;
  }

  function summaryBadge(label, value) {
    const wrap = div('sharedparambatch-badge');
    const span = document.createElement('span');
    span.textContent = label;
    const val = document.createElement('strong');
    val.textContent = value;
    wrap.append(span, val);
    return { wrap, value: val };
  }

  function cardBtn(text, onClick, extraClass = '') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ${extraClass}`.trim();
    btn.textContent = text;
    if (typeof onClick === 'function') btn.addEventListener('click', onClick);
    return btn;
  }

  function actionBtn(text, onClick, extraClass = '') {
    return cardBtn(text, onClick, `btn--small ${extraClass}`.trim());
  }

  function tdText(value) {
    const td = document.createElement('td');
    td.textContent = value == null ? '' : String(value);
    return td;
  }

  function labelSpan(text) {
    const span = document.createElement('span');
    span.className = 'sharedparambatch-label';
    span.textContent = text;
    return span;
  }

  function radio(name, label, checked, onChange) {
    const wrap = div('sharedparambatch-radio');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.checked = checked;
    const span = document.createElement('span');
    span.textContent = label;
    input.addEventListener('change', () => { if (input.checked && onChange) onChange(true); });
    wrap.append(input, span);
    return { wrap, input };
  }
}
