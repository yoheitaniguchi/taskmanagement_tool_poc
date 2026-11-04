// 状態を useReducer で持ち、変わるたびに localStorage へ自動保存する（docs/design.md 6.3。既存PoC のやり方を移したもの）。
// - 起動時に保存データを検証し、読めなければ自動保存を止める（空の状態で上書きしない）。
//   検証済みのデータを読み込むか、保存データを消去したら再開する
// - 別のタブで、この名前空間のどれかのキーが変わったら、このタブを読み取り専用にする（黙って上書きしないため）
// - このブラウザの設定（端末名・書き出しと読み込みの記録）も、ここで読み書きする（読み取り専用のタブでは書かない）
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { shouldAutosave } from "../domain/autosave";
import {
  clearStorage,
  getBrowserStorage,
  isDataKey,
  loadDeviceMeta,
  loadFromStorage,
  readCorruptBackup,
  readUnreadableState,
  saveDeviceMeta,
  saveToStorage,
  serializeExport,
  exportFileName,
  storageUsage,
  type LoadResult,
} from "../domain/persistence";
import { initialRoot, reducer, type Action } from "../domain/reducer";
import { changedSinceTransfer, emptyDeviceMeta, markChanged, markExported, markImported, stateFingerprint, type DeviceMeta } from "../domain/transfer";
import { emptyState, type ExportFile } from "../domain/types";

export interface StorageStatus {
  /** このブラウザで保存領域を使えない（プライベートモードの制限など） */
  unavailable: boolean;
  /** 起動時に保存データを読めなかった（回復するまで自動保存は止まっている） */
  corrupt: { errors: string[]; backedUp: boolean } | null;
  /** 起動後に、正しいデータを読み込む・消去するなどして、自動保存を再開した */
  recovered: boolean;
  /** 直近の自動保存の失敗 */
  saveError: string | null;
  /** 別のタブで保存データが変わった（このタブは読み取り専用） */
  readOnly: boolean;
}

/** 状態を変えたことに数えない操作（読み込み・消去・表示の切替） */
const NOT_A_CHANGE: ReadonlySet<Action["type"]> = new Set(["replaceState", "reset", "dismissUndo", "forgetUndo"]);

export function usePersistedState() {
  const [initial] = useState<{ load: LoadResult | null; meta: DeviceMeta }>(() => {
    const storage = getBrowserStorage();
    if (!storage) return { load: null, meta: emptyDeviceMeta() };
    return { load: loadFromStorage(storage), meta: loadDeviceMeta(storage) };
  });

  const [root, dispatchRaw] = useReducer(reducer, undefined, () =>
    initialRoot(initial.load?.kind === "ok" ? initial.load.state : emptyState()),
  );
  const rootRef = useRef(root);
  rootRef.current = root;
  const [meta, setMeta] = useState<DeviceMeta>(initial.meta);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const [recovered, setRecovered] = useState(false);
  /**
   * 起動時に読めなかった保存データが、まだ元のキーに残っている（回復していない）。
   * この間の画面の状態は空なので、「今のデータ」として書き出させない（空のファイルを本物のバックアップと誤らないため）
   */
  const unreadable = initial.load?.kind === "corrupt" && !recovered;
  const unreadableRef = useRef(unreadable);
  unreadableRef.current = unreadable;
  const savedState = useRef(root.state);
  /** 消去の直後の空の状態は保存しない（消したキーを作り直さないため） */
  const skipNextSave = useRef(false);

  const autosave = shouldAutosave({
    storageAvailable: initial.load !== null,
    corruptAtStart: initial.load?.kind === "corrupt",
    recovered,
    changedInOtherTab: readOnly,
  });

  useEffect(() => {
    // 起動直後の状態や、保存済みの状態は保存し直さない
    if (skipNextSave.current) {
      skipNextSave.current = false;
      savedState.current = root.state;
      return;
    }
    if (!autosave || savedState.current === root.state) return;
    const storage = getBrowserStorage();
    if (!storage) return;
    const result = saveToStorage(storage, root.state);
    if (result.ok) savedState.current = root.state;
    setSaveError(result.ok ? null : result.error);
  }, [root.state, autosave]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!isDataKey(e.key)) return;
      setReadOnly(true);
      dispatchRaw({ type: "forgetUndo" });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** ブラウザの設定を変えて保存する（読み取り専用のタブでは変えない） */
  const updateMeta = useCallback((next: DeviceMeta): boolean => {
    if (readOnlyRef.current) return false;
    metaRef.current = next;
    setMeta(next);
    saveDeviceMeta(getBrowserStorage(), next);
    return true;
  }, []);

  /** 状態を変える。反映したら true（読み取り専用のタブ、またはドメインの関数・検証で受け付けられなかったら false） */
  const dispatch = useCallback(
    (action: Action): boolean => {
      if (readOnlyRef.current) return false;
      const before = rootRef.current;
      const after = reducer(before, action);
      if (after === before) return false;
      rootRef.current = after;
      dispatchRaw(action);
      if (after.state !== before.state && !NOT_A_CHANGE.has(action.type)) updateMeta(markChanged(metaRef.current, new Date()));
      return true;
    },
    [updateMeta],
  );

  /** 読み込んだファイルで置き換える（ファイルは parseExportText で検証済みのもの） */
  const importFile = useCallback(
    (file: ExportFile): boolean => {
      if (readOnlyRef.current) return false;
      const before = rootRef.current;
      const after = reducer(before, { type: "replaceState", state: file.state });
      if (after === before) return false;
      rootRef.current = after;
      dispatchRaw({ type: "replaceState", state: file.state });
      setRecovered(true);
      updateMeta(markImported(metaRef.current, file, stateFingerprint(after.state), new Date()));
      return true;
    },
    [updateMeta],
  );

  /** 書き出す JSON とファイル名を作り、書き出したことを記録する。端末名が無い・読み取り専用・読めなかった保存データが残っているなら null */
  const prepareExport = useCallback((deviceName?: string): { fileName: string; text: string; at: string } | null => {
    const name = deviceName ?? metaRef.current.deviceName;
    if (readOnlyRef.current || unreadableRef.current || name === null) return null;
    const now = new Date();
    const state = rootRef.current.state;
    const text = serializeExport(state, name, now);
    updateMeta(markExported(metaRef.current, stateFingerprint(state), now));
    return { fileName: exportFileName(name, now), text, at: now.toISOString() };
  }, [updateMeta]);

  const setDeviceName = useCallback((name: string) => updateMeta({ ...metaRef.current, deviceName: name }), [updateMeta]);

  /**
   * 「このブラウザの保存データを消去」。この名前空間のキーをすべて消し、画面の状態も空にする（消した後にメモリ上の状態を書き戻さない）。
   * 読み取り専用のタブでは消さない（別のタブが保存した最新のデータを消してしまうため）
   */
  const clearSavedData = useCallback((): boolean => {
    if (readOnlyRef.current) return false;
    const storage = getBrowserStorage();
    if (storage) clearStorage(storage);
    const empty = emptyDeviceMeta();
    metaRef.current = empty;
    setMeta(empty);
    setRecovered(true);
    rootRef.current = reducer(rootRef.current, { type: "reset" });
    skipNextSave.current = true;
    dispatchRaw({ type: "reset" });
    return true;
  }, []);

  const fingerprint = useMemo(() => stateFingerprint(root.state), [root.state]);

  const status: StorageStatus = {
    unavailable: initial.load === null,
    corrupt: initial.load?.kind === "corrupt" ? { errors: initial.load.errors, backedUp: initial.load.backedUp } : null,
    recovered,
    saveError,
    readOnly,
  };

  return {
    root,
    dispatch,
    importFile,
    prepareExport,
    setDeviceName,
    clearSavedData,
    meta,
    // 読めなかった保存データが残っている間は、空の画面の状態と比べても意味が無いので「変更あり」にしない
    changed: !unreadable && changedSinceTransfer(meta, fingerprint),
    /** 今のデータを書き出せないときの理由（書き出せるなら null。端末名が無いのは、書き出しの前に名前を決めるので理由にしない） */
    exportBlocked: readOnly ? "このタブは読み取り専用です" : unreadable ? "保存データを読めなかったため、今のデータは空です" : null,
    status,
    readCorruptBackup: () => readCorruptBackup(getBrowserStorage()),
    /** 読めなかった保存データ（元のキーの値そのまま）。回復した後は null */
    readUnreadable: () => (unreadableRef.current ? readUnreadableState(getBrowserStorage()) : null),
    storageUsage: () => storageUsage(getBrowserStorage()),
  };
}
