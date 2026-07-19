import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { COIN_LABEL, COIN_MAP, YAO_POS, compile } from '../../lib/liuyao/najia';
import { LiuyaoInterpretError, interpretHexagram } from '../../lib/liuyao/interpret';
import '../../styles/back-link.css';
import './liuyao.css';

type RecordItem = {
  id: string;
  ts: number;
  question: string;
  result: any;
  aiText?: string;
};

const HISTORY_KEY = 'gaivrt_liuyao_history';
const EXAMPLES = [
  '我下个月能拿到 offer 吗？',
  '我明天的答辩会顺利吗？',
  '我应该放弃现在的工作吗？',
  '我和他还有复合的可能吗？',
  '我更适合去美国还是欧洲留学？',
];

function readHistory(): RecordItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeHistory(items: RecordItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 200)));
  } catch {
    // Casting and result viewing must still work when storage is unavailable.
  }
}

function createRecordId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function rollCoins() {
  return Array.from({ length: 3 }, () => Math.random() > 0.5 ? 3 : 2);
}

function lineParts(isYang: boolean) {
  return isYang ? <span class="yang-bar" /> : <><span class="yin-seg" /><span class="yin-seg" /></>;
}

function formatDate(ts: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts));
}

export default function LiuyaoApp() {
  const [question, setQuestion] = createSignal('');
  const [yaos, setYaos] = createSignal<number[]>([]);
  const [coins, setCoins] = createSignal<number[]>([]);
  const [shaking, setShaking] = createSignal(false);
  const [result, setResult] = createSignal<any>(null);
  const [view, setView] = createSignal<'cast' | 'result'>('cast');
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [interpretOpen, setInterpretOpen] = createSignal(false);
  const [aiText, setAiText] = createSignal('');
  const [aiState, setAiState] = createSignal<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [aiError, setAiError] = createSignal('');
  const [quotaRemaining, setQuotaRemaining] = createSignal<number | null>(null);
  const [currentRecordId, setCurrentRecordId] = createSignal('');
  const [history, setHistory] = createSignal<RecordItem[]>([]);
  const [motionReady, setMotionReady] = createSignal(false);
  let lock = false;
  let lastMotion = 0;
  let resultViewElement: HTMLElement | undefined;
  let resultShellElement: HTMLDivElement | undefined;
  let fitFrame = 0;

  const fitMobileViewport = () => {
    window.cancelAnimationFrame(fitFrame);
    fitFrame = window.requestAnimationFrame(() => {
      const compact = window.matchMedia('(max-width: 899px)').matches;
      const fit = (element: HTMLElement | undefined, viewport?: HTMLElement) => {
        if (!element) return;
        if (!compact) {
          element.style.removeProperty('--mobile-fit');
          return;
        }
        const availableHeight = viewport?.clientHeight ?? element.clientHeight;
        const availableWidth = viewport?.clientWidth ?? element.clientWidth;
        const naturalHeight = element.scrollHeight;
        const naturalWidth = element.scrollWidth;
        const scale = Math.min(
          1,
          naturalHeight > 0 ? availableHeight / naturalHeight : 1,
          naturalWidth > 0 ? availableWidth / naturalWidth : 1,
        );
        element.style.setProperty('--mobile-fit', String(Math.max(0.1, scale)));
      };
      fit(resultShellElement, resultViewElement);
    });
  };

  const displayYaos = createMemo(() => {
    const values = yaos();
    return Array.from({ length: 6 }, (_, offset) => {
      const i = 5 - offset;
      const value = values[i];
      return { i, value, isYang: value % 2 === 1, moving: value > 2 };
    });
  });

  const resultRows = createMemo(() => {
    const r = result();
    if (!r) return [];
    return Array.from({ length: 6 }, (_, offset) => {
      const i = 5 - offset;
      return {
        i,
        god: r.god6[i],
        relation: r.q6[i],
        branch: r.qx[i].substring(2),
        isYang: r.mk[i] === '1',
        moving: r.dong.includes(i),
        shiYing: r.sy[0] - 1 === i ? '世' : r.sy[1] - 1 === i ? '应' : '',
      };
    });
  });

  const resultChanges = createMemo(() => {
    const r = result();
    if (!r?.bian) return [];
    return r.dong.map((i: number) => ({
      i,
      position: YAO_POS[i],
      from: `${r.q6[i]} ${r.qx[i].substring(2)}`,
      to: `${r.bian.qin6[i]} ${r.bian.qinx[i].substring(2)}`,
    }));
  });

  const ganzi = createMemo(() => {
    const r = result();
    return r ? `${r.yg.gz}年　${r.mg.gz}月　${r.dg.gz}日　${r.hg.gz}时　旬空 ${r.xk}` : '';
  });

  const enableMotion = async () => {
    if (motionReady() || typeof DeviceMotionEvent === 'undefined') return;
    const Motion = DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
    if (Motion.requestPermission) {
      try {
        if (await Motion.requestPermission() !== 'granted') return;
      } catch {
        return;
      }
    }
    window.addEventListener('devicemotion', handleMotion);
    setMotionReady(true);
  };

  const handleMotion = (event: DeviceMotionEvent) => {
    const a = event.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    const now = Date.now();
    if (magnitude > 18 && now - lastMotion > 1500) {
      lastMotion = now;
      shake();
    }
  };

  const vibrate = (pattern: number | number[]) => {
    try {
      return navigator.vibrate?.(pattern) ?? false;
    } catch {
      return false;
    }
  };

  const shake = () => {
    if (lock || yaos().length >= 6) return;
    lock = true;
    vibrate(40);
    void enableMotion();
    setCoins(rollCoins());
    setShaking(true);

    let frames = 0;
    const timer = window.setInterval(() => {
      setCoins(rollCoins());
      frames += 1;
      if (frames < 12) return;
      window.clearInterval(timer);
      const finalCoins = rollCoins();
      const sum = finalCoins.reduce((total, coin) => total + coin, 0);
      const value = COIN_MAP[sum];
      const next = [...yaos(), value];
      setCoins(finalCoins);
      setYaos(next);
      setShaking(false);
      lock = false;
      vibrate(next.length === 6 ? [60, 40, 80] : 20);
      if (next.length === 6) setResult(compile(next, new Date()));
    }, 65);
  };

  const openResult = () => {
    const r = result();
    if (!r) return;
    setView('result');
    const record: RecordItem = { id: createRecordId(), ts: Date.now(), question: question().trim(), result: r };
    const next = [record, ...readHistory()].slice(0, 200);
    writeHistory(next);
    setHistory(next);
    setCurrentRecordId(record.id);
    setAiText('');
    setAiState('idle');
    setAiError('');
    setQuotaRemaining(null);
  };

  const reset = () => {
    setYaos([]);
    setCoins([]);
    setResult(null);
    setQuestion('');
    setView('cast');
    setHistoryOpen(false);
    setInterpretOpen(false);
    setAiText('');
    setAiState('idle');
    setAiError('');
    setQuotaRemaining(null);
    setCurrentRecordId('');
  };

  const shareResult = async () => {
    const text = `六爻 · ${result()?.name || '纳甲排盘'}${result()?.bian ? ` → ${result().bian.name}` : ''}`;
    try {
      if (navigator.share) await navigator.share({ title: text, text, url: location.href });
      else await navigator.clipboard?.writeText(`${text}\n${location.href}`);
    } catch {
      // Closing the native share sheet is not an error the page needs to surface.
    }
  };

  const openRecord = (record: RecordItem) => {
    setQuestion(record.question);
    setYaos(record.result.params || []);
    setResult(record.result);
    setView('result');
    setHistoryOpen(false);
    setCurrentRecordId(record.id);
    setAiText(record.aiText || '');
    setAiState(record.aiText ? 'success' : 'idle');
    setAiError('');
    setQuotaRemaining(null);
  };

  const persistInterpretation = (text: string) => {
    const id = currentRecordId();
    if (!id) return;
    const next = readHistory().map((record) => record.id === id ? { ...record, aiText: text } : record);
    writeHistory(next);
    setHistory(next);
  };

  const fetchInterpretation = async () => {
    const r = result();
    if (!r || aiState() === 'loading') return;
    setAiState('loading');
    setAiError('');
    try {
      const response = await interpretHexagram(r, question().trim());
      setAiText(response.text);
      setQuotaRemaining(response.quota.daily_remaining);
      setAiState('success');
      persistInterpretation(response.text);
    } catch (error) {
      const message = error instanceof LiuyaoInterpretError
        ? error.message
        : '解读服务暂时不可用，请稍后重试。';
      if (error instanceof LiuyaoInterpretError && error.code === 'QUOTA_EXHAUSTED') setQuotaRemaining(0);
      setAiError(message);
      setAiState('error');
    }
  };

  const openInterpretation = () => {
    setInterpretOpen(true);
    if (!aiText() && aiState() !== 'loading') void fetchInterpretation();
  };

  const removeRecord = (id: string, event: MouseEvent) => {
    event.stopPropagation();
    const next = history().filter((item) => item.id !== id);
    writeHistory(next);
    setHistory(next);
  };

  createEffect(() => {
    view();
    yaos().length;
    result();
    queueMicrotask(fitMobileViewport);
  });

  onMount(() => {
    setHistory(readHistory());
    document.documentElement.classList.add('liuyao-page-lock');
    document.body.classList.add('liuyao-page-lock');
    window.addEventListener('resize', fitMobileViewport);
    window.visualViewport?.addEventListener('resize', fitMobileViewport);
    void document.fonts?.ready.then(fitMobileViewport);
    fitMobileViewport();
  });
  onCleanup(() => {
    window.removeEventListener('devicemotion', handleMotion);
    window.removeEventListener('resize', fitMobileViewport);
    window.visualViewport?.removeEventListener('resize', fitMobileViewport);
    window.cancelAnimationFrame(fitFrame);
    document.documentElement.classList.remove('liuyao-page-lock');
    document.body.classList.remove('liuyao-page-lock');
  });

  return (
    <div class="liuyao-app" classList={{ 'screen-shaking': shaking() }}>
      <header class="liuyao-nav">
        <a href="/surface/" class="site-back-link" aria-label="Back to GAIVRT">
          <span class="site-back-arrow">←</span><span class="site-back-name">GAIVRT</span>
        </a>
        <button class="text-button" type="button" onClick={() => setHistoryOpen(true)}>历史</button>
      </header>

      <Show when={view() === 'cast'} fallback={
        <main class="result-view" ref={resultViewElement}>
          <div class="result-shell" ref={resultShellElement}>
            <section class="result-heading">
              <p class="result-ganzi">{ganzi()}</p>
              <Show when={question()}><p class="result-question">「{question()}」</p></Show>
              <h1>{result()?.name}</h1>
              <div class="result-gua-meta">
                <span>{result()?.gong}宫</span>
                <Show when={result()?.tp}><span>{result()?.tp}</span></Show>
              </div>
              <i class="result-divider" />
            </section>

            <section class="original-yao-card" aria-label="六爻排盘">
              <For each={resultRows()}>{(row) => (
                <article class="original-yao-row" classList={{ moving: row.moving, 'trigram-border': row.i === 3 }}>
                  <span class="original-god">{row.god}</span>
                  <span class="original-relation">{row.relation} {row.branch}</span>
                  <span class="original-line-wrap"><span class={`original-line ${row.isYang ? 'yang' : 'yin'} ${row.moving ? 'moving' : ''}`}>{lineParts(row.isYang)}</span></span>
                  <span class="original-shiying">{row.shiYing}</span>
                  <span class="original-moving-dot" classList={{ visible: row.moving }} />
                </article>
              )}</For>
            </section>

            <Show when={result()?.bian}>
              <section class="original-change-card">
                <header>
                  <span>变</span><i /><strong>{result()?.bian.name}</strong>
                </header>
                <p>{result()?.bian.gong}宫</p>
                <div class="original-change-list">
                  <For each={resultChanges()}>{(change) => (
                    <div><span>{change.position}爻</span><b>{change.from}</b><i>→</i><b>{change.to}</b></div>
                  )}</For>
                </div>
              </section>
            </Show>

            <footer class="result-footer">
              <button class="original-interpret-button" type="button" onClick={openInterpretation}>{aiState() === 'loading' ? '推演中' : '解读卦象'}</button>
              <div class="original-action-row">
                <button type="button" onClick={() => window.print()}>保存</button>
                <button type="button" onClick={shareResult}>分享</button>
              </div>
              <button class="original-reset-button" type="button" onClick={reset}>重新起卦</button>
            </footer>
          </div>

          <Show when={interpretOpen()}>
            <button class="interpret-mask" type="button" aria-label="关闭卦象解读" onClick={() => setInterpretOpen(false)} />
            <section class="interpret-sheet" aria-label="卦象解读">
              <i class="interpret-handle" />
              <header><h2>卦象解读</h2><button type="button" onClick={() => setInterpretOpen(false)}>×</button></header>
              <div class="interpret-body">
                <div class="interpret-summary">
                  <strong>{result()?.name}</strong>
                  <span>{result()?.gong}宫{result()?.tp ? ` · ${result().tp}` : ''}{result()?.bian ? ` · 变 ${result().bian.name}` : ''}</span>
                  <Show when={question()}><p>「{question()}」</p></Show>
                </div>
                <Show when={aiText()} fallback={
                  <div class="interpret-state" classList={{ error: aiState() === 'error' }} aria-live="polite">
                    <Show when={aiState() === 'loading'} fallback={
                      <>
                        <p>{aiError() || '正在准备解读。'}</p>
                        <button type="button" onClick={() => void fetchInterpretation()}>重新推演</button>
                      </>
                    }>
                      <span class="interpret-pulse" aria-hidden="true"><i /><i /><i /></span>
                      <p>正在结合月令、日辰与动爻推演卦象……</p>
                      <small>通常需要十几秒，请不要关闭页面</small>
                    </Show>
                  </div>
                }>
                  <p class="interpret-text">{aiText()}</p>
                </Show>
                <Show when={quotaRemaining() !== null}>
                  <p class="interpret-quota">今日还可解读 {quotaRemaining()} 次</p>
                </Show>
              </div>
            </section>
          </Show>
        </main>
      }>
        <main class="cast-view">
          <section class="cast-heading">
            <p class="eyebrow">纳甲排盘</p>
            <h1>六爻</h1>
            <p class="date-label">{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' }).format(new Date())}</p>
          </section>

          <Show when={yaos().length === 0 && !shaking()} fallback={
            <section class="casting-stage">
              <div class="coins" aria-label="三枚铜钱">
                <For each={coins()}>{(coin) => <span class={`coin ${coin === 3 ? 'coin-yang' : 'coin-yin'} ${shaking() ? 'shaking' : ''}`}><i /></span>}</For>
              </div>
              <div class="hexagram">
                <For each={displayYaos()}>{(row) => (
                  <div class={`cast-row ${row.i === 3 ? 'outer-start' : ''}`}>
                    <span class={`cast-label ${row.moving ? 'moving' : ''}`}>{row.value ? COIN_LABEL[row.value] : ''}</span>
                    <span class={`yao-line ${row.value ? (row.isYang ? 'yang' : 'yin') : 'empty'} ${row.moving ? 'moving' : ''}`}>
                      {row.value ? lineParts(row.isYang) : null}
                    </span>
                    <span class="cast-label">{row.moving ? '动' : ''}</span>
                  </div>
                )}</For>
              </div>
              <p class="progress-label">{result()
                ? `${result().name} · ${result().gong}宫`
                : shaking()
                  ? `第 ${yaos().length + 1} 爻 · 摇动中`
                  : `第 ${yaos().length} / 6 爻`}</p>
            </section>
          }>
            <section class="question-stage">
              <label for="liuyao-question">你想问什么？</label>
              <input id="liuyao-question" value={question()} onInput={(e) => setQuestion(e.currentTarget.value)} maxlength="125" placeholder={EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]} />
              <p>思定而问 · 一事一占</p>
            </section>
          </Show>

          <footer class="cast-actions">
            <Show when={yaos().length < 6} fallback={<button class="primary-button" type="button" disabled={!result()} onClick={openResult}>{result() ? '查看排盘' : '正在装卦'}</button>}>
              <button class="primary-button" type="button" disabled={shaking()} onClick={shake}>{yaos().length ? '继续' : '摇卦'}</button>
              <p>{motionReady() ? '也可轻摇手机' : '点击后可启用轻摇手机'}</p>
            </Show>
            <button class="reset-button" type="button" classList={{ hidden: yaos().length === 0 }} onClick={reset}>重置</button>
          </footer>
        </main>
      </Show>

      <Show when={historyOpen()}>
        <div class="history-mask" onClick={() => setHistoryOpen(false)} />
        <aside class="history-sheet" aria-label="占卦历史">
          <header><div><p class="eyebrow">Local archive</p><h2>历史</h2></div><button type="button" onClick={() => setHistoryOpen(false)} aria-label="关闭">×</button></header>
          <Show when={history().length} fallback={<p class="empty-history">还没有留下卦例。</p>}>
            <div class="history-list">
              <For each={history()}>{(record) => (
                <button class="history-item" type="button" onClick={() => openRecord(record)}>
                  <span><b>{record.result?.name || '未命名'}</b><small>{record.question || `${record.result?.gong || ''}宫`}</small></span>
                  <span class="history-meta">{formatDate(record.ts)}<i onClick={(e) => removeRecord(record.id, e)}>删除</i></span>
                </button>
              )}</For>
            </div>
          </Show>
        </aside>
      </Show>
    </div>
  );
}
