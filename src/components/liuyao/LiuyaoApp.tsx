import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { COIN_LABEL, COIN_MAP, YAO_POS, compile } from '../../lib/liuyao/najia';
import './liuyao.css';

type RecordItem = {
  id: string;
  ts: number;
  question: string;
  result: any;
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
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 200)));
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
  const [history, setHistory] = createSignal<RecordItem[]>([]);
  const [motionReady, setMotionReady] = createSignal(false);
  let lock = false;
  let lastMotion = 0;

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
        status: r.status?.[i]?.join(' · ') || '',
      };
    });
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
      void shake();
    }
  };

  const shake = async () => {
    await enableMotion();
    if (lock || yaos().length >= 6) return;
    lock = true;
    setShaking(true);
    navigator.vibrate?.(35);

    let frames = 0;
    const timer = window.setInterval(() => {
      setCoins(Array.from({ length: 3 }, () => Math.random() > 0.5 ? 3 : 2));
      frames += 1;
      if (frames < 12) return;
      window.clearInterval(timer);
      const finalCoins = Array.from({ length: 3 }, () => Math.random() > 0.5 ? 3 : 2);
      const sum = finalCoins.reduce((total, coin) => total + coin, 0);
      const value = COIN_MAP[sum];
      const next = [...yaos(), value];
      setCoins(finalCoins);
      setYaos(next);
      setShaking(false);
      lock = false;
      navigator.vibrate?.(next.length === 6 ? [60, 40, 80] : 20);
      if (next.length === 6) setResult(compile(next, new Date()));
    }, 65);
  };

  const openResult = () => {
    const r = result();
    if (!r) return;
    const record: RecordItem = { id: crypto.randomUUID(), ts: Date.now(), question: question().trim(), result: r };
    const next = [record, ...readHistory()].slice(0, 200);
    writeHistory(next);
    setHistory(next);
    setView('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => {
    setYaos([]);
    setCoins([]);
    setResult(null);
    setQuestion('');
    setView('cast');
    setHistoryOpen(false);
  };

  const openRecord = (record: RecordItem) => {
    setQuestion(record.question);
    setYaos(record.result.params || []);
    setResult(record.result);
    setView('result');
    setHistoryOpen(false);
  };

  const removeRecord = (id: string, event: MouseEvent) => {
    event.stopPropagation();
    const next = history().filter((item) => item.id !== id);
    writeHistory(next);
    setHistory(next);
  };

  onMount(() => setHistory(readHistory()));
  onCleanup(() => window.removeEventListener('devicemotion', handleMotion));

  return (
    <div class="liuyao-app">
      <header class="liuyao-nav">
        <a href="/surface/" class="back-link" aria-label="返回主页">← GAIVRT</a>
        <button class="text-button" type="button" onClick={() => setHistoryOpen(true)}>历史</button>
      </header>

      <Show when={view() === 'cast'} fallback={
        <main class="result-view">
          <section class="result-heading">
            <p class="eyebrow">{ganzi()}</p>
            <Show when={question()}><p class="result-question">「{question()}」</p></Show>
            <h1>{result()?.name}</h1>
            <p class="gua-meta">{result()?.gong}宫{result()?.tp ? ` · ${result().tp}` : ''}</p>
          </section>

          <section class="result-card" aria-label="六爻排盘">
            <For each={resultRows()}>{(row) => (
              <div class={`result-row ${row.moving ? 'moving' : ''} ${row.i === 3 ? 'outer-start' : ''}`}>
                <span class="god">{row.god}</span>
                <span class="relation">{row.relation}　{row.branch}</span>
                <span class={`yao-line ${row.isYang ? 'yang' : 'yin'}`}>{lineParts(row.isYang)}</span>
                <span class="shi-ying">{row.shiYing}</span>
                <span class="moving-mark">{row.moving ? '○' : ''}</span>
                <Show when={row.status}><span class="status">{row.status}</span></Show>
              </div>
            )}</For>
          </section>

          <Show when={result()?.bian}>
            <section class="change-card">
              <p class="eyebrow">之卦</p>
              <h2>{result().bian.name}</h2>
              <p>{result().bian.gong}宫</p>
              <div class="change-list">
                <For each={result().dong}>{(i: number) => (
                  <p><span>{YAO_POS[i]}爻</span>{result().q6[i]} {result().qx[i].substring(2)} <b>→</b> {result().bian.qin6[i]} {result().bian.qinx[i].substring(2)}</p>
                )}</For>
              </div>
            </section>
          </Show>

          <Show when={result()?.shiYingRel || result()?.features?.length}>
            <section class="notes-card">
              <p class="eyebrow">卦象提示</p>
              <p>{result()?.shiYingRel}</p>
              <Show when={result()?.features}><p>{result().features}</p></Show>
            </section>
          </Show>

          <p class="disclaimer">本页仅作传统文化研究与个人参考，不替代医疗、法律或财务等专业意见。</p>
          <button class="primary-button" type="button" onClick={reset}>重新起卦</button>
        </main>
      }>
        <main class="cast-view">
          <section class="cast-heading">
            <p class="eyebrow">纳甲排盘</p>
            <h1>六爻</h1>
            <p class="date-label">{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' }).format(new Date())}</p>
          </section>

          <Show when={yaos().length === 0} fallback={
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
              <p class="progress-label">{result() ? `${result().name} · ${result().gong}宫` : `第 ${yaos().length} / 6 爻`}</p>
            </section>
          }>
            <section class="question-stage">
              <label for="liuyao-question">你想问什么？</label>
              <input id="liuyao-question" value={question()} onInput={(e) => setQuestion(e.currentTarget.value)} maxlength="125" placeholder={EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]} />
              <p>思定而问 · 一事一占</p>
            </section>
          </Show>

          <footer class="cast-actions">
            <Show when={yaos().length < 6} fallback={<button class="primary-button" type="button" onClick={openResult}>查看排盘</button>}>
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
