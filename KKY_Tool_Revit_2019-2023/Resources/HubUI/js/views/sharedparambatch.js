import { clear, div, toast } from '../core/dom.js';
import { post, onHost } from '../core/bridge.js';

export function renderSharedParamBatch(root) {
  const target = root || document.getElementById('view-root') || document.getElementById('app');
  clear(target);
  const top = document.querySelector('#topbar-root .topbar') || document.querySelector('.topbar');
  if (top) top.classList.add('hub-topbar');

  const page = div('sharedparambatch-page feature-shell');
  const header = div('feature-header');
  const heading = div('feature-heading');
  heading.innerHTML = `
    <span class="feature-kicker">Shared Parameter Batch</span>
    <h2 class="feature-title">공유 파라미터 일괄 추가</h2>
    <p class="feature-sub">선택한 공유 파라미터를 다중 RVT에 일괄 적용합니다.</p>`;

  const actions = div('feature-actions');
  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'btn btn--primary';
  runBtn.textContent = '일괄 추가 실행';
  runBtn.addEventListener('click', () => {
    post('hub:sharedparam-batch', {});
  });
  actions.append(runBtn);
  header.append(heading, actions);
  page.append(header);

  const layout = div('sharedparambatch-layout');

  const guideCard = div('sharedparambatch-card');
  guideCard.innerHTML = `
    <h3>준비 사항</h3>
    <ul class="sharedparambatch-list">
      <li>활성 프로젝트 문서가 필요합니다. (패밀리 문서 불가)</li>
      <li>Revit의 Shared Parameters 경로가 먼저 설정되어 있어야 합니다.</li>
      <li>필요한 파라미터를 선택하고 카테고리를 지정한 뒤 실행합니다.</li>
    </ul>`;

  const workflowCard = div('sharedparambatch-card');
  workflowCard.innerHTML = `
    <h3>실행 흐름</h3>
    <ol class="sharedparambatch-steps">
      <li>Shared Parameter TXT에서 정의를 선택합니다.</li>
      <li>바인딩 방식 및 카테고리를 설정합니다.</li>
      <li>대상 RVT 파일 목록을 지정하고 실행합니다.</li>
    </ol>
    <p class="sharedparambatch-note">실행 중에는 Revit 창에서 진행 상태와 로그가 표시됩니다.</p>`;

  const resultCard = div('sharedparambatch-card');
  resultCard.innerHTML = `
    <h3>결과 로그</h3>
    <p class="sharedparambatch-note">작업이 완료되면 임시 폴더에 로그 파일이 저장됩니다.</p>`;

  layout.append(guideCard, workflowCard, resultCard);
  page.append(layout);
  target.append(page);

  onHost('host:warn', (payload) => {
    const msg = payload?.message || '작업이 취소되었거나 실패했습니다.';
    toast(msg, 'warn');
  });

  onHost('host:error', (payload) => {
    const msg = payload?.message || '작업 중 오류가 발생했습니다.';
    toast(msg, 'err');
  });
}
