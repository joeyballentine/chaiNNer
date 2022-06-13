import { canonicalize } from './canonical';
import {
    IntIntervalType,
    IntervalType,
    NeverType,
    NumberPrimitive,
    NumberType,
    NumericLiteralType,
    StringPrimitive,
    UnionType,
    ValueType,
} from './types';
import { union } from './union';

const interval = (min: number, max: number) => {
    if (min === max) return new NumericLiteralType(min);
    return new IntervalType(min, max);
};
const intInterval = (min: number, max: number) => {
    if (min === max) return new NumericLiteralType(min);
    return new IntIntervalType(min, max);
};

type Arg<T extends ValueType> = T | UnionType<T> | NeverType;

export type UnaryFn<T extends ValueType> = (a: Arg<T>) => Arg<T>;
export type BinaryFn<T extends ValueType> = (a: Arg<T>, b: Arg<T>) => Arg<T>;

function wrapUnary(fn: (a: StringPrimitive) => Arg<StringPrimitive>): UnaryFn<StringPrimitive>;
function wrapUnary(fn: (a: NumberPrimitive) => Arg<NumberPrimitive>): UnaryFn<NumberPrimitive>;
// eslint-disable-next-line prefer-arrow-functions/prefer-arrow-functions
function wrapUnary<T extends ValueType>(fn: (a: T) => Arg<T>): UnaryFn<T> {
    return (a) => {
        if (a.type === 'never') return NeverType.instance;
        if (a.type === 'union') return union(...a.items.map(fn)) as Arg<T>;
        return fn(a);
    };
}
function wrapBinary(
    fn: (a: StringPrimitive, b: StringPrimitive) => Arg<StringPrimitive>
): BinaryFn<StringPrimitive>;
function wrapBinary(
    fn: (a: NumberPrimitive, b: NumberPrimitive) => Arg<NumberPrimitive>
): BinaryFn<NumberPrimitive>;
// eslint-disable-next-line prefer-arrow-functions/prefer-arrow-functions
function wrapBinary<T extends ValueType>(fn: (a: T, b: T) => Arg<T>): BinaryFn<T> {
    return (a, b) => {
        if (a.type === 'never' || b.type === 'never') return NeverType.instance;
        if (a.type === 'union') {
            if (b.type !== 'union') {
                return union(...a.items.map((aItem) => fn(aItem, b))) as Arg<T>;
            }

            const items: Arg<T>[] = [];
            for (const aItem of a.items) {
                for (const bItem of b.items) {
                    items.push(fn(aItem, bItem));
                }
            }
            return union(...items) as Arg<T>;
        }
        if (b.type === 'union') {
            return union(...b.items.map((bItem) => fn(a, bItem))) as Arg<T>;
        }
        return fn(a, b);
    };
}

const addLiteral = (
    a: NumericLiteralType,
    b: NumberPrimitive
): NumberPrimitive | UnionType<NumberPrimitive> => {
    if (Number.isNaN(a.value)) return a;

    if (b.type === 'literal') return new NumericLiteralType(a.value + b.value);

    if (a.value === Infinity) {
        if (b.type === 'number' || b.min === -Infinity) {
            return new UnionType(
                canonicalize([new NumericLiteralType(NaN), new NumericLiteralType(Infinity)])
            );
        }
        return a;
    }
    if (a.value === -Infinity) {
        if (b.type === 'number' || b.max === -Infinity) {
            return new UnionType(
                canonicalize([new NumericLiteralType(NaN), new NumericLiteralType(-Infinity)])
            );
        }
        return a;
    }

    if (b.type === 'number') return NumberType.instance;

    const min = a.value + b.min;
    const max = a.value + b.max;
    if (min === max) return new NumericLiteralType(min);

    if (b.type === 'int-interval' && Number.isInteger(a.value))
        return new IntIntervalType(min, max);
    return new IntervalType(min, max);
};
export const add = wrapBinary((a: NumberPrimitive, b: NumberPrimitive) => {
    if (a.type === 'literal') return addLiteral(a, b);
    if (b.type === 'literal') return addLiteral(b, a);

    if (a.type === 'number' || b.type === 'number') return NumberType.instance;

    const min = a.min + b.min;
    const max = a.max + b.max;
    if (min === max) return new NumericLiteralType(min);

    if (a.type === 'int-interval' && b.type === 'int-interval')
        return new IntIntervalType(min, max);
    return new IntervalType(min, max);
});
export const negate = wrapUnary((n: NumberPrimitive) => {
    if (n.type === 'number') return NumberType.instance;
    if (n.type === 'interval') return new IntervalType(-n.max, -n.min);
    if (n.type === 'int-interval') return new IntIntervalType(-n.max, -n.min);
    return new NumericLiteralType(-n.value);
});
export const subtract: BinaryFn<NumberPrimitive> = (a, b) => add(a, negate(b));

export const round = wrapUnary((n: NumberPrimitive) => {
    if (n.type === 'literal') return new NumericLiteralType(Math.round(n.value));
    if (n.type === 'int-interval') return n;
    if (n.type === 'number')
        return new UnionType(
            canonicalize([
                new NumericLiteralType(NaN),
                new NumericLiteralType(-Infinity),
                new NumericLiteralType(Infinity),
                new IntIntervalType(-Infinity, Infinity),
            ])
        );

    const min = Math.round(n.min);
    const max = Math.round(n.max);
    if (min === max) return new NumericLiteralType(min);
    if (Number.isFinite(min) && Number.isFinite(max)) return new IntIntervalType(min, max);

    const items: NumberPrimitive[] = [new IntIntervalType(min, max)];
    if (min === -Infinity) items.push(new NumericLiteralType(-Infinity));
    if (max === Infinity) items.push(new NumericLiteralType(Infinity));
    return new UnionType(canonicalize(items));
});

const minimumLiteral = (
    a: NumericLiteralType,
    b: NumberPrimitive
): NumberPrimitive | UnionType<NumberPrimitive> => {
    if (Number.isNaN(a.value)) return a;
    if (a.value === Infinity) return b;

    if (b.type === 'literal') return new NumericLiteralType(Math.min(a.value, b.value));
    if (b.type === 'number')
        return new UnionType(
            canonicalize([new NumericLiteralType(NaN), interval(-Infinity, a.value)])
        );

    if (a.value <= b.min) return a;
    if (b.max <= a.value) return b;

    if (b.type === 'int-interval') {
        const aInt = Math.floor(a.value);
        if (aInt === a.value) return new IntIntervalType(b.min, aInt);
        if (aInt === b.min)
            return new UnionType(
                canonicalize([new NumericLiteralType(b.min), new NumericLiteralType(a.value)])
            );
        return new UnionType(
            canonicalize([new IntIntervalType(b.min, aInt), new NumericLiteralType(a.value)])
        );
    }

    return interval(b.min, a.value);
};
const minimumNumber = (
    a: NumberType,
    b: NumberType | IntervalType | IntIntervalType
): NumberPrimitive | UnionType<NumberPrimitive> => {
    if (b.type === 'number') return NumberType.instance;
    if (b.max === Infinity) return NumberType.instance;
    return new UnionType(canonicalize([new NumericLiteralType(NaN), interval(-Infinity, b.max)]));
};
const minimumIntInterval = (
    a: IntIntervalType,
    b: IntervalType | IntIntervalType
): NumberPrimitive | UnionType<NumberPrimitive> => {
    if (a.max <= b.min) return a;
    if (b.max <= a.min) return b;

    if (b.type === 'int-interval')
        return new IntIntervalType(Math.min(a.min, b.min), Math.min(a.max, b.max));

    if (b.min <= a.min) return new IntervalType(b.min, Math.min(a.max, b.max));

    // This part is kind of difficult. The integer interval part is smaller than the real interval
    // part. This means that the result will be a union.
    // E.g. minimum(int(0..100), 5.5..8.5) => int(0..5) | 5.5..8.5

    const intMax = Number.isInteger(b.min) ? b.min - 1 : Math.floor(b.min);
    return new UnionType(
        canonicalize([intInterval(a.min, intMax), interval(b.min, Math.min(a.max, b.max))])
    );
};
export const minimum = wrapBinary((a: NumberPrimitive, b: NumberPrimitive) => {
    if (a.type === 'literal') return minimumLiteral(a, b);
    if (b.type === 'literal') return minimumLiteral(b, a);

    if (a.type === 'number') return minimumNumber(a, b);
    if (b.type === 'number') return minimumNumber(b, a);

    if (a.type === 'int-interval') return minimumIntInterval(a, b);
    if (b.type === 'int-interval') return minimumIntInterval(b, a);

    return new IntervalType(Math.min(a.min, b.min), Math.min(a.max, b.max));
});
export const maximum: BinaryFn<NumberPrimitive> = (a, b) => negate(minimum(negate(a), negate(b)));
