import { constants } from 'fs';
import fs from 'fs/promises';
import { LocalStorage } from 'node-localstorage';
import { v4 as uuid4, v5 as uuid5 } from 'uuid';
import type { InputId, NodeSchema, OutputId } from './common-types';

export const EMPTY_ARRAY: readonly never[] = [];
export const EMPTY_SET: ReadonlySet<never> = new Set<never>();
export const EMPTY_MAP: ReadonlyMap<never, never> = new Map<never, never>();

export const noop = () => {};

export const checkFileExists = (file: string): Promise<boolean> =>
    fs.access(file, constants.F_OK).then(
        () => true,
        () => false
    );

export const assertNever = (value: never): never => {
    throw new Error(`Unreachable code path. The value ${String(value)} is invalid.`);
};
export const assertType: <T>(_: T) => void = noop;

export const deepCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export interface ParsedHandle<Id extends InputId | OutputId = InputId | OutputId> {
    nodeId: string;
    inOutId: Id;
}
const parseHandle = (handle: string): ParsedHandle => {
    return {
        nodeId: handle.substring(0, 36), // uuid
        inOutId: Number(handle.substring(37)) as InputId | OutputId,
    };
};
export const parseSourceHandle = parseHandle as (handle: string) => ParsedHandle<OutputId>;
export const parseTargetHandle = parseHandle as (handle: string) => ParsedHandle<InputId>;

export const getLocalStorage = (): Storage => {
    const storage = (global as Record<string, unknown>).customLocalStorage;
    if (storage === undefined) throw new Error('Custom storage not defined');
    return storage as Storage;
};

export const getStorageKeys = (storage: Storage): string[] => {
    if (storage instanceof LocalStorage) {
        // workaround for https://github.com/lmaccherone/node-localstorage/issues/27
        // eslint-disable-next-line no-underscore-dangle
        return (storage as unknown as { _keys: string[] })._keys;
    }
    return Object.keys(storage);
};

export const createUniqueId = () => uuid4();
export const deriveUniqueId = (input: string) =>
    uuid5(input, '48f168a5-48dc-48b3-a7c7-2c3eedb08602');

export const lazy = <T>(fn: () => T): (() => T) => {
    let hasValue = false;
    let value: T;
    return () => {
        if (hasValue) return value;
        value = fn();
        hasValue = true;
        return value;
    };
};

export const debounce = (fn: () => void, delay: number): (() => void) => {
    let id: NodeJS.Timeout | undefined;
    return () => {
        if (id !== undefined) clearTimeout(id);
        id = setTimeout(fn, delay);
    };
};

export const areApproximatelyEqual = (a: number, b: number): boolean => Math.abs(a - b) < 1e-12;

export const sameNumber = (a: number, b: number): boolean =>
    a === b || (Number.isNaN(a) && Number.isNaN(b));

// eslint-disable-next-line no-nested-ternary
export const binaryCompare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export type Comparator<T> = (a: T, b: T) => number;
export const compareSequences = <T>(
    a: readonly T[],
    b: readonly T[],
    compare: Comparator<T>
): number => {
    if (a.length !== b.length) return a.length - b.length;
    for (let i = 0; i < a.length; i += 1) {
        const r = compare(a[i], b[i]);
        if (r !== 0) return r;
    }
    return 0;
};

/**
 * Sorts numbers in the order:
 * 1. -Infinity
 * 2. Negative real numbers. E.g. -2
 * 3. -0.0
 * 4. 0.0
 * 5. Positive real numbers. E.g. 2
 * 6. Infinity
 * 7. NaN
 */
export const compareNumber = (a: number, b: number): number => {
    if (a === 0 && b === 0) {
        // compare -0 and 0
        return compareNumber(1 / a, 1 / b);
    }
    if (Number.isFinite(a) && Number.isFinite(b)) {
        return a - b;
    }
    if (sameNumber(a, b)) return 0;
    if (Number.isNaN(a)) return +1;
    if (Number.isNaN(b)) return -1;
    return a - b;
};

type WithType<S, T extends string> = S extends { readonly type: T } ? S : never;
export type Visitors<State extends { readonly type: string }, R> = {
    [K in State['type']]: (state: WithType<State, K>) => R;
};
export const visitByType = <State extends { readonly type: string }, R>(
    state: State,
    visitors: Visitors<State, R>
): R => {
    const v = (visitors as Record<string, unknown>)[state.type] as (state: State) => R;
    return v(state);
};

/**
 * Tries to topologically sort the given graph. If the graph contains cycles, `undefined` will be
 * returned.
 */
export const topologicalSort = <T>(
    allNodes: Iterable<T>,
    getOut: (node: T) => Iterable<T>
): T[] | undefined => {
    // https://en.wikipedia.org/wiki/Topological_sorting#Depth-first_search
    const unmarked = new Set(allNodes);
    const permanentMark = new Set<T>();
    const tempMark = new Set<T>();

    let cyclic = false;
    const result: T[] = [];

    const visit = (node: T): void => {
        if (permanentMark.has(node)) return;
        if (tempMark.has(node)) {
            cyclic = true;
            return;
        }

        unmarked.delete(node);
        tempMark.add(node);
        for (const out of getOut(node)) {
            visit(out);
        }
        tempMark.delete(node);
        permanentMark.add(node);
        result.push(node);
    };

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (!cyclic && unmarked.size > 0) {
        const [first] = unmarked;
        visit(first);
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (cyclic) return undefined;
    return result.reverse();
};

export const isStartingNode = (schema: NodeSchema) => {
    return !schema.inputs.some((i) => i.hasHandle);
};
