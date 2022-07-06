import { assertType, sameNumber } from '../util';
import { isSameStructType } from './type-util';
import { Type, ValueType } from './types';

const valueIsSubsetOf = (left: ValueType, right: ValueType): boolean => {
    if (left.underlying === 'number' && right.underlying === 'number') {
        if (right.type === 'number') return true;
        if (left.type === 'number') return false;

        // literals
        if (left.type === 'literal') {
            if (right.type === 'literal') return sameNumber(left.value, right.value);
            return right.has(left.value);
        }
        if (right.type === 'literal') return false;

        // int intervals
        if (left.type === 'int-interval') {
            return right.min <= left.min && left.max <= right.max;
        }
        if (right.type === 'int-interval') return false;

        // intervals
        return right.min <= left.min && left.max <= right.max;
    }

    if (left.underlying === 'string' && right.underlying === 'string') {
        if (right.type === 'string') return true;
        if (left.type === 'string') return false;
        return left.value === right.value;
    }

    if (left.underlying === 'struct' && right.underlying === 'struct') {
        if (!isSameStructType(left, right)) return false;

        for (let i = 0; i < left.fields.length; i += 1) {
            const l = left.fields[i].type;
            const r = right.fields[i].type;
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            if (!isSubsetOf(l, r)) return false;
        }
        return true;
    }

    return false;
};

export const isSubsetOf = (left: Type, right: Type): boolean => {
    if (left.type === 'never') return true;
    if (right.type === 'any') return true;
    if (right.type === 'never') return false;
    if (left.type === 'any') return false;

    if (left.type === 'union') return left.items.every((item) => isSubsetOf(item, right));

    // At this point, left is a value, so this is correct.
    assertType<ValueType>(left);
    if (right.type === 'union') return right.items.some((item) => isSubsetOf(left, item));

    return valueIsSubsetOf(left, right);
};
