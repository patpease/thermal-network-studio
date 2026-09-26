/**
 * A number typed in display units and stored canonical SI. The unit is
 * printed on the field — an entry box with no unit is a bug waiting to be
 * found (Heat Balance Studio's sketch box).
 *
 * Holds its own text while typing, so a half-typed "1." is not rewritten to
 * "1" under the cursor; commits every value that parses and is in range.
 */
import { useEffect, useId, useState } from 'react';

import { fromDisplay, LABELS, toDisplay } from '../units/units';
import type { Quantity, UnitSystem } from '../units/units';
import { sig } from './format';

export interface NumberFieldProps {
  readonly label: string;
  /** Canonical SI value. */
  readonly value: number;
  readonly onChange: (si: number) => void;
  readonly units: UnitSystem;
  /** Omit for a plain count. */
  readonly quantity?: Quantity;
  /** Canonical SI limits. */
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

const shown = (p: NumberFieldProps) => {
  const v = p.quantity ? toDisplay(p.quantity, p.value, p.units) : p.value;
  return p.integer ? String(Math.round(v)) : sig(v, 3).replace(/,/g, '');
};

export function NumberField(props: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(() => shown(props));
  const [invalid, setInvalid] = useState(false);

  // Follow the value when it changes from outside (a unit switch, a
  // suggestion) — but not in answer to our own commit, which would reformat
  // what is being typed.
  const external = shown(props);
  useEffect(() => {
    setText((t) => {
      const parsed = Number(t);
      const same = props.quantity ? fromDisplay(props.quantity, parsed, props.units) : parsed;
      return Math.abs(same - props.value) <= 1e-9 * Math.max(1, Math.abs(props.value)) ? t : external;
    });
  }, [external, props.value, props.quantity, props.units]);

  const commit = (t: string) => {
    setText(t);
    const n = Number(t);
    if (t.trim() === '' || !Number.isFinite(n)) return setInvalid(true);
    const si = props.quantity ? fromDisplay(props.quantity, n, props.units) : n;
    const ok = (props.min === undefined || si >= props.min - 1e-9) && (props.max === undefined || si <= props.max + 1e-9);
    setInvalid(!ok);
    if (ok) props.onChange(props.integer ? Math.round(si) : si);
  };

  return (
    <div className="number-field">
      <label htmlFor={id} className="field-label">
        {props.label}
      </label>
      <div className="number-field__row">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          aria-invalid={invalid || undefined}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => {
            if (!invalid) setText(external);
          }}
        />
        {props.quantity && <span className="number-field__unit">{LABELS[props.units][props.quantity]}</span>}
      </div>
    </div>
  );
}
