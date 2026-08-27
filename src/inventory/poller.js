import { fetchInventory } from '../api/inventory';

// 在庫の定期取得だけを担当する。DOM には触れず、取得結果は
// onUpdate / onError で外へ渡すだけにしてある。
// こうしておくと表示側を差し替えても、また将来 SSE へ乗り換えても、
// 「いつ取りに行くか」の判断はこのファイルだけの問題で済む。

// 既定の取得間隔。在庫は 1 日数件しか動かないので、これ以上詰めても意味がない。
export const DEFAULT_INTERVAL_MS = 30 * 1000;

// バックオフの上限。障害が長引いても、放置タブが 5 分に 1 回以上は叩かないようにする。
export const MAX_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 在庫ポーラーを生成する。
 *
 * @param {Object}   [opts]
 * @param {number}   [opts.intervalMs] 通常時の取得間隔（ミリ秒）
 * @param {Function} [opts.onUpdate]   取得成功時に {updatedAt, rooms} を受け取る
 * @param {Function} [opts.onError]    取得失敗時に Error を受け取る（stale 表示などに使う）
 * @returns {{start: Function, stop: Function, refreshNow: Function}}
 */
export function createInventoryPoller(opts = {}) {
  const {
    intervalMs = DEFAULT_INTERVAL_MS,
    onUpdate = null,
    onError = null,
  } = opts;

  const baseIntervalMs = intervalMs;

  let running = false;
  let timerId = null;
  // 応答待ちかどうか。遅い回線で取得が間隔より長引いたとき、
  // 同じリクエストを積み増して自分でサーバーを詰まらせないために見る。
  let inFlight = false;
  let currentIntervalMs = baseIntervalMs;
  // 停止のたびに進める世代番号。飛行中の応答が「いつの start のものか」を
  // 判別できないと、stop 後に届いた応答で onUpdate を呼んでしまう。
  let generation = 0;

  // 停止している理由を、原因ごとに別々の状態として持つ。
  // 1 つの真偽値にまとめると、タブに戻った瞬間にオフラインのままでも
  // 再開してしまう（またはその逆）。「両方とも解けたときだけ動かす」を
  // 表現できるよう、理由の数だけフラグを分ける。
  let pausedByVisibility = false;
  let pausedByOffline = false;

  // 非ブラウザ環境（テストなど）でも読み込めるよう、有無を確かめてから触る。
  const canUseVisibility = typeof document !== 'undefined';
  const canUseNetworkStatus = typeof window !== 'undefined';

  function readHidden() {
    return canUseVisibility && document.visibilityState === 'hidden';
  }

  function readOffline() {
    // navigator.onLine は「未対応なら true」が既定。判定できない環境で
    // 止めてしまわないよう、明示的に false のときだけオフラインとみなす。
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  // 停止理由がひとつでも立っているか。
  function isPaused() {
    return pausedByVisibility || pausedByOffline;
  }

  function clearTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  // 次回を予約する。setInterval ではなく毎回 setTimeout を張り直すのは、
  // 間隔がバックオフで変わるうえ、取得完了を待たずに次が走るのを避けるため。
  function schedule() {
    clearTimer();
    // 停止中・休止中は予約しない。ここが唯一の入口なので取りこぼしがない。
    if (!running || isPaused()) return;
    timerId = setTimeout(tick, currentIntervalMs);
  }

  async function tick() {
    // タイマー由来で入ってきた場合、この時点で予約は消化済み。
    timerId = null;

    // 予約後・待機中に stop / 非表示 / オフラインになっている可能性があるので、
    // 実行直前にもう一度見る。
    if (!running || isPaused()) return;

    // 前回が未解決なら新規リクエストは出さず、次の枠に回すだけにする。
    if (inFlight) {
      schedule();
      return;
    }

    // 応答が返った時点で世代が変わっていれば、その結果は捨てる。
    const myGeneration = generation;
    inFlight = true;

    try {
      const snapshot = await fetchInventory();
      // stop 済みの通信で onUpdate を呼ばないための関門。
      if (myGeneration !== generation) return;

      // 成功したら間隔を通常へ戻す。復旧後も遅いままだと在庫が古く見え続ける。
      currentIntervalMs = baseIntervalMs;
      if (onUpdate) onUpdate(snapshot);
    } catch (err) {
      if (myGeneration !== generation) return;

      // 失敗が続くほど間隔を倍にする。落ちているサーバーを等間隔で叩き続けない。
      currentIntervalMs = Math.min(currentIntervalMs * 2, MAX_INTERVAL_MS);
      if (onError) onError(err);
    } finally {
      // 世代が変わっていれば、その後始末はすでに stop / start 側で済んでいる。
      if (myGeneration === generation) {
        inFlight = false;
        schedule();
      }
    }
  }

  // タイマーを潰してから即時実行する。潰さないと、予約済みのタイマーが
  // そのまま生き残って取得が二重に走る。
  function runNow() {
    clearTimer();
    return tick();
  }

  // 停止理由が増減したときの共通処理。
  // 「止める」は理由が 1 つでもあれば無条件、「再開する」は理由がすべて
  // 解けたときだけ。片方の解除で動き出さないのは、この非対称性による。
  function applyPauseChange() {
    if (isPaused()) {
      clearTimer();
      return;
    }
    // すべての理由が解けた。次の予約を待たずに取りに行く。
    // 止まっていた間に在庫が動いており、待たせると古い数字を見せたままになる。
    runNow();
  }

  function handleVisibilityChange() {
    if (!running) return;

    // 見えていない画面のために通信しない。バックグラウンドタブは
    // どうせ setTimeout がスロットルされ、間隔も当てにならない。
    const hidden = readHidden();
    if (hidden === pausedByVisibility) return;

    pausedByVisibility = hidden;
    applyPauseChange();
  }

  function handleOffline() {
    if (!running || pausedByOffline) return;

    // 回線が無い状態で叩いても失敗するだけ。バックオフの間隔を
    // 無駄に伸ばしてしまい、復帰後の初回取得まで遅くなる。
    pausedByOffline = true;
    applyPauseChange();
  }

  function handleOnline() {
    if (!running || !pausedByOffline) return;

    pausedByOffline = false;
    applyPauseChange();
  }

  /**
   * 取得を開始する。まず 1 回取得してから定期実行に入る。
   */
  function start() {
    // 二重起動の防止。呼び出し側が増えたときに、タイマーが二本走って
    // 間隔もバックオフも壊れるのを防ぐ。
    if (running) return;

    running = true;
    inFlight = false;
    // 前回の失敗を引きずらないよう、開始時は必ず通常間隔から。
    currentIntervalMs = baseIntervalMs;

    // 開始時点の状況を読み取る。裏タブやオフラインで開かれることもあるので、
    // 「イベントが来るまで動いている」前提にはしない。
    pausedByVisibility = readHidden();
    pausedByOffline = readOffline();

    if (canUseVisibility) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (canUseNetworkStatus) {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    // 初回は間隔を待たずに取得する。待つと最初の 1 回ぶん画面が空のままになる。
    runNow();
  }

  /**
   * 取得を停止し、タイマーとリスナを解除する。
   * 停止後は、飛行中だった通信が完了しても onUpdate / onError は呼ばれない。
   */
  function stop() {
    if (!running) return;

    running = false;
    // 世代を進めることで、飛行中の応答をすべて「前の世代のもの」にして捨てる。
    // 通信自体は止められないので、結果を無視できる形にしておくしかない。
    generation += 1;
    inFlight = false;
    pausedByVisibility = false;
    pausedByOffline = false;

    clearTimer();
    // リスナを残すと、停止したはずのポーラーがタブ復帰や回線復帰で動き出す。
    if (canUseVisibility) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (canUseNetworkStatus) {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  }

  /**
   * 次の予約を待たずに即時取得する（「最新の情報に更新」ボタンなど）。
   * 停止中は何もしない。再開は start() で行う。
   *
   * @returns {Promise<void>} 取得完了で解決する（テストや二度押し抑止に使える）
   */
  function refreshNow() {
    if (!running) return Promise.resolve();
    return runNow();
  }

  return { start, stop, refreshNow };
}
